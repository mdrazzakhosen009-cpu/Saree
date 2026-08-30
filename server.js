const express=require("express");
const path=require("path");
const fs=require("fs");
const multer=require("multer");
const session=require("express-session");
const crypto=require("crypto");
const {createClient}=require("@libsql/client");

const app=express();
const PORT=process.env.PORT||3000;
const ROOT=__dirname;
const DATA_DIR=process.env.DATA_DIR||path.join(ROOT,"data");
fs.mkdirSync(DATA_DIR,{recursive:true});
const UPLOADS=path.join(DATA_DIR,"uploads");
fs.mkdirSync(UPLOADS,{recursive:true});

app.use(express.json({limit:"8mb"}));
app.use(express.urlencoded({extended:true,limit:"8mb"}));
app.use(session({
 secret:process.env.SESSION_SECRET||"CHANGE_THIS_SESSION_SECRET",
 resave:false,saveUninitialized:false,
 cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*24*3600*1000}
}));
app.use("/uploads",express.static(UPLOADS));
app.use(express.static(path.join(ROOT,"store")));
app.use("/admin",express.static(path.join(ROOT,"admin")));

if(!process.env.TURSO_DATABASE_URL||!process.env.TURSO_AUTH_TOKEN){
 console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN.");
 process.exit(1);
}
const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});

async function all(sql,args=[]){const r=await db.execute({sql,args});return r.rows.map(row=>Object.fromEntries(Object.entries(row)));}
async function get(sql,args=[]){const rows=await all(sql,args);return rows[0]||undefined;}
async function run(sql,args=[]){const r=await db.execute({sql,args});return {changes:Number(r.rowsAffected||0),lastInsertRowid:Number(r.lastInsertRowid||0)};}
async function exec(sql){await db.executeMultiple(sql);}
async function settings(){return Object.fromEntries((await all("SELECT key,value FROM settings")).map(r=>[r.key,r.value]));}
async function initDb(){
 await exec(`
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,price REAL NOT NULL,old_price REAL DEFAULT 0,category TEXT,description TEXT,tags TEXT,image TEXT,featured INTEGER DEFAULT 0,is_new INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,customer_name TEXT,phone TEXT,address TEXT,payment_method TEXT,payment_number TEXT,transaction_id TEXT,total REAL,status TEXT DEFAULT 'Pending',items_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS agents(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,whatsapp TEXT,messenger_url TEXT,active INTEGER DEFAULT 1);
`);
}
const sha256=v=>crypto.createHash("sha256").update(String(v)).digest("hex");
const defaults={
 store_name:"SAREE",logo:"/assets/logo-saree.png",
 delivery_promise:"ঢাকার ভিতরে 1–2 দিন, ঢাকার বাইরে 2–4 দিন",
 opening_hours:"প্রতিদিন সকাল 10টা থেকে রাত 10টা",
 store_info:"SAREE-তে premium saree collection পাওয়া যায়—Katan, Jamdani, Organza, Cotton ও festive saree।",
 bkash_number:"",nagad_number:"",rocket_number:"",payment_note:"Send Money করে Transaction ID দিন।",
 bkash_enabled:"1",nagad_enabled:"1",rocket_enabled:"1",cod_enabled:"1",
 ai_q1_title:"Delivery Time",ai_q1_text:"ঢাকার ভিতরে 1–2 দিন, ঢাকার বাইরে 2–4 দিন।",
 ai_q2_title:"Store Info",ai_q2_text:"SAREE-তে premium saree collection পাওয়া যায়।",
 ai_q3_title:"Opening Hours",ai_q3_text:"প্রতিদিন সকাল 10টা থেকে রাত 10টা।",
 ai_q4_title:"Contact Agent",ai_q4_text:"সরাসরি WhatsApp/Messenger agent-এর সাথে কথা বলুন।",
 ai_q5_title:"Customer Reviews / Sales Proof",ai_q5_text:"আমাদের customer feedback ও sales proof এখানে দেখুন।",
 ai_proof_image:"/assets/product-placeholder.svg",
 admin_password_hash:sha256(process.env.ADMIN_PASSWORD||"admin123")
};

