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
source.agencies = [{id:agency,agencyId:agency,name:"Isolated QA",status:"active",plan:"PRO",subscription:{plan:"PRO",status:"active"}}];
source.users = [{id:user,agencyId:agency,role:"admin",name:"QA Admin",email:"qa-ready-sent@example.test",createdAt:now,updatedAt:now}];
source.offers = [{id:offerId,offerId,agencyId:agency,createdBy:user,ownerName:"QA Admin",status:"draft",destination:"Rome",travelDates:"2020-01-01 - 2020-01-05",flights:[{date:"2020-01-02"}],flightRoute:"SOF-FCO",flightPrice:100,hotels:[{id:"hotel-1",selected:true,occupancy:{adults:2,children:0,rooms:1,confirmed:false}}],validationWarnings:[],createdAt:now,updatedAt:now}];
source.clients = [];
source.activities = [];
fs.writeFileSync(dbPath, JSON.stringify(source,null,2));
const sessionPayload = Buffer.from(JSON.stringify({userId:user,exp:Date.now()+3600000})).toString("base64url");
const signature = crypto.createHmac("sha256",secret).update(sessionPayload).digest("base64url");
const cookie = "aya_session="+sessionPayload+"."+signature;
const child = spawn(process.execPath,["server.js"],{cwd:root,env:{...process.env,NODE_ENV:"test",PORT:port,DB_FILE:dbPath,AUTH_SECRET:secret,LIVE_BASE_URL:base,SMOKE_BASE_URL:base},stdio:["ignore","pipe","pipe"]});
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
  console.log("LIMITATION: external notification delivery not instrumented; NOT VERIFIED");
 }finally{child.kill();fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1;});
