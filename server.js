const express=require('express');
const path=require('path');
const fs=require('fs');
const multer=require('multer');
const session=require('express-session');
const crypto=require('crypto');
const {createClient}=require('@libsql/client');

const app=express();
const PORT=process.env.PORT||3000;
const ROOT=__dirname;

// Keep uploads/storage behavior
const DATA_DIR=process.env.DATA_DIR || (process.env.RENDER ? '/var/data' : ROOT);
fs.mkdirSync(DATA_DIR,{recursive:true});
const UPLOADS=path.join(DATA_DIR,'uploads');
fs.mkdirSync(UPLOADS,{recursive:true});

app.use(express.json({limit:'8mb'}));
app.use(express.urlencoded({extended:true,limit:'8mb'}));

app.use(session({
  secret:process.env.SESSION_SECRET||'change-this-secret',
  resave:false,
  saveUninitialized:false,
  cookie:{
    httpOnly:true,
    sameSite:'lax',
    secure:process.env.NODE_ENV==='production',
    maxAge:7*24*3600*1000
  }
}));

app.use('/uploads',express.static(UPLOADS));
app.use(express.static(path.join(ROOT,'store')));
app.use('/admin',express.static(path.join(ROOT,'admin')));

// =========================
// TURSO DATABASE
// =========================

if(!process.env.TURSO_DATABASE_URL||!process.env.TURSO_AUTH_TOKEN){
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN.');
  process.exit(1);
}

const db=createClient({
  url:process.env.TURSO_DATABASE_URL,
  authToken:process.env.TURSO_AUTH_TOKEN
});

async function all(sql,args=[]){
  const r=await db.execute({sql,args});
  return r.rows.map(row=>Object.fromEntries(Object.entries(row)));
}

async function get(sql,args=[]){
  const rows=await all(sql,args);
  return rows[0]||undefined;
}

async function run(sql,args=[]){
  const r=await db.execute({sql,args});
  return {
    changes:Number(r.rowsAffected||0),
    lastInsertRowid:Number(r.lastInsertRowid||0)
  };
}

async function exec(sql){
  await db.executeMultiple(sql);
}

async function getSettings(){
  const rows=await all('SELECT key,value FROM settings');
  return Object.fromEntries(rows.map(r=>[r.key,r.value]));
}

// =========================
// DATABASE INITIALIZATION
// =========================

async function initDb(){

  await exec(`
    CREATE TABLE IF NOT EXISTS settings(
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS products(
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
    );

    CREATE TABLE IF NOT EXISTS orders(
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
    );

    CREATE TABLE IF NOT EXISTS agents(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      whatsapp TEXT,
      messenger_url TEXT,
      active INTEGER DEFAULT 1
    );
  `);

  // =========================
  // TURSO MIGRATION
  // =========================
  // IF tables already existed in Turso with an older structure,
  // CREATE TABLE IF NOT EXISTS does NOT add new columns.
  // So we check existing columns and add only missing ones.

  const migrations={
    products:{
      name:'TEXT',
      price:'REAL',
      old_price:'REAL DEFAULT 0',
      category:'TEXT',
      description:'TEXT',
      tags:'TEXT',
      image:'TEXT',
      featured:'INTEGER DEFAULT 0',
      is_new:'INTEGER DEFAULT 0',
      created_at:'TEXT DEFAULT CURRENT_TIMESTAMP'
    },

    orders:{
      customer_name:'TEXT',
      phone:'TEXT',
      address:'TEXT',
      payment_method:'TEXT',
      payment_number:'TEXT',
      transaction_id:'TEXT',
      total:'REAL',
      status:"TEXT DEFAULT 'Pending'",
      items_json:'TEXT',
      created_at:'TEXT DEFAULT CURRENT_TIMESTAMP'
    },
    agents:{
      name:'TEXT',
      whatsapp:'TEXT',
      messenger_url:'TEXT',
      active:'INTEGER DEFAULT 1'
    }
  };

  for(const [table,columns] of Object.entries(migrations)){
    const existingRows=await all(`PRAGMA table_info(${table})`);
    const existing=new Set(existingRows.map(x=>String(x.name)));

    for(const [column,type] of Object.entries(columns)){
      if(!existing.has(column)){
        console.log(`TURSO MIGRATION: adding ${table}.${column}`);
        await exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      }
    }
  }

  console.log('TURSO DATABASE: connected and initialized.');
}

