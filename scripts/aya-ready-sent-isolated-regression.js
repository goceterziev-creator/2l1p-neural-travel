"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aya-ready-sent-"));
const dbPath = path.join(tmp, "database.json");
const port = String(39000 + Math.floor(Math.random() * 1000));
const base = "http://127.0.0.1:" + port;
const secret = "isolated-regression-secret";
const source = {agencies:[],users:[],offers:[],clients:[],activities:[],invites:[]};
const now = new Date().toISOString();
const agency = "QA-READY-SENT-AGENCY";
const user = "QA-READY-SENT-ADMIN";
const offerId = "QA-READY-SENT-OFFER";
const occupancyOfferId = "QA-UNCONFIRMED-OCCUPANCY";
source.agencies = [{id:agency,agencyId:agency,name:"Isolated QA",status:"active",plan:"PRO",subscription:{plan:"PRO",status:"active"}}];
source.users = [{id:user,agencyId:agency,role:"admin",name:"QA Admin",email:"qa-ready-sent@example.test",createdAt:now,updatedAt:now}];
source.offers = [{id:offerId,offerId,agencyId:agency,createdBy:user,ownerName:"QA Admin",status:"draft",destination:"Rome",travelDates:"2020-01-01 - 2020-01-05",flights:[{date:"2020-01-02"}],flightRoute:"SOF-FCO",flightPrice:100,hotels:[{id:"hotel-1",selected:true,occupancy:{adults:2,children:0,rooms:1,confirmed:false}}],validationWarnings:[],createdAt:now,updatedAt:now}];
source.offers.push({...source.offers[0],id:occupancyOfferId,offerId:occupancyOfferId,travelDates:"2027-01-01 - 2027-01-05",flights:[],flightRoute:"",flightPrice:0});
source.clients = [];
source.activities = [];
fs.writeFileSync(dbPath, JSON.stringify(source,null,2));
const sessionPayload = Buffer.from(JSON.stringify({userId:user,exp:Date.now()+3600000})).toString("base64url");
const signature = crypto.createHmac("sha256",secret).update(sessionPayload).digest("base64url");
const cookie = "aya_session="+sessionPayload+"."+signature;
const child = spawn(process.execPath,[path.join(root,"server.js")],{cwd:tmp,env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:"test",PORT:port,DATA_DIR:tmp,DB_FILE:dbPath,AIRPORT_CONFIG_FILE:path.join(tmp,"airports.json"),OCR_PATTERN_CONFIG_FILE:path.join(tmp,"ocr.json"),REGRESSION_LIBRARY_DIR:path.join(tmp,"library"),BETA_AUTH_BYPASS:"false",AUTH_SECRET:secret,LIVE_BASE_URL:base,SMOKE_BASE_URL:base},stdio:["ignore","pipe","pipe"]});
let output = "";
child.stdout.on("data",c=>output+=c.toString());
child.stderr.on("data",c=>output+=c.toString());
async function request(url,opts={}) {
 const res=await fetch(base+url,{...opts,headers:{"Cookie":cookie,"Content-Type":"application/json",...(opts.headers||{})}});
 return {status:res.status,body:await res.text()};
}
(async()=>{
 try {
  let healthy=false;
  for(let i=0;i<80;i++){
   try {if((await fetch(base+"/api/health")).status===200){healthy=true;break}}catch{}
   await new Promise(r=>setTimeout(r,250));
  }
  assert.ok(healthy,"isolated server unavailable: "+output.slice(-2000));
  const before=fs.readFileSync(dbPath);
  const beforeHash=crypto.createHash("sha256").update(before).digest("hex");
  for(const status of ["ready","sent"]){
   const result=await request("/api/offers/"+offerId+"/status",{method:"PATCH",body:JSON.stringify({status})});
   assert.equal(result.status,422,status+" must be blocked; response: "+result.body);
   assert.match(result.body,/AYA_FLIGHT_DATE_BLOCKED/,status+" must report flight-date guard");
   const after=fs.readFileSync(dbPath);
   assert.equal(crypto.createHash("sha256").update(after).digest("hex"),beforeHash,status+" must not change persisted DB bytes");
   console.log("PASS: "+status+" => HTTP 422 and byte-identical DB");
  }
  console.log("PASS: no status_changed audit entries (DB unchanged)");
  const beforeView = JSON.parse(fs.readFileSync(dbPath,"utf8")).offers.find(o=>o.id===offerId);
  const clientView = await fetch(base+"/api/offers/view/"+offerId);
  assert.equal(clientView.status,200,"invalid-flight presentation must remain accessible");
  assert.match(await clientView.text(),/\[FLIGHT_DATE_SAFETY\]/,"live flight warning must remain visible");
  const afterView=JSON.parse(fs.readFileSync(dbPath,"utf8")).offers.find(o=>o.id===offerId);
  const editorial=o=>Object.fromEntries(Object.entries(o).filter(([key])=>!["clientViews","clientViewed","updatedAt"].includes(key)));
  assert.deepEqual(editorial(afterView),editorial(beforeView));
  assert.equal(afterView.clientViews,(beforeView.clientViews||0)+1);
  assert.equal(afterView.status,"draft");
  console.log("PASS: invalid-flight client view HTTP 200, visible warning, only expected view telemetry");

  const beforeOccupancy = crypto.createHash("sha256").update(fs.readFileSync(dbPath)).digest("hex");
  for (const status of ["ready","sent","booked"]) {
   const result = await request("/api/offers/"+occupancyOfferId+"/status",{method:"PATCH",body:JSON.stringify({status})});
   assert.equal(result.status,422,status+" unconfirmed occupancy must be rejected");
   assert.match(result.body,/AYA_HOTEL_OCCUPANCY_BLOCKED/);
   assert.equal(crypto.createHash("sha256").update(fs.readFileSync(dbPath)).digest("hex"),beforeOccupancy,status+" must leave DB byte-identical");
   console.log("PASS: "+status+" unconfirmed occupancy => HTTP 422, DB unchanged");
  }
  const sentDb=JSON.parse(fs.readFileSync(dbPath,"utf8"));
  sentDb.offers.find(x=>x.id===occupancyOfferId).status="sent";
  fs.writeFileSync(dbPath,JSON.stringify(sentDb,null,2));
  const beforeSentView=JSON.parse(fs.readFileSync(dbPath,"utf8")).offers.find(o=>o.id===occupancyOfferId);
  const sentView=await fetch(base+"/api/offers/view/"+occupancyOfferId);
  assert.equal(sentView.status,200,"legacy sent offer must be viewable with advisory occupancy");
  assert.match(await sentView.text(),/непотвърдена заетост/);
  const afterSentView=JSON.parse(fs.readFileSync(dbPath,"utf8")).offers.find(o=>o.id===occupancyOfferId);
  assert.deepEqual(editorial(afterSentView),{...editorial(beforeSentView),status:"viewed"});
  assert.equal(afterSentView.clientViews,(beforeSentView.clientViews||0)+1);
  console.log("PASS: sent-to-viewed occupancy QA is advisory; only expected status/view metrics changed");
  sentDb.offers.find(x=>x.id===occupancyOfferId).status="draft";
  fs.writeFileSync(dbPath,JSON.stringify(sentDb,null,2));
  const beforeBook=crypto.createHash("sha256").update(fs.readFileSync(dbPath)).digest("hex");
  const deniedBook=await fetch(base+"/api/offers/"+occupancyOfferId+"/book",{method:"POST"});
  assert.equal(deniedBook.status,422,"alternate booking endpoint must block unconfirmed occupancy");
  assert.match(await deniedBook.text(),/AYA_HOTEL_OCCUPANCY_BLOCKED/);
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(dbPath)).digest("hex"),beforeBook);
  console.log("PASS: alternate booking endpoint unconfirmed occupancy HTTP 422, DB unchanged");
  const legacy = JSON.parse(fs.readFileSync(dbPath,"utf8"));
  const legacyOffer = {...legacy.offers.find(x=>x.id===occupancyOfferId),id:"QA-LEGACY-NO-HOTEL",offerId:"QA-LEGACY-NO-HOTEL",hotels:[],hotelOptions:[],proposalInput:{},hotelOccupancyStatus:null,status:"draft"};
  legacy.offers.push(legacyOffer);
  const multiOffer = {...legacy.offers.find(x=>x.id===occupancyOfferId),id:"QA-SELECTED-SECOND",offerId:"QA-SELECTED-SECOND",status:"draft",hotels:[
   {id:"first",selected:false,occupancy:{adults:2,children:0,rooms:1,confirmed:true}},
   {id:"second",selected:true,occupancy:{adults:2,children:0,rooms:1,confirmed:false}}
  ]};
  legacy.offers.push(multiOffer);
  fs.writeFileSync(dbPath,JSON.stringify(legacy,null,2));
  for (const id of [legacyOffer.id,multiOffer.id]) {
   const snapshot=crypto.createHash("sha256").update(fs.readFileSync(dbPath)).digest("hex");
   const denied=await request("/api/offers/"+id+"/status",{method:"PATCH",body:JSON.stringify({status:"ready"})});
   assert.equal(denied.status,422,id+" must be blocked until selected occupancy confirmed");
   assert.match(denied.body,/AYA_HOTEL_OCCUPANCY_BLOCKED/);
   assert.equal(crypto.createHash("sha256").update(fs.readFileSync(dbPath)).digest("hex"),snapshot);
  }
  console.log("PASS: legacy no-hotel and unconfirmed selected-second hotel block READY without DB changes");
  const confirmed = JSON.parse(fs.readFileSync(dbPath,"utf8"));
  const record = confirmed.offers.find(x=>x.id===occupancyOfferId);
  record.hotels[0].occupancy.confirmed = true;
  fs.writeFileSync(dbPath,JSON.stringify(confirmed,null,2));
  const allowed = await request("/api/offers/"+occupancyOfferId+"/status",{method:"PATCH",body:JSON.stringify({status:"ready"})});
  assert.equal(allowed.status,200,"confirmed occupancy must permit READY: "+allowed.body);
  assert.equal(JSON.parse(fs.readFileSync(dbPath,"utf8")).offers.find(x=>x.id===occupancyOfferId).status,"ready");
  console.log("PASS: confirmed hotel occupancy permits READY");
  const current = fs.readFileSync(dbPath);
  const unchanged = crypto.createHash("sha256").update(current).digest("hex");
  const unauthorized = await fetch(base+"/api/offers/"+occupancyOfferId+"/status",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"sent"})});
  assert.equal(unauthorized.status,401,"unauthenticated status mutation must be 401");
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(dbPath)).digest("hex"),unchanged);
  console.log("PASS: unauthenticated status mutation denied with unchanged DB");
  const otherUser="QA-OTHER-AGENCY",otherDb=JSON.parse(fs.readFileSync(dbPath,"utf8"));
  otherDb.users.push({id:otherUser,agencyId:"QA-OTHER",role:"admin",name:"Other QA"});
  fs.writeFileSync(dbPath,JSON.stringify(otherDb,null,2));
  const otherPayload=Buffer.from(JSON.stringify({userId:otherUser,exp:Date.now()+3600000})).toString("base64url");
  const otherCookie="aya_session="+otherPayload+"."+crypto.createHmac("sha256",secret).update(otherPayload).digest("base64url");
  const beforeOther=fs.readFileSync(dbPath);
  const cross=await request("/api/offers/"+occupancyOfferId+"/status",{method:"PATCH",headers:{Cookie:otherCookie},body:JSON.stringify({status:"booked"})});
  assert.equal(cross.status,403);assert.deepEqual(fs.readFileSync(dbPath),beforeOther);
  console.log("PASS: cross-agency mutation denied HTTP 403 with unchanged DB");
  console.log("LIMITATION: external notification delivery not instrumented; NOT VERIFIED");
 }finally{child.kill("SIGKILL");await new Promise(r=>child.exitCode!==null?r():child.once("exit",r));fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1;});
