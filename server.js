const express=require('express');
const path=require('path');
const fs=require('fs');
const multer=require('multer');
const session=require('express-session');
const {createClient}=require('@libsql/client');
const crypto=require('crypto');

const app=express();
const PORT=process.env.PORT||3000;
const ROOT=__dirname;

// Upload files are still stored in DATA_DIR.
// Turso stores the database data.
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

app.use(express.json({limit:'8mb'}));
app.use(express.urlencoded({extended:true,limit:'8mb'}));

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


app.use('/uploads',express.static(UPLOADS));
app.use(express.static(path.join(ROOT,'store')));
app.use('/admin',express.static(path.join(ROOT,'admin')));


// =========================
// TURSO DATABASE
// =========================

const db=createClient({
  url:process.env.TURSO_DATABASE_URL,
  authToken:process.env.TURSO_AUTH_TOKEN
});


// Compatibility helpers for Turso
const sql={
  async get(query,args=[]){
    const r=await db.execute({
      sql:query,
      args
    });
    return r.rows[0]||undefined;
  },

  async all(query,args=[]){
    const r=await db.execute({
      sql:query,
      args
    });
    return r.rows;
  },

  async run(query,args=[]){
    const r=await db.execute({
      sql:query,
      args
    });
    return {
      lastInsertRowid:r.lastInsertRowid,
      changes:r.rowsAffected
    };
  },

  async exec(query){
    return await db.execute(query);
  }
};

// =========================
// DATABASE INITIALIZATION
// =========================