// =========================
// DEFAULTS
// =========================

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
    .update(process.env.ADMIN_PASSWORD||'admin123')
    .digest('hex'),

  ...quickDefaults
};

// =========================
// HELPERS
// =========================

async function seedDefaults(){
  for(const[k,v] of Object.entries(defaults)){
    await run(
      'INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',
      [k,String(v)]
    );
  }
}

function auth(req,res,next){
  if(!req.session.admin){
    return res.status(401).json({error:'Admin login required'});
  }
  next();
}

function bool(v){
  return v===true||v==='true'||v==='1'||v===1;
}

function money(v){
  return '৳'+Number(v||0).toLocaleString('en-BD');
}

function publicId(id){
  return 'SAR-'+String(id).padStart(6,'0');
}

function activePayments(s){
  return ['bkash','nagad','rocket']
    .filter(k=>s[k+'_enabled']==='1'&&s[k+'_number'])
    .map(k=>({
      method:k[0].toUpperCase()+k.slice(1),
      number:s[k+'_number']
    }));
}

function normalizePayment(v){
  v=String(v||'').trim().toLowerCase();

  if(v==='bkash')return'Bkash';
  if(v==='nagad')return'Nagad';
  if(v==='rocket')return'Rocket';

  if(['cod','cash','cash on delivery'].includes(v)){
    return'Cash on Delivery';
  }

  return String(v||'').trim();
}

function resetChat(req){
  req.session.chatState={order:null};
}

function greeting(msg){
  return /^(salam|assalam|assalamu|আসসালাম|হাই|হ্যালো|hello|hi)\b/i
    .test(String(msg||'').trim());
}

function catalogText(products){
  return products
    .map(p=>
      `ID ${p.id}: ${p.name} | ৳${p.price} | old ৳${p.old_price||0} | category ${p.category} | tags ${p.tags} | ${p.description}`
    )
    .join('\n');
}

function mimeFromPath(file){
  const ext=path.extname(file).toLowerCase();

  if(ext==='.png')return'image/png';
  if(ext==='.webp')return'image/webp';
  if(ext==='.gif')return'image/gif';

  return'image/jpeg';
}

// =========================
// UPLOAD
// =========================