const upload=multer({
 storage:multer.diskStorage({
  destination:(r,f,cb)=>cb(null,UPLOADS),
  filename:(r,f,cb)=>cb(null,Date.now()+"-"+f.originalname.replace(/[^a-zA-Z0-9._-]/g,"_"))
 }),
 limits:{fileSize:5*1024*1024},
 fileFilter:(r,f,cb)=>cb(null,/^image\/(jpeg|png|webp|gif)$/.test(f.mimetype))
});
function auth(req,res,next){if(!req.session.admin)return res.status(401).json({error:"Admin login required"});next();}
function bool(v){return v===true||v==="true"||v==="1"||v===1;}
function money(v){return "৳"+Number(v||0).toLocaleString("en-BD");}
function orderId(id){return "SAR-"+String(id).padStart(6,"0");}
function payments(s){return ["bkash","nagad","rocket"].filter(k=>s[k+"_enabled"]==="1"&&s[k+"_number"]).map(k=>({method:k[0].toUpperCase()+k.slice(1),number:s[k+"_number"]}));}
function normalizePayment(v){v=String(v||"").trim().toLowerCase();if(v==="bkash")return"Bkash";if(v==="nagad")return"Nagad";if(v==="rocket")return"Rocket";if(["cod","cash","cash on delivery"].includes(v))return"Cash on Delivery";return String(v||"").trim();}
function greeting(m){return /^(hi|hello|hey|salam|assalamualaikum|আসসালামু আলাইকুম|সালাম|হাই|হ্যালো)[!. ]*$/i.test(String(m||"").trim());}
function catalog(ps){return ps.map(p=>`ID:${p.id} | ${p.name} | Price:${money(p.price)} | Old:${money(p.old_price)} | Category:${p.category||""} | Tags:${p.tags||""} | Description:${p.description||""}`).join("\n");}
function resetChat(req){delete req.session.saree_chat;}

async function openAIJson(system,user){
 const key=process.env.OPENAI_API_KEY;if(!key)return null;
 const r=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({
  model:process.env.OPENAI_MODEL||"gpt-4o-mini",temperature:.2,response_format:{type:"json_object"},
  messages:[{role:"system",content:system},{role:"user",content:user}]
 })});
 if(!r.ok)throw new Error("OpenAI request failed: "+r.status);
 const d=await r.json(),c=d?.choices?.[0]?.message?.content;
 return c?JSON.parse(c):null;
}

