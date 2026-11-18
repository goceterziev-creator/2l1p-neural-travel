"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, execFileSync } = require("node:child_process");
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
const internal = "[CRITICAL] Вътрешна опашка flight/price/cancellation — QA-only!";
const novel = "[INFO] Escalate date and hotel notes to the night desk??";
const term = "При анулация след 17 ноември се дължат 240 EUR.";
const otherUser = "QA-OTHER-ADMIN";
source.agencies.push({...source.agencies[0],id:"QA-OTHER",agencyId:"QA-OTHER"});
source.users.push({...source.users[0],id:otherUser,agencyId:"QA-OTHER",email:"other@example.test"});
const agentUser = "QA-AGENT";
source.users.push({...source.users[0],id:agentUser,role:"agent",email:"agent@example.test"});
const warnings = [internal, novel, term, term];
const hotel = {id:"qa-hotel",selected:true,name:"QA Hotel",price:300,roomsLeft:"sold out",occupancy:{adults:2,children:0,rooms:1,confirmed:true}};
const offer = {id:offerId,agencyId:agency,status:"draft",destination:"Rome",travelDates:"16.11.2099 - 20.11.2099",hotels:[hotel],
  guests:"2 adults",hotelPrice:300,finalPrice:300,validationWarnings:warnings};
