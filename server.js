const express = require("express");
const admin = require("firebase-admin");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");

const app = express();
app.use(express.json({limit:"2mb"}));
app.use(express.static(path.join(__dirname,"public")));

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const DB_URL = process.env.FIREBASE_DATABASE_URL;
const BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET;

function initFirebase(){
  if(admin.apps.length) return;
  let serviceAccount;
  if(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64){
    serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,"base64").toString("utf8"));
  } else if(process.env.FIREBASE_SERVICE_ACCOUNT){
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else if(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY){
    serviceAccount = {
      projectId:process.env.FIREBASE_PROJECT_ID,
      clientEmail:process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g,"\n")
    };
  } else {
    throw new Error("Firebase service account environment variables are missing");
  }
  admin.initializeApp({
    credential:admin.credential.cert(serviceAccount),
    databaseURL:DB_URL,
    storageBucket:BUCKET_NAME
  });
}
try { initFirebase(); } catch(e){ console.error("Firebase init:",e.message); }
const db = () => admin.database();
const bucket = () => admin.storage().bucket();
const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024}});
const clean = v => String(v ?? "").trim().slice(0,5000);
const slugify = s => clean(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,35) || "gift";

function adminOnly(req,res,next){
  const key=req.headers["x-admin-key"] || req.body?.adminKey;
  if(!ADMIN_KEY || key!==ADMIN_KEY) return res.status(401).json({error:"Admin key ভুল অথবা সেট করা নেই"});
  next();
}
function defaultGift(){
  return {
    title:"A Little Gift For You",
    introText:"For you, my lovely",
    fromName:"From me",
    toName:"To you",
    showIntro:true, showFlowers:true, showPin:false, pin:"",
    pinHint:"A special date",
    coverTitle:"From me to you",
    coverSubtitle:"I made something special for you",
    galleryTitle:"Our beautiful memories",
    letterTitle:"A letter for you",
    letterText:"Every moment with you is special. Thank you for being part of my story.",
    endingText:"I will always love you",
    endingSubtitle:"With love, forever",
    photos:[], musicUrl:"", background:"#fff3df",
    enabledSections:{intro:true,flowers:true,cover:true,gallery:true,letter:true,ending:true},
    published:true, createdAt:Date.now()
  };
}

app.get("/health",(req,res)=>res.json({status:"ok",firebase:admin.apps.length>0,app:"Gift Link System"}));
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.get("/gift/:slug",(req,res)=>res.sendFile(path.join(__dirname,"public","gift.html")));

app.post("/api/admin/login",adminOnly,(req,res)=>res.json({ok:true}));
app.get("/api/admin/gifts",adminOnly,async(req,res)=>{
  try{
    const snap=await db().ref("giftLinkSystem/gifts").get();
    const obj=snap.val()||{};
    res.json(Object.entries(obj).map(([id,g])=>({id,...g})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)));
  }catch(e){res.status(500).json({error:e.message});}
});
app.post("/api/admin/gifts",adminOnly,async(req,res)=>{
  try{
    const data={...defaultGift(),...req.body};
    delete data.id; delete data.adminKey;
    const id=crypto.randomBytes(5).toString("hex");
    let slug=slugify(data.slug || data.title);
    const ref=db().ref("giftLinkSystem/gifts");
    let finalSlug=slug, n=2;
    while((await ref.orderByChild("slug").equalTo(finalSlug).get()).exists()) finalSlug=`${slug}-${n++}`;
    data.slug=finalSlug; data.createdAt=Date.now(); data.updatedAt=Date.now();
    await ref.child(id).set(data);
    res.json({ok:true,id,slug:finalSlug,url:`/gift/${finalSlug}`});
  }catch(e){res.status(500).json({error:e.message});}
});
app.put("/api/admin/gifts/:id",adminOnly,async(req,res)=>{
  try{
    const ref=db().ref(`giftLinkSystem/gifts/${req.params.id}`);
    const snap=await ref.get(); if(!snap.exists()) return res.status(404).json({error:"Gift পাওয়া যায়নি"});
    const old=snap.val(), data={...old,...req.body,updatedAt:Date.now()};
    delete data.id; delete data.adminKey;
    await ref.set(data); res.json({ok:true,slug:data.slug});
  }catch(e){res.status(500).json({error:e.message});}
});
app.delete("/api/admin/gifts/:id",adminOnly,async(req,res)=>{
  try{await db().ref(`giftLinkSystem/gifts/${req.params.id}`).remove();res.json({ok:true});}
  catch(e){res.status(500).json({error:e.message});}
});
app.post("/api/admin/upload",adminOnly,upload.single("file"),async(req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:"ফাইল নির্বাচন করো"});
    if(!/^(image\/|audio\/|video\/)/.test(req.file.mimetype)) return res.status(400).json({error:"শুধু ছবি, অডিও বা ভিডিও আপলোড করা যাবে"});
    const ext=(req.file.originalname.match(/\.[a-zA-Z0-9]{1,8}$/)||[".bin"])[0];
    const name=`gift-link-system/${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`;
    const file=bucket().file(name);
    await file.save(req.file.buffer,{metadata:{contentType:req.file.mimetype,cacheControl:"public,max-age=31536000"},resumable:false});
    await file.makePublic();
    res.json({ok:true,url:`https://storage.googleapis.com/${bucket().name}/${name}`});
  }catch(e){res.status(500).json({error:"Upload ব্যর্থ: "+e.message});}
});
app.get("/api/gift/:slug",async(req,res)=>{
  try{
    const snap=await db().ref("giftLinkSystem/gifts").orderByChild("slug").equalTo(req.params.slug).get();
    if(!snap.exists()) return res.status(404).json({error:"এই Gift Link পাওয়া যায়নি"});
    const gift=Object.values(snap.val())[0];
    if(gift.published===false) return res.status(404).json({error:"এই Gift Link এখন বন্ধ আছে"});
    const safe={...gift}; delete safe.pin;
    res.json(safe);
  }catch(e){res.status(500).json({error:e.message});}
});
app.post("/api/gift/:slug/unlock",async(req,res)=>{
  try{
    const snap=await db().ref("giftLinkSystem/gifts").orderByChild("slug").equalTo(req.params.slug).get();
    if(!snap.exists()) return res.status(404).json({error:"Gift পাওয়া যায়নি"});
    const gift=Object.values(snap.val())[0];
    if(gift.published===false) return res.status(404).json({error:"Gift বন্ধ আছে"});
    if(!gift.showPin) return res.json({ok:true});
    if(String(req.body.pin||"")!==String(gift.pin||"")) return res.status(403).json({error:"PIN সঠিক নয়"});
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`Gift Link System running on ${PORT}`));