const upload=multer({
  storage:multer.diskStorage({
    destination:(r,f,cb)=>cb(null,UPLOADS),

    filename:(r,f,cb)=>
      cb(
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
// OPENAI
// =========================

async function openAIJson(system,user,images=[]){

  const key=process.env.OPENAI_API_KEY;

  if(!key)return null;

  const model=process.env.OPENAI_MODEL||'gpt-5.6-luna';

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
    throw new Error('AI provider request failed');
  }

  const d=await r.json();

  const text=d.output_text||'';

  const cleaned=text
    .replace(/^```json\s*/i,'')
    .replace(/\s*```$/,'')
    .trim();

  return JSON.parse(cleaned);
}

// =========================
// START
// =========================

async function start(){

  await initDb();
  await seedDefaults();

  const pc=await get(
    'SELECT COUNT(*) c FROM products'
  );

  if(Number(pc?.c||0)===0){

    const q=`
      INSERT INTO products(
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
      VALUES(?,?,?,?,?,?,?,?,?)
    `;

    await run(q,[
      'Katan Silk Saree',
      2490,
      2990,
      'Katan',
      'Elegant Katan silk saree with premium finish.',
      'katan,silk,festive',
      '/assets/product-placeholder.svg',
      1,
      1
    ]);

    await run(q,[
      'Jamdani Saree',
      1890,
      2290,
      'Jamdani',
      'Classic Jamdani-inspired weave for timeless occasions.',
      'jamdani,classic',
      '/assets/product-placeholder.svg',
      1,
      0
    ]);

    await run(q,[
      'Organza Saree',
      2190,
      2590,
      'Organza',
      'Lightweight organza saree with refined border.',
      'organza,party',
      '/assets/product-placeholder.svg',
      0,
      1
    ]);

    await run(q,[
      'Cotton Saree',
      1490,
      1790,
      'Cotton',
      'Comfortable breathable saree for everyday elegance.',
      'cotton,tangail',
      '/assets/product-placeholder.svg',
      0,
      0
    ]);
  }
  
  // =========================
  // HEALTH
  // =========================

  app.get('/health',(req,res)=>
    res.json({
      ok:true,
      service:'SAREE',
      database:'turso'
    })
  );

  // =========================
  // PUBLIC SETTINGS
  // =========================

  app.get('/api/settings',async(req,res)=>{
    try{
      const s=await getSettings();

      delete s.admin_password_hash;

      res.json(s);
    }catch(e){
      res.status(500).json({error:e.message});
    }
  });

  // =========================
  // PUBLIC PRODUCTS
  // =========================

  app.get('/api/products',async(req,res)=>{

    try{

      const {category,search}=req.query;

      let sql='SELECT * FROM products WHERE 1=1';
      const a=[];

      if(category&&category!=='all'){
        sql+=' AND category=?';
        a.push(category);
      }

      if(search){
        sql+=`
          AND (
            name LIKE ?
            OR tags LIKE ?
            OR category LIKE ?
            OR description LIKE ?
          )
        `;

        const q='%'+search+'%';

        a.push(q,q,q,q);
      }

      sql+=' ORDER BY featured DESC,is_new DESC,id DESC';

      res.json(await all(sql,a));

    }catch(e){
      res.status(500).json({error:e.message});
    }

  });

  app.get('/api/products/:id',async(req,res)=>{

    try{

      const p=await get(
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
      res.status(500).json({error:e.message});
    }

  });

  // =========================
  // AGENTS
  // =========================

  app.get('/api/agents',async(req,res)=>{
    try{
      res.json(
        await all(
          'SELECT * FROM agents WHERE active=1 ORDER BY id DESC'
        )
      );
    }catch(e){
      res.status(500).json({error:e.message});
    }
  });

  // =========================
  // ORDERS
  // =========================

  app.post('/api/orders',async(req,res)=>{

    try{

      const {
        customer_name,
        phone,
        address,
        payment_method,
        payment_number,
        transaction_id,
        items
      }=req.body||{};

      if(
        !customer_name||
        !phone||
        !address||
        !payment_method||
        !Array.isArray(items)||
        !items.length
      ){
        return res.status(400).json({
          error:'সব required তথ্য দিন।'
        });
      }

      const s=await getSettings();

      const pm=normalizePayment(payment_method);

      const allowed=[
        'Cash on Delivery',
        ...activePayments(s).map(x=>x.method)
      ];

      if(!allowed.includes(pm)){
        return res.status(400).json({
          error:'এই payment method এখন available নয়।'
        });
      }

      let total=0;
      const finalItems=[];

      for(const item of items){

        const p=await get(
          'SELECT * FROM products WHERE id=?',
          [Number(item.id)]
        );

        if(!p){
          return res.status(400).json({
            error:'একটি product পাওয়া যায়নি।'
          });
        }

        const qty=Math.max(
          1,
          Number(item.qty||item.quantity||1)
        );

        total+=Number(p.price)*qty;

        finalItems.push({
          id:p.id,
          name:p.name,
          price:p.price,
          qty,
          image:p.image
        });
      }

      const payNum=
        pm==='Cash on Delivery'
          ?''
          :(s[pm.toLowerCase()+'_number']||payment_number||'');

      const r=await run(
        `
        INSERT INTO orders(
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
        VALUES(?,?,?,?,?,?,?,?,?)
        `,
        [
          customer_name,
          phone,
          address,
          pm,
          payNum,
          transaction_id||'',
          total,
          'Pending',
          JSON.stringify(finalItems)
        ]
      );

      res.json({
        success:true,
        order_id:publicId(r.lastInsertRowid),
        total,
        status:'Pending'
      });

    }catch(e){

      console.error(e);

      res.status(500).json({
        error:'Order failed'
      });
    }

  });

  // =========================
  // ORDER TRACK
  // =========================

  app.get('/api/orders/track/:id',async(req,res)=>{

    try{

      const raw=String(req.params.id)
        .replace(/^SAR-/i,'');

      const o=await get(
        'SELECT id,status,total,created_at FROM orders WHERE id=?',
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
      res.status(500).json({error:e.message});
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
      res.status(500).json({error:e.message});
    }

  });

  app.post('/api/admin/logout',(req,res)=>
    req.session.destroy(()=>res.json({ok:true}))
  );

  app.get('/api/admin/me',auth,(req,res)=>
    res.json({ok:true})
  );

  // =========================
  // ADMIN DASHBOARD
  // =========================

  app.get('/api/admin/dashboard',auth,async(req,res)=>{

    try{

      const revenue=(
        await get(
          "SELECT COALESCE(SUM(total),0) revenue FROM orders WHERE status!='Cancelled'"
        )
      )?.revenue||0;

      res.json({
        revenue,
        orders:(await get(
          'SELECT COUNT(*) c FROM orders'
        ))?.c||0,

        products:(await get(
          'SELECT COUNT(*) c FROM products'
        ))?.c||0,

        agents:(await get(
          'SELECT COUNT(*) c FROM agents WHERE active=1'
        ))?.c||0
      });

    }catch(e){
      res.status(500).json({error:e.message});
    }

  });

  // =========================
  // ADMIN PRODUCTS
  // =========================

  app.get('/api/admin/products',auth,async(req,res)=>{
    try{
      res.json(
        await all(
          'SELECT * FROM products ORDER BY id DESC'
        )
      );
    }catch(e){
      res.status(500).json({error:e.message});
    }
  });

  app.post(
    '/api/admin/products',
    auth,
    upload.single('image'),
    async(req,res)=>{

      try{

        const b=req.body||{};

        if(!b.name||b.price===undefined){
          return res.status(400).json({
            error:'Product name ও price required.'
          });
        }

        const image=
          req.file
            ?'/uploads/'+req.file.filename
            :(b.image_url||b.image||'/assets/product-placeholder.svg');

        const r=await run(
          `
          INSERT INTO products(
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
          VALUES(?,?,?,?,?,?,?,?,?)
          `,
          [
            b.name.trim(),
            Number(b.price||0),
            Number(b.old_price||0),
            b.category||'General',
            b.description||'',
            b.tags||'',
            image,
            bool(b.featured)?1:0,
            bool(b.is_new)?1:0
          ]
        );

        res.json({
          success:true,
          product:await get(
            'SELECT * FROM products WHERE id=?',
            [r.lastInsertRowid]
          )
        });

      }catch(e){
        res.status(500).json({error:e.message});
      }

    }
  );

  app.put(
    '/api/admin/products/:id',
    auth,
    upload.single('image'),
    async(req,res)=>{

      try{

        const old=await get(
          'SELECT * FROM products WHERE id=?',
          [req.params.id]
        );

        if(!old){
          return res.status(404).json({
            error:'Product not found'
          });
        }

        const b=req.body||{};

        const image=
          req.file
            ?'/uploads/'+req.file.filename
            :(b.image_url||b.image||old.image);

        await run(
          `
          UPDATE products SET
            name=?,
            price=?,
            old_price=?,
            category=?,
            description=?,
            tags=?,
            image=?,
            featured=?,
            is_new=?
          WHERE id=?
          `,
          [
            b.name??old.name,
            Number(b.price??old.price),
            Number((b.old_price??old.old_price)||0),
            b.category??old.category,
   