const proposalInput = require("../gt63-core/legacy-offer-print-input").buildLegacyOfferPrintInput({...offer,validationWarnings:[]});
proposalInput.proposalTemplate.selected = "multi-hotel";
source.offers = [offer,{...offer,id:occupancyOfferId,proposalInput,proposalTemplate:proposalInput.proposalTemplate}];
const operatorOfferId = "QA-OPERATOR-NOTICE-LEAK";
source.offers.push({
  ...offer, id:operatorOfferId, finalPrice:0, hotelPrice:0,
  hotels:[{...hotel, price:0, roomsLeft:"available", meal:"Breakfast"}],
  flights:[{airline:"QA Airline",route:"SOF-XYZ",departure:"2099-11-16"}],
  flightRoute:"SOF-XYZ", validationWarnings:[]
});
fs.writeFileSync(dbPath, JSON.stringify(source,null,2));
const sessionPayload = Buffer.from(JSON.stringify({userId:user,exp:Date.now()+3600000})).toString("base64url");
const signature = crypto.createHmac("sha256",secret).update(sessionPayload).digest("base64url");
const cookie = "aya_session="+sessionPayload+"."+signature;
const child = spawn(process.execPath,[path.join(root,"server.js")],{cwd:tmp,env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:"test",PUPPETEER_EXECUTABLE_PATH:process.env.PUPPETEER_EXECUTABLE_PATH,PORT:port,DATA_DIR:tmp,DB_FILE:dbPath,AIRPORT_CONFIG_FILE:path.join(tmp,"airports.json"),OCR_PATTERN_CONFIG_FILE:path.join(tmp,"ocr.json"),REGRESSION_LIBRARY_DIR:path.join(tmp,"library"),BETA_AUTH_BYPASS:"false",AUTH_SECRET:secret,LIVE_BASE_URL:base,SMOKE_BASE_URL:base},stdio:["ignore","pipe","pipe"]});
let output = "";
child.stdout.on("data",c=>output+=c.toString());
child.stderr.on("data",c=>output+=c.toString());
async function request(url,opts={}) {
 const res=await fetch(base+url,{...opts,headers:{"Cookie":cookie,"Content-Type":"application/json",...(opts.headers||{})}});
 return {status:res.status,body:await res.text()};
}
function signedCookie(userId) {
  const payload = Buffer.from(JSON.stringify({userId,exp:Date.now()+3600000})).toString("base64url");
  return "aya_session=" + payload + "." + crypto.createHmac("sha256",secret).update(payload).digest("base64url");
}
async function open(id) {
  const result = await request("/api/offers/"+id);
  assert.equal(result.status,200,result.body);
  return JSON.parse(result.body);
}
async function decide(id, expectedVersion, noticeId, classification, headers, confirmed = true) {
  return request("/api/offers/"+id+"/notice-classification", {
    method:"PATCH", headers, body:JSON.stringify({expectedVersion,noticeId,classification,clientText:term,confirmed})
  });
}
(async () => {
  try {
    let healthy = false;
    for (let i = 0; i < 80 && !healthy; i++) {
      try { healthy = (await request("/api/health")).status === 200; } catch {}
      if (!healthy) await new Promise(resolve => setTimeout(resolve,250));
    }
    assert(healthy, output);
    // The exact production-leaked operator diagnostics must not reach client HTML/print/PDF.
    const operatorView = "/api/offers/view/"+operatorOfferId;
    const operatorPrint = "/api/offers/"+operatorOfferId+"/print?selectedHotelId=qa-hotel";
    for (const surface of [operatorView,operatorPrint]) {
      const response = await request(surface);
      assert.equal(response.status,200,response.body);
      assert(!response.body.includes("Проверете маршрута преди изпращане"),surface);
      assert(!response.body.includes("Офертата не трябва да се изпраща преди да се попълни цена"),surface);
      assert(response.body.includes("Маршрутът на полета предстои да бъде потвърден"),surface);
      assert(response.body.includes("Пакетната цена предстои да бъде потвърдена"),surface);
    }
    const operatorPdf = await fetch(base+"/api/offers/"+operatorOfferId+"/pdf?selectedHotelId=qa-hotel");
    assert.equal(operatorPdf.status,200);
    const operatorPdfText = execFileSync("pdftotext",["-","-"],{input:Buffer.from(await operatorPdf.arrayBuffer()),encoding:"utf8"});
    assert(!operatorPdfText.includes("Проверете маршрута преди изпращане"));
    assert(!operatorPdfText.includes("Офертата не трябва да се изпраща преди да се попълни цена"));
    console.log("PASS operator-only route and zero-price diagnostics absent from client HTML/print/PDF");
    let priorId;
    for (const id of [offerId, occupancyOfferId]) {
      const url = "/api/offers/"+id;
      const view = "/api/offers/view/"+id;
      let current = await open(id);
      const rows = current.offer.noticeReview.notices;
      assert.deepEqual(rows.map(item => item.message),warnings);
      assert.equal(new Set(rows.map(item => item.id)).size,4);
      const gate = await request(url+"/status",{method:"PATCH",body:JSON.stringify({status:"sent"})});
      assert.equal(gate.status,422,gate.body);
      assert.match(gate.body,/AYA_NOTICE_REVIEW_REQUIRED/);
      const unpublished = await request(view);
      assert.equal(unpublished.status,200,unpublished.body);
      assert(!unpublished.body.includes(term));
      const select = (row, classification, headers, confirmed) => decide(id,current.offerVersion,row.id,classification,headers,confirmed);
      if (priorId) assert.equal((await select({id:priorId},"INTERNAL_DIAGNOSTIC")).status,409);
      assert.equal((await select(rows[0],"INTERNAL_DIAGNOSTIC",{Cookie:""})).status,401);
      assert.equal((await select(rows[0],"INTERNAL_DIAGNOSTIC",{Cookie:signedCookie(otherUser)})).status,403);
      assert.equal((await select(rows[0],"INTERNAL_DIAGNOSTIC",{Cookie:signedCookie(agentUser)})).status,403);
      assert.equal((await select(rows[2],"CLIENT_MATERIAL_CONDITION",undefined,false)).status,422);
      for (const [index,kind] of [[0,"INTERNAL_DIAGNOSTIC"],[2,"CLIENT_MATERIAL_CONDITION"],[3,"INTERNAL_DIAGNOSTIC"]]) {
        const result = await select(rows[index],kind);
        assert.equal(result.status,200,result.body);
        current = await open(id);
      }
      priorId = rows[0].id;
      const reopened = current.offer.noticeReview.notices;
      assert.deepEqual(reopened.map(item=>item.message),warnings);
      assert.deepEqual(reopened.map(item=>item.classification),["INTERNAL_DIAGNOSTIC","UNRESOLVED","CLIENT_MATERIAL_CONDITION","INTERNAL_DIAGNOSTIC"]);
      assert.equal(reopened[2].decision.actorId,user);
      assert(Number.isFinite(Date.parse(reopened[2].decision.decidedAt)));
      const persisted = JSON.parse(fs.readFileSync(dbPath));
      assert(persisted.activities.some(event => event.type === "offer_notice_classified" && event.metadata?.noticeId === rows[2].id));
      for (const surface of [view, url+"/print?selectedHotelId=qa-hotel"]) {
        const result = await request(surface);
        assert.equal(result.status,200,result.body);
        assert(result.body.includes(term));
        assert(result.body.includes("ограничена или липсваща наличност"));
        assert(result.body.includes("Изхранването не е потвърдено"));
        assert(!result.body.includes("Вътрешна опашка"));
        assert(!result.body.includes("night desk"));
      }
      const pdf = await fetch(base+url+"/pdf?selectedHotelId=qa-hotel");
      assert.equal(pdf.status,200);
      const pdfText = execFileSync("pdftotext",["-","-"],{input:Buffer.from(await pdf.arrayBuffer()),encoding:"utf8"});
      assert(pdfText.replace(/\s+/g," ").includes(term));
      assert(!pdfText.includes("night desk"));
      assert(!pdfText.includes("Вътрешна опашка"));
      const resolved = await select(rows[1],"INTERNAL_DIAGNOSTIC");
      assert.equal(resolved.status,200,resolved.body);
      const ready = await request(url+"/status",{method:"PATCH",body:JSON.stringify({status:"ready"})});
      assert.equal(ready.status,200,ready.body);
      current = await open(id);
      const amended = await request(url,{method:"PUT",body:JSON.stringify({...current.offer,expectedVersion:current.offerVersion,
        status:"draft",validationWarnings:[internal,novel,term.replace("240","260"),term],noticeDecisions:current.offer.noticeDecisions})});
      assert.equal(amended.status,200,amended.body);
      current = await open(id);
      assert(current.offer.noticeReview.notices.every(item=>item.classification==="UNRESOLVED"));
      assert.equal((await decide(id,current.offerVersion,rows[2].id,"CLIENT_MATERIAL_CONDITION")).status,409);
      console.log("PASS",id,"classification, reopen, authorization, source, print and PDF");
    }
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once("exit",resolve));
      child.kill("SIGKILL");
      await exited;
    }
    fs.rmSync(tmp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