async function initDatabase(){
  

  await db.batch([
    {
      sql:`CREATE TABLE IF NOT EXISTS settings(
        key TEXT PRIMARY KEY,
        value TEXT
      )`,
      args:[]
    },

    {
      sql:`CREATE TABLE IF NOT EXISTS products(
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
      args:[]
    },

    {
      sql:`CREATE TABLE IF NOT EXISTS orders(
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
      args:[]
    },

    {
      sql:`CREATE TABLE IF NOT EXISTS agents(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        whatsapp TEXT,
        messenger_url TEXT,
        active INTEGER DEFAULT 1
      )`,
      args:[]
    }
  ]);

  const quickDefaults={
    ai_q1_title:'Delivery Time',
    ai_q1_text:'ঢাকার ভিতরে 1–2 দিন, ঢাকার বাইরে 2–4 দিন।',

    ai_q2_title:'Store Info',
    ai_q2_text:'SAREE-তে premium saree collection পাওয়া যায়—Katan, Jamdani, Organza, Cotton ও festive saree।',

    ai_q3_title:'Opening Hours',
    ai_q3_text:'প্রতিদিন সকাল 10টা থেকে রাত 10টা।',

    ai_q4_title:'Contact Agent',
    ai_q4_text:'সরাসরি WhatsApp/Messenger agent-এর সাথে কথা বলুন।',

    ai_q5_title:'Customer Reviews / Sales Proof',
    ai_q5_text:'আমাদের customer feedback ও sales proof এখানে দেখুন।',

    ai_proof_image:'/assets/product-placeholder.svg'
  };

  const defaults={
    store_name:'SAREE',
    logo:'/assets/logo-saree.png',

    delivery_promise:'ঢাকার ভিতরে 1–2 দিন, ঢাকার বাইরে 2–4 দিন',

    opening_hours:'প্রতিদিন সকাল 10টা থেকে রাত 10টা',

    store_info:'SAREE-তে premium saree collection পাওয়া যায়—Katan, Jamdani, Organza, Cotton ও festive saree।',

    bkash_number:'01812-345678',
    nagad_number:'',
    rocket_number:'',

    payment_note:'Send Money করে Transaction ID দিন।',

    bkash_enabled:'1',
    nagad_enabled:'1',
    rocket_enabled:'1',
    cod_enabled:'1',

    admin_password_hash:crypto
      .createHash('sha256')
      .update('admin123')
      .digest('hex'),

    ...quickDefaults
  };

  for(const[k,v] of Object.entries(defaults)){
async function initDatabase(){
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

        // =========================
// FILE UPLOAD
// =========================

const upload=multer({
  storage:multer.diskStorage({
    destination:(r,f,cb)=>cb(null,UPLOADS),

    filename:(r,f,cb)=>cb(
      null,
      Date.now()+'-'+
      f.originalname.replace(/[^a-zA-Z0-9._-]/g,'_')
    )
  }),

  limits:{
    fileSize:5*1024*1024
  },

  fileFilter:(req,file,cb)=>
    cb(null,/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype))
});


// =========================
// HELPERS
// =========================

async function getSettings(){

  const rows=await sql.all(
    'SELECT key,value FROM settings'
  );

  return Object.fromEntries(
    rows.map(r=>[r.key,r.value])
  );
}


function auth(req,res,next){

  if(!req.session.admin){
    return res.status(401).json({
      error:'Admin login required'
    });
  }

  next();
}


function bool(v){
  return v===true ||
         v==='true' ||
         v==='1' ||
         v===1;
}


function money(v){
  return '৳'+Number(v||0)
    .toLocaleString('en-BD');
}


function publicId(id){
  return 'SAR-'+String(id).padStart(6,'0');
}


function activePayments(s){

  return ['bkash','nagad','rocket']
    .filter(
      k=>s[k+'_enabled']==='1' &&
         s[k+'_number']
    )
    .map(
      k=>({
        method:k[0].toUpperCase()+k.slice(1),
        number:s[k+'_number']
      })
    );
}


function resetChat(req){
  req.session.chatState={
    order:null
  };
}


function mimeFromPath(file){

  const ext=path.extname(file).toLowerCase();

  return ext==='.png'
    ?'image/png'
    :ext==='.webp'
      ?'image/webp'
      :ext==='.gif'
        ?'image/gif'
        :'image/jpeg';
}


function greeting(msg){

  return /^(salam|assalam|assalamu|আসসালাম|হাই|হ্যালো|hello|hi)\b/i
    .test(msg.trim());
}

    // =========================
// PUBLIC PRODUCTS
// =========================

app.get('/api/products',async(req,res)=>{

  try{

    const{category,search}=req.query;

    let query=
      'SELECT * FROM products WHERE 1=1';

    const args=[];

    if(category && category!=='all'){

      query+=' AND category=?';
      args.push(category);
    }

    if(search){

      query+=`
        AND (
          name LIKE ?
          OR tags LIKE ?
          OR category LIKE ?
          OR description LIKE ?
        )
      `;

      const q='%'+search+'%';

      args.push(q,q,q,q);
    }

    query+=`
      ORDER BY featured DESC,
      is_new DESC,
      id DESC
    `;

    res.json(
      await sql.all(query,args)
    );

  }catch(e){

    console.error(e);

    res.status(500).json({
      error:'Database error'
    });
  }

});


app.get('/api/products/:id',async(req,res)=>{

  try{

    const p=await sql.get(
      'SELECT * FROM products WHERE id=?',
      [req.params.id]
    );

    if(!p){

      return res.status(404).json({
        error:'Product not found'
      });
    }

    res.json(p);

  }catch(e){

    console.error(e);

    res.status(500).json({
      error:'Database error'
    });
  }

});


// =========================
// ORDERS
// =========================

app.post('/api/orders',async(req,res)=>{

  try{

    const{
      customer_name,
      phone,
      address,
      payment_method,
      payment_number,
      transaction_id,
      items
    }=req.body||{};

    if(
      !customer_name ||
      !phone ||
      !address ||
      !payment_method ||
      !Array.isArray(items) ||
      !items.length
    ){

      return res.status(400).json({
        error:'সব required তথ্য দিন।'
      });
    }

    const s=await getSettings();

    const allowed=[
      'Cash on Delivery',
      ...activePayments(s).map(x=>x.method)
    ];

    if(!allowed.includes(payment_method)){

      return res.status(400).json({
        error:'এই payment method এখন available নয়।'
      });
    }

    const cleanItems=[];
    let total=0;

    for(const item of items){

      const id=Number(item?.id);

      const qty=Math.max(
        1,
        Math.min(
          99,
          Number(item?.qty||1)
        )
      );

      const p=await sql.get(
        'SELECT id,name,price,image FROM products WHERE id=?',
        [id]
      );

      if(!p){

        return res.status(400).json({
          error:'একটি product আর available নেই। Cart update করে আবার চেষ্টা করুন।'
        });
      }

      cleanItems.push({
        id:p.id,
        name:p.name,
        price:p.price,
        qty,
        image:p.image
      });

      total+=Number(p.price)*qty;
    }

    const payNum=
      payment_method==='Cash on Delivery'
        ?''
        :(s[payment_method.toLowerCase()+'_number']||'');

    const r=await sql.run(
      `INSERT INTO orders
      (
        customer_name,
        phone,
        address,
        payment_method,
        payment_number,
        transaction_id,
        total,
        status,
        items_json
      )
      VALUES(?,?,?,?,?,?,?,?,?)`,
      [
        customer_name,
        phone,
        address,
        payment_method,
        payNum,
        transaction_id||'',
        total,
        'Pending',
        JSON.stringify(cleanItems)
      ]
    );
    const orderId=Number(r.lastInsertRowid);

    res.json({
      ok:true,
      order_id:orderId,
      public_id:publicId(orderId),
      total
    });

  }catch(e){

    console.error(e);

    res.status(500).json({
      error:'Order save failed'
    });
  }

});


app.get('/api/orders/track/:id',async(req,res)=>{

  try{

    const raw=String(req.params.id)
      .replace(/^SAR-/i,'');

    const o=await sql.get(
      `SELECT id,status,total,created_at
       FROM orders
       WHERE id=?`,
      [Number(raw)]
    );

    if(!o){

      return res.status(404).json({
        error:'Order not found'
      });
    }

    res.json({
      ...o,
      public_id:publicId(o.id)
    });

  }catch(e){

    console.error(e);

    res.status(500).json({
      error:'Database error'
    });
  }

});


// =========================
// ADMIN AUTH
// =========================

app.post('/api/admin/login',async(req,res)=>{

  try{

    const s=await getSettings();

    const hash=crypto
      .createHash('sha256')
      .update(String(req.body.password||''))
      .digest('hex');

    if(hash!==s.admin_password_hash){

      return res.status(401).json({
        error:'Wrong password'
      });
    }

    req.session.admin=true;

    res.json({
      ok:true
    });

  }catch(e){

    console.error(e);

    res.status(500).json({
      error:'Database error'
    });
  }

});


app.post('/api/admin/logout',(req,res)=>
  req.session.destroy(()=>
    res.json({ok:true})
  )
);


app.get('/api/admin/me',auth,(req,res)=>
  res.json({ok:true})
);


// =========================
// ADMIN DASHBOARD
// =========================

app.get('/api/admin/dashboard',auth,async(req,res)=>{

  try{

    const revenue=await sql.get(
      `SELECT COALESCE(SUM(total),0) AS revenue
       FROM orders
       WHERE status!='Cancelled'`
    );

    const orders=await sql.get(
      'SELECT COUNT(*) AS c FROM orders'
    );

    const products=await sql.get(
      'SELECT COUNT(*) AS c FROM products'
    );

    const agents=await sql.get(
      'SELECT COUNT(*) AS c FROM agents WHERE active=1'
    );

    res.json({
      revenue:revenue?.revenue||0,
      orders:orders?.c||0,
      products:products?.c||0,
      agents:agents?.c||0
    });

  }catch(e){

    console.error(e);

    res.status(500).json({
      error:'Database error'
    });
  }

});

  // =========================
// ADMIN PRODUCTS
// =========================

app.get('/api/admin/products',auth,async(req,res)=>{

  try{

    res.json(
      await sql.all(
        'SELECT * FROM products ORDER BY id DESC'
      )
    );

  }catch(e){

    console.error(e);

    res.status(500).json({
      error:'Database error'
    });
  }

});


app.post(
  '/api/admin/products',
  auth,
  upload.single('image'),
  async(req,res)=>{

    try{

      const b=req.body;

      const image=req.file
        ?'/uploads/'+req.file.filename
        :(b.image_url||'/assets/product-placeholder.svg');

      const r=await sql.run(
        `INSERT INTO products
        (
          name,
          price,
          old_price,
          category,
          description,
          tags,
          image,
          featured,
          is_new
        )
        VALUES(?,?,?,?,?,?,?,?,?)`,
        [
          b.name,
          Number(b.price),
          Number(b.old_price||0),
          b.category||'Saree',
          b.description||'',
          b.tags||'',
          image,
          bool(b.featured)?1:0,
          bool(b.is_new)?1:0
        ]
      );

      res.json({
        ok:true,
        id:Number(r.lastInsertRowid)
      });

    }catch(e){

      console.error(e);

      res.status(500).json({
        error:'Product save failed'
      });
    }

  }
);


app.put(
  '/api/admin/products/:id',
  auth,
  upload.single('image'),
  async(req,res)=>{

    try{

      const old=await sql.get(
        'SELECT * FROM products WHERE id=?',
        [req.params.id]
      );

      if(!old){

        return res.status(404).json({
          error:'Product not found'
        });
      }

      const b=req.body;

      const image=req.file
        ?'/uploads/'+req.file.filename
        :(b.image_url||old.image);

      await sql.run(
        `UPDATE products SET
        name=?,
        price=?,
        old_price=?,
        category=?,
        description=?,
        tags=?,
        image=?,
        featured=?,
        is_new=?
        WHERE id=?`,
        [
          b.name,
          Number(b.price),
          Number(b.old_price||0),
          b.category||'Saree',
          b.description||'',
          b.tags||'',
          image,
          bool(b.featured)?1:0,
          bool(b.is_new)?1:0,
          req.params.id
        ]
      );

      res.json({
        ok:true
      });

    }catch(e){

      console.error(e);

      res.status(500).json({
        error:'Product update failed'
      });
    }

  }
);


app.delete('/api/admin/products/:id',auth,async(req,res)=>{

  try{

    await sql.run(
      'DELETE FROM products WHERE id=?',
      [req.params.id]
    );

    res.json({
      ok:true
    });

  }catch(e){

    console.error(e);

    res.status(500).json({
      error:'Product delete failed'
    });
  }

});

      // =========================
// ADMIN ORDERS
// =========================

app.get('/api/admin/orders',auth,async(req,res)=>{

  try{

    res.json(
      await sql.all(
        'SELECT * FROM orders ORDER BY id DESC'
      )
    );

  }catch(e){

    console.error(e);

    res.status(500).json({
      error:'Database error'
    });
  }

});


app.patch('/api/admin/orders/:id',auth,async(req,res)=>{

  try{

    const allowed=[
      'Pending',
      'Confirmed',
      'Processing',
      'Shipped',
      'Delivered',
      'Cancelled'
    ];

    if(!allowed.includes(req.body.status)){

      return res.status(400).json({
        error:'Invalid status'
      });
    }

    await sql.run(
      'UPDATE orders SET status=? WHERE id=?',
      [
        req.body.status,
        req.params.id
      ]
    );

    res.json({
      ok:true
    });

  }catch(e){

    console.error(e);

    res.status(500).json({
      error:'Order update failed'
    });
  }

});

// =========================
// ADMIN AGENTS
// =========================

app.get('/api/admin/agents',auth,async(req,res)=>{

  try{

    res.json(
      await sql.all(
        'SELECT * FROM agents ORDER BY id DESC'
      )
    );

  }catch(e){

    console.error(e);

    res.status(500).json({
      error:'Database error'
    });
  }

});


app.post('/api/admin/agents',auth,async(req,res)=>{

  try{

    const b=req.body;

    const r=await sql.run(
      `INSERT INTO agents
      (name,whatsapp,messenger_url,active)
      VALUES(?,?,?,?)`,
      [
        b.name,
        b.whatsapp,
        b.messenger_url||'',
        bool(b.active)?1:0
      ]
    );

    res.json({
      ok:true,
      id:Number(r.lastInsertRowid)
    });

  }catch(e){

    console.error(e);

    res.status(500).json({
      error:'Agent save failed'
    });
  }

});


app.put('/api/admin/agents/:id',auth,async(req,res)=>{

  try{

    const b=req.body;

    await sql.run(
      `UPDATE agents SET
      name=?,
      whatsapp=?,
      messenger_url=?,
      active=?
      WHERE id=?`,
      [
        b.name,
        b.whatsapp,
        b.messenger_url||'',
        bool(b.active)?1:0,
        req.params.id
      ]
    );

    res.json({
      ok:true
    });

  }catch(e){

    console.error(e);

    res.status(500).json({
      error:'Agent update failed'
    });
  }

});


app.delete('/api/admin/agents/:id',auth,async(req,res)=>{

  try{

    await sql.run(
      'DELETE FROM agents WHERE id=?',
      [req.params.id]
    );

    res.json({
      ok:true
    });

  }catch(e){

    console.error(e);

    res.status(500).json({
      error:'Agent delete failed'
    });
  }

});

  // =========================
// ADMIN SETTINGS
// =========================

app.get('/api/admin/settings',auth,async(req,res)=>{

  try{

    res.json(
      await getSettings()
    );

  }catch(e){

    console.error(e);

    res.status(500).json({
      error:'Database error'
    });
  }

});


app.put('/api/admin/settings',auth,async(req,res)=>{

  try{

    const b=req.body||{};

    for(const[k,v] of Object.entries(b)){

      if(k==='admin_password_hash')continue;

      await sql.run(
        `INSERT INTO settings(key,value)
         VALUES(?,?)
         ON CONFLICT(key)
         DO UPDATE SET value=excluded.value`,
        [
          k,
          String(bool(v)?'1':v)
        ]
      );
    }

    res.json({
      ok:true,
      settings:await getSettings()
    });

  }catch(e){

    console.error(e);

    res.status(500).json({
      error:'Settings update failed'
    });
  }

});


app.put('/api/admin/password',auth,async(req,res)=>{

  try{

    if(!req.body.password){

      return res.status(400).json({
        error:'Password required'
      });
    }

    const hash=crypto
      .createHash('sha256')
      .update(String(req.body.password))
      .digest('hex');

    await sql.run(
      `UPDATE settings
       SET value=?
       WHERE key='admin_password_hash'`,
      [hash]
    );

    res.json({
      ok:true
    });

  }catch(e){

    console.error(e);

    res.status(500).json({
      error:'Password update failed'
    });
  }

});

  // =========================
// ADMIN AI PRODUCT IMPORT
// =========================

app.post(
  '/api/admin/ai-product',
  auth,
  upload.single('image'),
  async(req,res)=>{

    const image=req.file
      ?'/uploads/'+req.file.filename
      :(req.body.image_url||'/assets/product-placeholder.svg');

    let preview={
      name:'Premium Saree',
      price:Number(req.body.price||1990),
      category:req.body.category||'Saree',
      description:req.body.description||
        'Premium saree with elegant finishing, suitable for festive and special occasions.',
      tags:req.body.tags||
        'saree,premium,festive',
      image
    };

    if(process.env.OPENAI_API_KEY&&req.file){

      try{

        const data=
          'data:'+
          req.file.mimetype+
          ';base64,'+
          fs.readFileSync(req.file.path).toString('base64');

        const ai=await openAIJson(
          'You are SAREE product-import assistant. Analyze the uploaded saree image and suggest a concise product name, category, Bengali-friendly product description, and comma-separated tags. If a price/category/description/tags is supplied by the admin, respect it. Never claim exact fabric/color facts you cannot see. Return ONLY JSON with keys name, category, description, tags.',

          `Admin supplied price: ${req.body.price||'not provided'}
Admin category: ${req.body.category||'not provided'}
Admin description: ${req.body.description||'not provided'}
Admin tags: ${req.body.tags||'not provided'}`,

          [data]
        );

        if(ai){

          preview={
            ...preview,
            name:ai.name||preview.name,
            category:ai.category||preview.category,
            description:ai.description||preview.description,
            tags:ai.tags||preview.tags
          };
        }

      }catch(e){

        console.error(
          'AI product import:',
          e.message
        );
      }
    }

    res.json({
      preview
    });
  }
);


// =========================
// AI SHOPPING QUICK SETUP IMAGE
// =========================

app.post(
  '/api/admin/ai-setup-image',
  auth,
  upload.single('image'),
  async(req,res)=>{

    try{

      if(!req.file){

        return res.status(400).json({
          error:'Image required'
        });
      }

      const url='/uploads/'+req.file.filename;

      await sql.run(
        `INSERT INTO settings(key,value)
         VALUES(?,?)
         ON CONFLICT(key)
         DO UPDATE SET value=excluded.value`,
        [
          'ai_proof_image',
          url
        ]
      );

      res.json({
        ok:true,
        url,
        settings:await getSettings()
      });

    }catch(e){

      console.error(e);

      res.status(500).json({
        error:'Image setup failed'
      });
    }

  }
);

  // =========================
// OPENAI
// =========================

async function openAIJson(
  system,
  user,
  images=[]
){

  const key=process.env.OPENAI_API_KEY;

  if(!key)return null;

  const model=
    process.env.OPENAI_MODEL||
    'gpt-5.6-luna';

  const content=[
    {
      type:'input_text',
      text:user
    }
  ];

  for(const img of images){

    content.push({
      type:'input_image',
      image_url:img
    });
  }

  const body={
    model,
    input:[
      {
        role:'system',
        content:[
          {
            type:'input_text',
            text:system
          }
        ]
      },
      {
        role:'user',
        content
      }
    ],
    max_output_tokens:900
  };

  const r=await fetch(
    'https://api.openai.com/v1/responses',
    {
      method:'POST',
      headers:{
        'Authorization':'Bearer '+key,
        'Content-Type':'application/json'
      },
      body:JSON.stringify(body)
    }
  );

  if(!r.ok){

    throw new Error(
      'AI provider request failed'
    );
  }

  const d=await r.json();

  const text=d.output_text||'';

  const cleaned=text
    .replace(/^```json\s*/i,'')
    .replace(/\s*```$/,'')
    .trim();

  return JSON.parse(cleaned);
}


function catalogText(products){

  return products
    .map(
      p=>`ID ${p.id}: ${p.name} | ৳${p.price} | old ৳${p.old_price||0} | category ${p.category} | tags ${p.tags} | ${p.description}`
    )
    .join('\n');
}


// =========================
// CHAT
// =========================

app.post('/api/chat',async(req,res)=>{

  const msg=String(
    req.body.message||''
  ).trim();

  if(!msg){

    return res.status(400).json({
      error:'Message required'
    });
  }

  try{

    const s=await getSettings();

    const products=await sql.all(
      `SELECT * FROM products
       ORDER BY featured DESC,
       is_new DESC,
       id DESC`
    );

    if(!req.session.chatState){
      resetChat(req);
    }

    const state=req.session.chatState;

    const quick=[
      s.ai_q1_title,
      s.ai_q2_title,
      s.ai_q3_title,
      s.ai_q4_title,
      s.ai_q5_title
    ].filter(Boolean);

    if(greeting(msg)){

      return res.json({
        reply:
          `আসসালামু আলাইকুম ❤️ SAREE-তে আপনাকে স্বাগতম। আমি SAREE-এর shopping assistant। শাড়ি দেখা, availability, price, delivery বা সরাসরি order করতে আমাকে বলুন।`,
        quick
      });
    }


    const qMap=[
      [s.ai_q1_title,s.delivery_promise],
      [s.ai_q2_title,s.store_info],
      [s.ai_q3_title,s.opening_hours],
      [s.ai_q4_title,s.ai_q4_text],
      [s.ai_q5_title,s.ai_q5_text]
    ];

    for(const[q,a] of qMap){

      if(
        q &&
        msg.toLowerCase()===
        String(q).toLowerCase()
      ){

        return res.json({
          reply:a,
          proof_image:
            msg.toLowerCase()===
            String(s.ai_q5_title).toLowerCase()
              ?s.ai_proof_image
              :'',
          quick
        });
      }
    }


    const catalog=catalogText(products);

    const payments=activePayments(s)
      .map(
        x=>x.method+' '+x.number
      )
      .join(', ');


    const system=
`You are the official SAREE saree-store shopping assistant. Never say demo website. Always call the store SAREE. Be accurate and never invent a product, price, availability, payment number, delivery time or policy.

Catalog:
${catalog}

Store info:
${s.store_info}

Opening hours:
${s.opening_hours}

Delivery:
${s.delivery_promise}

Payments:
${payments}${s.cod_enabled==='1'?', Cash on Delivery':''}

Payment note:
${s.payment_note}

Current order state JSON:
${JSON.stringify(state.order||{})}

Return ONLY JSON with keys:
reply, intent, product_id, quantity, name, phone, address, payment_method, transaction_id, confirm.

intent can be:
info, product, order, tracking, agent, other.

If the user wants to order, use the catalog product id.

If required order fields are missing, ask for the next missing field.

Ask for confirmation before creating an order.`;


    try{

      const ai=await openAIJson(
        system,
        msg
      );

      if(ai){

        if(ai.product_id){

          const p=products.find(
            x=>x.id===Number(ai.product_id)
          );

          if(p){

            state.order=
              state.order||{};

            state.order.product_id=p.id;

            state.order.quantity=
              Math.max(
                1,
                Number(
                  ai.quantity||
                  state.order.quantity||
                  1
                )
              );
          }
        }


        for(
          const k of [
            'name',
            'phone',
            'address',
            'payment_method',
            'transaction_id'
          ]
        ){

          if(ai[k]){

            state.order=
              state.order||{};

            state.order[k]=ai[k];
          }
        }


        if(
          ai.intent==='order'||
          state.order
        ){

          const o=state.order||{};

          const p=products.find(
            x=>x.id===Number(o.product_id)
          );


          if(!p&&ai.intent==='order'){

            ai.reply=
              'কোন productটি order করতে চান? নাম বা product-এর ছবি পাঠান।';

          }

          else if(p&&!o.name){

            ai.reply=
              `${p.name} — ${money(p.price)}। Order করতে আপনার নাম দিন।`;

          }

          else if(p&&!o.phone){

            ai.reply=
              'আপনার mobile number দিন।';

          }

          else if(p&&!o.address){

            ai.reply=
              'Delivery address দিন।';

          }

          else if(p&&!o.payment_method){

            ai.reply=
              'Payment method বলুন: '+
              payments+
              (s.cod_enabled==='1'
                ?', COD'
                :'')+
              '।';

          }

          else if(
            p &&
            o.payment_method &&
            o.payment_method!=='Cash on Delivery' &&
            !o.transaction_id
          ){

            ai.reply=
              `${o.payment_method} payment number: ${s[o.payment_method.toLowerCase()+'_number']||''}। Payment করে Transaction ID দিন।`;
          }

          else if(
            p &&
            ai.confirm===true
          ){

            const total=
              p.price*
              Math.max(
                1,
                Number(o.quantity||1)
              );

            const payNum=
              o.payment_method==='Cash on Delivery'
                ?''
                :(s[o.payment_method.toLowerCase()+'_number']||'');


            const r=await sql.run(
              `INSERT INTO orders
              (
                customer_name,
                phone,
                address,
                payment_method,
                payment_number,
                transaction_id,
                total,
                status,
                items_json
              )
              VALUES(?,?,?,?,?,?,?,?,?)`,
              [
                o.name,
                o.phone,
                o.address,
                o.payment_method,
                payNum,
                o.transaction_id||'',
                total,
                'Pending',
                JSON.stringify([
                  {
                    id:p.id,
                    name:p.name,
                    price:p.price,
                    qty:o.quantity||1,
                    image:p.image
                  }
                ])
              ]
            );


            const orderId=
              Number(r.lastInsertRowid);

            resetChat(req);

            return res.json({
              reply:
                `অর্ডার সফলভাবে নেওয়া হয়েছে ❤️
Order ID: ${publicId(orderId)}
${p.name} × ${o.quantity||1}
মোট: ${money(total)}
Status: Pending`,

              order_id:
                publicId(orderId),

              quick
            });
          }

          state.order=o;

          req.session.save(()=>{});
        }

        return res.json({
          reply:
            ai.reply||
            'অবশ্যই ❤️ কীভাবে সাহায্য করতে পারি?',
          quick
        });
      }

    }catch(e){

      console.error(
        'AI error:',
        e.message
      );
    }

      // =========================
    // DETERMINISTIC FALLBACK
    // =========================

    const lower=
      msg.toLowerCase();

    const yes=
      /^(yes|হ্যাঁ|জি|confirm|নিশ্চিত|ঠিক আছে|ok|okay)$/i
      .test(msg);

    const o=state.order;


    if(o&&o.product_id){

      const p=products.find(
        x=>x.id===Number(o.product_id)
      );

      if(p){

        if(
          !o.name &&
          /^(order|অর্ডার|buy|কিনবো|নেব)/i
            .test(msg)
        ){

          return res.json({
            reply:
              `${p.name} order করতে আপনার নাম দিন।`,
            quick
          });
        }


        if(
          !o.name &&
          !/^(order|অর্ডার|buy|কিনবো|নেব)/i
            .test(msg)
        ){

          o.name=msg;

          return res.json({
            reply:
              'ধন্যবাদ ❤️ এখন আপনার mobile number দিন।',
            quick
          });
        }


        if(o.name&&!o.phone){

          const phone=
            msg.replace(/\s+/g,'');

          if(
            /01[3-9]\d{8}/.test(phone)||
            /\d{10,14}/.test(phone)
          ){

            o.phone=msg;

            return res.json({
              reply:
                'এখন আপনার পূর্ণ delivery address দিন।',
              quick
            });
          }

          return res.json({
            reply:
              'একটি valid mobile number দিন, যেমন 01XXXXXXXXX।',
            quick
          });
        }


        if(
          o.name&&
          o.phone&&
          !o.address
        ){

          o.address=msg;

          return res.json({
            reply:
              'Payment method বলুন: '+
              activePayments(s)
                .map(x=>x.method)
                .join(', ')+
              (s.cod_enabled==='1'
                ?', Cash on Delivery'
                :'')+
              '।',
            quick
          });
        }


        if(
          o.name&&
          o.phone&&
          o.address&&
          !o.payment_method
        ){

          const pm=
            lower.includes('bkash')
              ?'bKash'
              :lower.includes('nagad')
                ?'Nagad'
                :lower.includes('rocket')
                  ?'Rocket'
                  :(
                    lower.includes('cod')||
                    lower.includes('cash')||
                    lower.includes('ক্যাশ')
                  )
                    ?'Cash on Delivery'
                    :'';

          if(pm){

            o.payment_method=pm;

            if(pm!=='Cash on Delivery'){

              return res.json({
                reply:
                  `${pm} number: ${s[pm.toLowerCase()+'_number']||''}। Payment করে Transaction ID দিন।`,
                quick
              });
            }

            return res.json({
              reply:
                `Order summary: ${p.name} × ${o.quantity||1}, ${money(p.price*(o.quantity||1))}, COD। Confirm করতে “হ্যাঁ” লিখুন।`,
              quick
            });
          }

          return res.json({
            reply:
              'Payment method বলুন: '+
              activePayments(s)
                .map(x=>x.method)
                .join(', ')+
              (s.cod_enabled==='1'
                ?', Cash on Delivery'
                :'')+
              '।',
            quick
          });
        }


        if(
          o.payment_method &&
          o.payment_method!=='Cash on Delivery' &&
          !o.transaction_id
        ){

          o.transaction_id=msg;

          return res.json({
            reply:
              `Order summary: ${p.name} × ${o.quantity||1}, ${money(p.price*(o.quantity||1))}, ${o.payment_method}। Confirm করতে “হ্যাঁ” লিখুন।`,
            quick
          });
        }


        if(yes){

          const total=
            p.price*
            Math.max(
              1,
              Number(o.quantity||1)
            );

          const payNum=
            o.payment_method==='Cash on Delivery'
              ?''
              :(s[o.payment_method.toLowerCase()+'_number']||'');


          const r=await sql.run(
            `INSERT INTO orders
            (
              customer_name,
              phone,
              address,
              payment_method,
              payment_number,
              transaction_id,
              total,
              status,
              items_json
            )
            VALUES(?,?,?,?,?,?,?,?,?)`,
            [
              o.name,
              o.phone,
              o.address,
              o.payment_method,
              payNum,
              o.transaction_id||'',
              total,
              'Pending',
              JSON.stringify([
                {
                  id:p.id,
                  name:p.name,
                  price:p.price,
                  qty:o.quantity||1,
                  image:p.image
                }
              ])
            ]
          );


          const orderId=
            Number(r.lastInsertRowid);

          resetChat(req);

          return res.json({
            reply:
              `অর্ডার সফলভাবে নেওয়া হয়েছে ❤️ Order ID: ${publicId(orderId)}
মোট: ${money(total)}
Status: Pending`,

            order_id:
              publicId(orderId),

            quick
          });
        }
      }
    }


    if(
      lower.includes('delivery')||
      lower.includes('ডেলিভারি')
    ){

      return res.json({
        reply:s.delivery_promise,
        quick
      });
    }


    if(
      lower.includes('open')||
      lower.includes('সময়')||
      lower.includes('hours')
    ){

      return res.json({
        reply:s.opening_hours,
        quick
      });
    }


    if(
      lower.includes('agent')||
      lower.includes('যোগাযোগ')||
      lower.includes('contact')
    ){

      return res.json({
        reply:s.ai_q4_text,
        quick
      });
    }


    const cleanedSearch=
      lower
        .replace(
          /saree|শাড়ি|দাম|price|কত/g,
          ''
        )
        .trim();


    const hit=products.find(
      p=>
        (
          p.name+' '+
          p.category+' '+
          p.tags
        )
        .toLowerCase()
        .includes(cleanedSearch)
    );


    if(hit){

      state.order={
        product_id:hit.id,
        quantity:1
      };

      return res.json({
        reply:
          `${hit.name} available আছে ❤️ Price ${money(hit.price)}। Order করতে চাইলে “order” লিখুন।`,
        product:hit,
        quick
      });
    }


    if(
      lower.includes('order')||
      lower.includes('অর্ডার')
    ){

      state.order=
        state.order||{};

      return res.json({
        reply:
          'অবশ্যই ❤️ কোন Sareeটি order করতে চান? নাম লিখুন বা product-এর ছবি পাঠান।',
        quick
      });
    }


    return res.json({
      reply:
        `Welcome to SAREE ❤️ ${s.ai_q2_text}`,
      quick
    });

  }catch(e){

    console.error(
      'Chat error:',
      e
    );

    res.status(500).json({
      error:'Server error'
    });
  }

});

            // =========================
// PRODUCT PHOTO MATCHING
// =========================

app.post(
  '/api/chat-image',
  upload.single('image'),
  async(req,res)=>{

    if(!req.file){

      return res.status(400).json({
        error:'Image required'
      });
    }

    try{

      const products=await sql.all(
        `SELECT * FROM products
         ORDER BY featured DESC,
         is_new DESC,
         id DESC`
      );

      const data=
        'data:'+
        req.file.mimetype+
        ';base64,'+
        fs.readFileSync(req.file.path)
          .toString('base64');


      const catalogImageInputs=[];

      for(
        const p of products.slice(0,20)
      ){

        try{

          if(
            String(p.image||'')
              .startsWith('/uploads/')
          ){

            const fp=
              path.join(
                UPLOADS,
                path.basename(p.image)
              );

            if(fs.existsSync(fp)){

              catalogImageInputs.push(
                'data:'+
                mimeFromPath(fp)+
                ';base64,'+
                fs.readFileSync(fp)
                  .toString('base64')
              );
            }
          }

        }catch{}
      }


      const system=
`You are SAREE's product image matcher. Compare the customer's uploaded photo with the live SAREE catalog and the catalog images supplied after the text. Only return a product_id that is actually in the catalog. Do not invent availability.

Return ONLY JSON:
{"product_id":number|null,"confidence":"high|medium|low","reply":"short Bengali reply"}

Catalog:
${catalogText(products)}`;


      try{

        const ai=await openAIJson(
          system,
          'Check this customer product photo against the SAREE catalog.',
          [
            data,
            ...catalogImageInputs
          ]
        );

        const p=products.find(
          x=>x.id===Number(ai?.product_id)
        );

        if(p){

          req.session.chatState=
            req.session.chatState||
            {order:null};

          req.session.chatState.order={
            product_id:p.id,
            quantity:1
          };

          return res.json({
            reply:
              `ছবিটি দেখে মনে হচ্ছে আমাদের catalog-এর **${p.name}**-এর সাথে match করছে। Price ${money(p.price)}। Order করতে চাইলে “order” লিখুন।`,

            product:p,

            confidence:
              ai.confidence
          });
        }

        return res.json({
          reply:
            'এই ছবির সাথে আমাদের current catalog-এ নিশ্চিত match পাইনি। চাইলে অন্য product-এর ছবি দিন।'
        });

      }catch(e){

        const filename=
          req.file.originalname
            .toLowerCase();

        const p=products.find(
          x=>
            (
              x.name+' '+
              x.category+' '+
              x.tags
            )
            .toLowerCase()
            .split(/\s+/)
            .some(
              t=>
                t.length>3 &&
                filename.includes(t)
            )
        );

        if(p){

          req.session.chatState=
            req.session.chatState||
            {order:null};

          req.session.chatState.order={
            product_id:p.id,
            quantity:1
          };

          return res.json({
            reply:
              `ছবির filename/catalog তথ্য থেকে ${p.name} পাওয়া গেছে। Price ${money(p.price)}। Order করতে “order” লিখুন।`,

            product:p,

            confidence:'low'
          });
        }

        return res.json({
          reply:
            'ছবিটি পেয়েছি ❤️ কিন্তু নিশ্চিতভাবে catalog match করা যাচ্ছে না। Admin-এর catalog-এ productটি থাকলে product-এর নাম লিখে দিন।'
        });
      }

    }catch(e){

      console.error(
        'Chat image error:',
        e
      );

      res.status(500).json({
        error:'Image processing failed'
      });

    }finally{

      fs.unlink(
        req.file.path,
        ()=>{}
      );
    }

  }
);


// =========================
// WEBSITE ROUTES
// =========================

app.get(
  '/admin',
  (req,res)=>
    res.sendFile(
      path.join(
        ROOT,
        'admin',
        'index.html'
      )
    )
);


app.get(
  '*',
  (req,res)=>{

    if(req.path.startsWith('/api/')){

      return res.status(404).json({
        error:'Not found'
      });
    }

    res.sendFile(
      path.join(
        ROOT,
        'store',
        'index.html'
      )
    );
  }
);


// =========================
// START SERVER
// =========================

(async()=>{

  try{

    await initDatabase();

    app.listen(
      PORT,
      ()=>console.log(
        `SAREE Store running on port ${PORT}`
      )
    );

  }catch(e){

    console.error(
      'SAREE startup failed:',
      e
    );

    process.exit(1);
  }

})();