async function start(){
 await initDb();

 for(const[k,v]of Object.entries(defaults))
  await run("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)",[k,String(v)]);

 const pc=await get("SELECT COUNT(*) c FROM products");
 if(Number(pc?.c||0)===0){
  const q="INSERT INTO products(name,price,old_price,category,description,tags,image,featured,is_new) VALUES(?,?,?,?,?,?,?,?,?)";
  await run(q,["Katan Silk Saree",2490,2990,"Katan","Elegant Katan silk saree with premium finish.","katan,silk,festive","/assets/product-placeholder.svg",1,1]);
  await run(q,["Jamdani Saree",1890,2290,"Jamdani","Classic Jamdani-inspired weave for timeless occasions.","jamdani,classic","/assets/product-placeholder.svg",1,0]);
  await run(q,["Organza Saree",2190,2590,"Organza","Lightweight organza saree with refined border.","organza,party","/assets/product-placeholder.svg",0,1]);
  await run(q,["Cotton Saree",1490,1790,"Cotton","Comfortable breathable saree for everyday elegance.","cotton,tangail","/assets/product-placeholder.svg",0,0]);
 }

 app.get("/health",(req,res)=>res.json({ok:true,service:"SAREE",database:"turso"}));
 app.get("/api/settings",async(req,res)=>{try{const s=await settings();delete s.admin_password_hash;res.json(s);}catch(e){res.status(500).json({error:e.message});}});
 app.get("/api/products",async(req,res)=>{
  try{
   const {category,search}=req.query;let sql="SELECT * FROM products WHERE 1=1",a=[];
   if(category&&category!=="all"){sql+=" AND category=?";a.push(category);}
   if(search){sql+=" AND (name LIKE ? OR tags LIKE ? OR category LIKE ? OR description LIKE ?)";const q="%"+search+"%";a.push(q,q,q,q);}
   sql+=" ORDER BY featured DESC,is_new DESC,id DESC";res.json(await all(sql,a));
  }catch(e){res.status(500).json({error:e.message});}
 });
 app.get("/api/products/:id",async(req,res)=>{try{const p=await get("SELECT * FROM products WHERE id=?",[req.params.id]);if(!p)return res.status(404).json({error:"Product not found"});res.json(p);}catch(e){res.status(500).json({error:e.message});}});
 app.get("/api/agents",async(req,res)=>res.json(await all("SELECT * FROM agents WHERE active=1 ORDER BY id DESC")));

 app.post("/api/orders",async(req,res)=>{
  try{
   const {customer_name,phone,address,payment_method,payment_number,transaction_id,items}=req.body||{};
   if(!customer_name||!phone||!address||!payment_method||!Array.isArray(items)||!items.length)return res.status(400).json({error:"সব required তথ্য দিন।"});
   const s=await settings(),pm=normalizePayment(payment_method);
   const allowed=["Cash on Delivery",...payments(s).map(x=>x.method)];
   if(!allowed.includes(pm))return res.status(400).json({error:"এই payment method এখন available নয়।"});
   let total=0,finalItems=[];
   for(const item of items){
    const p=await get("SELECT * FROM products WHERE id=?",[Number(item.id)]);
    if(!p)return res.status(400).json({error:"একটি product পাওয়া যায়নি।"});
    const qty=Math.max(1,Number(item.qty||item.quantity||1));total+=Number(p.price)*qty;
    finalItems.push({id:p.id,name:p.name,price:p.price,qty,image:p.image});
   }
   const payNum=pm==="Cash on Delivery"?"":s[pm.toLowerCase()+"_number"]||payment_number||"";
   const r=await run("INSERT INTO orders(customer_name,phone,address,payment_method,payment_number,transaction_id,total,status,items_json) VALUES(?,?,?,?,?,?,?,?,?)",[customer_name,phone,address,pm,payNum,transaction_id||"",total,"Pending",JSON.stringify(finalItems)]);
   res.json({success:true,order_id:orderId(r.lastInsertRowid),total,status:"Pending"});
  }catch(e){console.error(e);res.status(500).json({error:"Order failed"});}
 });

 app.post("/api/admin/login",async(req,res)=>{
  const s=await settings(),password=String(req.body?.password||"");
  if(!password)return res.status(400).json({error:"Password দিন।"});
  if(sha256(password)!==s.admin_password_hash)return res.status(401).json({error:"Invalid admin password"});
  req.session.admin=true;res.json({success:true});
 });
 app.get("/api/admin/me",auth,(req,res)=>res.json({authenticated:true}));
 app.post("/api/admin/logout",auth,(req,res)=>req.session.destroy(()=>res.json({success:true})));

 app.get("/api/admin/dashboard",auth,async(req,res)=>{
  const revenue=(await get("SELECT COALESCE(SUM(total),0) total FROM orders WHERE status!='Cancelled'"))?.total||0;
  res.json({revenue,orders:(await get("SELECT COUNT(*) c FROM orders"))?.c||0,products:(await get("SELECT COUNT(*) c FROM products"))?.c||0,agents:(await get("SELECT COUNT(*) c FROM agents WHERE active=1"))?.c||0});
 });

 app.get("/api/admin/products",auth,async(req,res)=>res.json(await all("SELECT * FROM products ORDER BY id DESC")));
 app.post("/api/admin/products",auth,upload.single("image"),async(req,res)=>{
  try{
   const b=req.body||{};if(!b.name||b.price===undefined)return res.status(400).json({error:"Product name ও price required."});
   const image=req.file?"/uploads/"+req.file.filename:b.image_url||b.image||"/assets/product-placeholder.svg";
   const r=await run("INSERT INTO products(name,price,old_price,category,description,tags,image,featured,is_new) VALUES(?,?,?,?,?,?,?,?,?)",[b.name.trim(),Number(b.price||0),Number(b.old_price||0),b.category||"General",b.description||"",b.tags||"",image,bool(b.featured)?1:0,bool(b.is_new)?1:0]);
   res.json({success:true,product:await get("SELECT * FROM products WHERE id=?",[r.lastInsertRowid])});
  }catch(e){res.status(500).json({error:e.message});}
 });
 app.put("/api/admin/products/:id",auth,upload.single("image"),async(req,res)=>{
  try{
   const old=await get("SELECT * FROM products WHERE id=?",[req.params.id]);if(!old)return res.status(404).json({error:"Product not found"});
   const b=req.body||{},image=req.file?"/uploads/"+req.file.filename:(b.image_url||b.image||old.image);
   await run("UPDATE products SET name=?,price=?,old_price=?,category=?,description=?,tags=?,image=?,featured=?,is_new=? WHERE id=?",[b.name??old.name,Number(b.price??old.price),Number((b.old_price??old.old_price) || 0),b.category??old.category,b.description??old.description,b.tags??old.tags,image,b.featured===undefined?old.featured:bool(b.featured)?1:0,b.is_new===undefined?old.is_new:bool(b.is_new)?1:0,req.params.id]);
   res.json({success:true,product:await get("SELECT * FROM products WHERE id=?",[req.params.id])});
  }catch(e){res.status(500).json({error:e.message});}
 });
 app.delete("/api/admin/products/:id",auth,async(req,res)=>{const r=await run("DELETE FROM products WHERE id=?",[req.params.id]);if(!r.changes)return res.status(404).json({error:"Product not found"});res.json({success:true});});

 app.get("/api/admin/orders",auth,async(req,res)=>res.json(await all("SELECT * FROM orders ORDER BY id DESC")));
 app.patch("/api/admin/orders/:id",auth,async(req,res)=>{
  const ok=["Pending","Confirmed","Processing","Shipped","Delivered","Cancelled"],status=String(req.body?.status||"");
  if(!ok.includes(status))return res.status(400).json({error:"Invalid order status"});
  const r=await run("UPDATE orders SET status=? WHERE id=?",[status,req.params.id]);if(!r.changes)return res.status(404).json({error:"Order not found"});res.json({success:true});
 });

 app.get("/api/admin/agents",auth,async(req,res)=>res.json(await all("SELECT * FROM agents ORDER BY id DESC")));
 app.post("/api/admin/agents",auth,async(req,res)=>{
  const b=req.body||{};if(!b.name)return res.status(400).json({error:"Agent name required."});
  const r=await run("INSERT INTO agents(name,whatsapp,messenger_url,active) VALUES(?,?,?,?)",[b.name,b.whatsapp||"",b.messenger_url||"",bool(b.active)?1:0]);
  res.json({success:true,agent:await get("SELECT * FROM agents WHERE id=?",[r.lastInsertRowid])});
 });
 app.put("/api/admin/agents/:id",auth,async(req,res)=>{
  const old=await get("SELECT * FROM agents WHERE id=?",[req.params.id]);if(!old)return res.status(404).json({error:"Agent not found"});
  const b=req.body||{};await run("UPDATE agents SET name=?,whatsapp=?,messenger_url=?,active=? WHERE id=?",[b.name??old.name,b.whatsapp??old.whatsapp,b.messenger_url??old.messenger_url,b.active===undefined?old.active:(bool(b.active)?1:0),req.params.id]);res.json({success:true});
 });
 app.delete("/api/admin/agents/:id",auth,async(req,res)=>{const r=await run("DELETE FROM agents WHERE id=?",[req.params.id]);if(!r.changes)return res.status(404).json({error:"Agent not found"});res.json({success:true});});

 app.get("/api/admin/settings",auth,async(req,res)=>{const s=await settings();delete s.admin_password_hash;res.json(s);});
 app.put("/api/admin/settings",auth,async(req,res)=>{
  const allowed=["store_name","logo","delivery_promise","opening_hours","store_info","bkash_number","nagad_number","rocket_number","payment_note","bkash_enabled","nagad_enabled","rocket_enabled","cod_enabled","ai_q1_title","ai_q1_text","ai_q2_title","ai_q2_text","ai_q3_title","ai_q3_text","ai_q4_title","ai_q4_text","ai_q5_title","ai_q5_text","ai_proof_image"];
  for(const k of allowed)if(req.body?.[k]!==undefined){let v=req.body[k];if(["bkash_enabled","nagad_enabled","rocket_enabled","cod_enabled"].includes(k))v=bool(v)?"1":"0";await run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[k,String(v)]);}
  const s=await settings();delete s.admin_password_hash;res.json({success:true,settings:s});
 });
 app.put("/api/admin/password",auth,async(req,res)=>{
  const s=await settings(),cur=String(req.body?.current_password||""),next=String(req.body?.new_password||"");
  if(next.length<6)return res.status(400).json({error:"New password must be at least 6 characters."});
  if(sha256(cur)!==s.admin_password_hash)return res.status(401).json({error:"Current password is incorrect."});
  await run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",["admin_password_hash",sha256(next)]);
  res.json({success:true});
 });

 app.post("/api/admin/ai-product",auth,upload.single("image"),async(req,res)=>{
  const b=req.body||{},image=req.file?"/uploads/"+req.file.filename:b.image_url||"/assets/product-placeholder.svg";
  const fallback={name:b.name||"Premium Saree",price:Number(b.price||0),category:b.category||"Saree",description:b.description||"Premium saree with elegant finish.",tags:b.tags||"saree,premium,fashion",image};
  if(!process.env.OPENAI_API_KEY)return res.json({preview:fallback});
  try{
   const ai=await openAIJson("You are an expert saree e-commerce copywriter for SAREE. Never call it a demo website. Return JSON with name,price,category,description,tags. Do not invent facts.",JSON.stringify(b));
   res.json({preview:{...fallback,...ai,image}});
  }catch(e){console.error("AI PRODUCT:",e.message);res.json({preview:fallback});}
 });

 app.post("/api/admin/ai-product",auth,upload.single("image"),async(req,res)=>{
  const b=req.body||{},image=req.file?"/uploads/"+req.file.filename:b.image_url||"/assets/product-placeholder.svg";
  const fallback={name:b.name||"Premium Saree",price:Number(b.price||0),category:b.category||"Saree",description:b.description||"Premium saree with elegant finish.",tags:b.tags||"saree,premium,fashion",image};
  if(!process.env.OPENAI_API_KEY)return res.json({preview:fallback});
  try{
   const ai=await openAIJson("You are an expert saree e-commerce copywriter for SAREE. Never call it a demo website. Return JSON with name,price,category,description,tags. Do not invent facts.",JSON.stringify(b));
   res.json({preview:{...fallback,...ai,image}});
  }catch(e){console.error("AI PRODUCT:",e.message);res.json({preview:fallback});}
 });

 app.post("/api/chat",async(req,res)=>{
  try{
   const msg=String(req.body?.message||"").trim();if(!msg)return res.status(400).json({error:"Message required."});
   const s=await settings(),products=await all("SELECT * FROM products ORDER BY featured DESC,is_new DESC,id DESC");
   const quick=[
    {title:s.ai_q1_title,text:s.ai_q1_text||s.delivery_promise},
    {title:s.ai_q2_title,text:s.ai_q2_text||s.store_info},
    {title:s.ai_q3_title,text:s.ai_q3_text||s.opening_hours},
    {title:s.ai_q4_title,text:s.ai_q4_text||""},
    {title:s.ai_q5_title,text:s.ai_q5_text||"",image:s.ai_proof_image||""}
   ];
   if(greeting(msg))return res.json({reply:"আসসালামু আলাইকুম ❤️ SAREE-তে আপনাকে স্বাগতম। আমি SAREE-এর shopping assistant। শাড়ি দেখা, availability, price, delivery বা সরাসরি order করতে আমাকে বলুন।",quick});
   for(const [q,a] of [[s.ai_q1_title,s.ai_q1_text||s.delivery_promise],[s.ai_q2_title,s.ai_q2_text||s.store_info],[s.ai_q3_title,s.ai_q3_text||s.opening_hours],[s.ai_q4_title,s.ai_q4_text],[s.ai_q5_title,s.ai_q5_text]]){
    if(q&&msg.toLowerCase()===String(q).toLowerCase())return res.json({reply:a||"Admin এখনো এই তথ্য সেট করেননি।",proof_image:q===s.ai_q5_title?s.ai_proof_image||"": "",quick});
   }
   const chat=req.session.saree_chat||{},pay=payments(s).map(x=>x.method+" "+x.number).join(", ");
   const system=`You are the official SAREE saree-store shopping assistant. Never say demo website. Always call the store SAREE. Never invent product, price, availability, payment number, delivery time or policy.
Catalog:\n${catalog(products)}
Store:${s.store_info}\nHours:${s.opening_hours}\nDelivery:${s.delivery_promise}\nPayments:${pay}${s.cod_enabled==="1"?", Cash on Delivery":""}
Current order:${JSON.stringify(chat)}
Return ONLY JSON keys reply,intent,product_id,quantity,name,phone,address,payment_method,transaction_id,confirm. If ordering, use a real product id. Ask for missing fields one at a time and ask for confirmation before creating an order.`;
   try{
    const ai=await openAIJson(system,msg);
    if(ai){
     if(ai.product_id){const p=products.find(x=>x.id===Number(ai.product_id));if(p){chat.product_id=p.id;chat.quantity=Math.max(1,Number(ai.quantity||chat.quantity||1));}}
     for(const k of ["name","phone","address","payment_method","transaction_id"])if(ai[k])chat[k]=ai[k];
     if(ai.payment_method)chat.payment_method=normalizePayment(ai.payment_method);
     const p=chat.product_id?products.find(x=>x.id===Number(chat.product_id)):null;
     if(ai.intent==="order"||p||Object.keys(chat).length){
      if(!p)ai.reply="কোন productটি order করতে চান? Product-এর নাম বলুন।";
      else if(!chat.name)ai.reply=`${p.name} — ${money(p.price)}। Order করতে আপনার নাম দিন।`;
      else if(!chat.phone)ai.reply="আপনার mobile number দিন।";
      else if(!chat.address)ai.reply="Delivery address দিন।";
      else if(!chat.payment_method)ai.reply="Payment method বলুন: "+pay+(s.cod_enabled==="1"?", Cash on Delivery":"")+"।";
      else if(chat.payment_method!=="Cash on Delivery"&&!chat.transaction_id)ai.reply=`${chat.payment_method} payment number: ${s[chat.payment_method.toLowerCase()+"_number"]||""}। Payment করে Transaction ID দিন।`;
      else if(ai.confirm===true){
       const qty=Math.max(1,Number(chat.quantity||1)),total=p.price*qty,payNum=chat.payment_method==="Cash on Delivery"?"":s[chat.payment_method.toLowerCase()+"_number"]||"";
       const r=await run("INSERT INTO orders(customer_name,phone,address,payment_method,payment_number,transaction_id,total,status,items_json) VALUES(?,?,?,?,?,?,?,?,?)",[chat.name,chat.phone,chat.address,chat.payment_method,payNum,chat.transaction_id||"",total,"Pending",JSON.stringify([{id:p.id,name:p.name,price:p.price,qty,image:p.image}])]);
       const oid=orderId(r.lastInsertRowid);resetChat(req);
       return res.json({reply:`অর্ডার সফলভাবে নেওয়া হয়েছে ❤️\nOrder ID: ${oid}\n${p.name} × ${qty}\nমোট: ${money(total)}\nStatus: Pending`,order_id:oid,quick});
      }
      req.session.saree_chat=chat;req.session.save(()=>{});
     }
     return res.json({reply:ai.reply||"অবশ্যই ❤️ কীভাবে সাহায্য করতে পারি?",quick});
    }
   }catch(e){console.error("AI error:",e.message);}
   const lower=msg.toLowerCase();
   const found=products.find(p=>lower.includes(String(p.name).toLowerCase())||lower.includes(String(p.category||"").toLowerCase()));
   if(found){
    chat.product_id=found.id;chat.quantity=chat.quantity||1;req.session.saree_chat=chat;
    if(/order|অর্ডার|buy|কিনবো|কিন/i.test(msg))return res.json({reply:`${found.name} — ${money(found.price)}। Order করতে আপনার নাম দিন।`,quick});
    return res.json({reply:`${found.name}\nPrice: ${money(found.price)}\nCategory: ${found.category||"Saree"}\n${found.description||""}`,quick});
   }
   return res.json({reply:"অবশ্যই ❤️ আমি SAREE-এর product, price, availability, delivery ও order সম্পর্কে সাহায্য করতে পারি। কোন saree দেখতে চান?",quick});
  }catch(e){console.error("CHAT ERROR:",e);res.status(500).json({error:"Chat service error"});}
 });

 app.get("/api/orders/:id",async(req,res)=>{
  const raw=String(req.params.id).replace(/^SAR-/i,""),id=Number(raw);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"Invalid Order ID"});
  const o=await get("SELECT id,status,total,created_at,items_json FROM orders WHERE id=?",[id]);
  if(!o)return res.status(404).json({error:"Order not found"});
  res.json({order_id:orderId(o.id),status:o.status,total:o.total,created_at:o.created_at,items:JSON.parse(o.items_json||"[]")});
 });

 app.use((err,req,res,next)=>{console.error("SERVER ERROR:",err);if(err instanceof multer.MulterError)return res.status(400).json({error:err.message});res.status(500).json({error:"Internal server error"});});
 app.listen(PORT,"0.0.0.0",()=>console.log(`SAREE server running on port ${PORT} | Turso database connected`));
}

start().catch(e=>{console.error("STARTUP ERROR:",e);process.exit(1);});
