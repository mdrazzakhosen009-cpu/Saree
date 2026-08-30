const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const DATA_DIR = process.env.DATA_DIR || ROOT;
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {
  console.warn('Fallback to root dir for uploads');
}

const UPLOADS = path.join(ROOT, 'uploads');
try {
  fs.mkdirSync(UPLOADS, { recursive: true });
} catch (e) {}

app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 3600 * 1000
  }
}));

app.use('/uploads', express.static(UPLOADS));
app.use(express.static(path.join(ROOT, 'store')));
app.use('/admin', express.static(path.join(ROOT, 'admin')));

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

const sql = {
  async get(query, args = []) {
    const r = await db.execute({ sql: query, args });
    return r.rows[0] || undefined;
  },
  async all(query, args = []) {
    const r = await db.execute({ sql: query, args });
    return r.rows;
  },
  async run(query, args = []) {
    const r = await db.execute({ sql: query, args });
    return {
      lastInsertRowid: r.lastInsertRowid,
      changes: r.rowsAffected
    };
  },
  async exec(query) {
    return await db.execute(query);
  }
};

async function initDatabase() {
  await db.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS settings(
        key TEXT PRIMARY KEY,
        value TEXT
      )`,
      args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS products(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        old_price REAL DEFAULT 0,
        category TEXT,
        description TEXT,
        tags TEXT,
        image TEXT,
        featured INTEGER DEFAULT 0,
        is_new INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS orders(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT,
        phone TEXT,
        address TEXT,
        payment_method TEXT,
        payment_number TEXT,
        transaction_id TEXT,
        total REAL,
        status TEXT DEFAULT 'Pending',
        items_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS agents(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        whatsapp TEXT,
        messenger_url TEXT,
        active INTEGER DEFAULT 1
      )`,
      args: []
    }
  ]);
}

const quickDefaults = {
  ai_q1_title: 'Delivery Time',
  ai_q1_text: 'ঢাকার ভিতরে ১-২ দিন, ঢাকার বাইরে ২-৪ দিন।',
  ai_q2_title: 'Store Info',
  ai_q2_text: 'SAREE-তে premium saree collection পাওয়া যায়—Katan, Jamdani, Organza, Cotton ইত্যাদি।',
  ai_q3_title: 'Opening Hours',
  ai_q3_text: 'প্রতিদিন সকাল ১০টা থেকে রাত ১০টা।',
  ai_q4_title: 'Contact Agent',
  ai_q4_text: 'প্রয়োজনে WhatsApp/Messenger এজেন্ট-এর সাথে কথা বলুন।'
};

async function seedDefaults() {
  for (const [k, v] of Object.entries(quickDefaults)) {
    const existing = await sql.get('SELECT * FROM settings WHERE key = ?', [k]);
    if (!existing) {
      await sql.run('INSERT INTO settings (key, value) VALUES (?, ?)', [k, v]);
    }
  }
  
  // Force reset password to admin123
  const hash = crypto.createHash('sha256').update('admin123').digest('hex');
  const adminPass = await sql.get('SELECT * FROM settings WHERE key = ?', ['admin_password']);
  if (!adminPass) {
    await sql.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['admin_password', hash]);
  } else {
    await sql.run('UPDATE settings SET value = ? WHERE key = ?', [hash, 'admin_password']);
  }
}

app.get('/api/settings', async (req, res) => {
  try {
    const rows = await sql.all('SELECT * FROM settings');
    const settings = {};
    rows.forEach(r => {
      if (r.key !== 'admin_password') {
        settings[r.key] = r.value;
      }
    });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const products = await sql.all('SELECT * FROM products ORDER BY id DESC');
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { customer_name, phone, address, payment_method, payment_number, transaction_id, total, items } = req.body;
    const result = await sql.run(
      `INSERT INTO orders (customer_name, phone, address, payment_method, payment_number, transaction_id, total, items_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [customer_name, phone, address, payment_method, payment_number, transaction_id, total, JSON.stringify(items)]
    );
    res.json({ success: true, orderId: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
    const record = await sql.get('SELECT value FROM settings WHERE key = ?', ['admin_password']);
    const inputHash = crypto.createHash('sha256').update(password || '').digest('hex');
    if (record && record.value === inputHash) {
      req.session.isAdmin = true;
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, error: 'Invalid password' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/check', (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

db.execute(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`)
  .then(() => initDatabase())
  .then(() => seedDefaults())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`SAREE Store running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Database initialization error:', err);
  });
