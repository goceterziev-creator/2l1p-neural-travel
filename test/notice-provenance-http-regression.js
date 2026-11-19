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
// Synthetic reproduction of the reported OFF-1795075499083-irs0e symptoms;
// not a snapshot of the production offer or supplier evidence.
const clientAudienceIds = ["QA-AUDIENCE-LEGACY","QA-AUDIENCE-REGISTRY"];
const materialTransfer = "Трансферът до хотела подлежи на потвърждение преди резервация.";
const internalReview = "Офертата има условия за преглед и не е потвърдена за изпращане";
const occupancyConfirmed = {adults:2,children:2,rooms:1,childAges:[1,9],confirmed:true};
for (const [index,id] of clientAudienceIds.entries()) {
 const row={id,agencyId:agency,status:"draft",clientName:"SYNTHETIC AUDIENCE QA",destination:"Abu Dhabi",travelDates:"21.11.2099 - 29.11.2099",guests:"2 adults, 2 children",markupPercent:5,finalPrice:2100,
  flights:[{airline:"Turkish Airlines",route:"SOF -> IST -> AUH / AUH -> IST -> SOF",price:1000,baggage:{checked:{pieces:1,weightKg:23}},outboundSegments:[{from:"SOF",to:"IST",flightNumber:"TK1030",departure:"2099-11-21T21:45",arrival:"2099-11-22T00:15"},{from:"IST",to:"AUH",flightNumber:"TK866",departure:"2099-11-22T01:15",arrival:"2099-11-22T06:45"}],inboundSegments:[{from:"AUH",to:"IST",flightNumber:"TK869",departure:"2099-11-29T02:35",arrival:"2099-11-29T07:00"},{from:"IST",to:"SOF",flightNumber:"TK1027",departure:"2099-11-29T08:20",arrival:"2099-11-29T08:40"}]}],
  hotels:[{id:"aud-a",name:"QA Abu Dhabi Alpha",area:"Abu Dhabi",selected:true,price:1000,meal:"Breakfast",occupancy:occupancyConfirmed},{id:"aud-b",name:"QA Abu Dhabi Beta",area:"Abu Dhabi",price:1200,meal:"UNKNOWN",occupancy:{...occupancyConfirmed,confirmed:false}},{id:"aud-c",name:"QA Abu Dhabi Gamma",area:"Abu Dhabi",price:1400,meal:"Half board",roomsLeft:"sold out",occupancy:occupancyConfirmed}],
  validationWarnings:["[WARNING] Smart Import: храненето за поне един хотел не е потвърдено.","[INFO] INTERNAL_QA_STATUS_ONLY",materialTransfer]};
 row.noticeDecisions=Object.fromEntries(require("../server/offer-notices").rawNotices(row).filter(notice=>notice.message===materialTransfer).map(notice=>[notice.id,{classification:"CLIENT_MATERIAL_CONDITION",clientText:materialTransfer,actorId:user,decidedAt:now}]));
 if(index){row.proposalInput=require("../gt63-core/legacy-offer-print-input").buildLegacyOfferPrintInput(row);row.proposalTemplate={selected:"multi-hotel"};row.proposalInput.proposalTemplate.selected="multi-hotel";row.proposalInput.flight.baggage=row.flights[0].baggage;}
 source.offers.push(row);
}
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
    const puppeteer=require("puppeteer"),browser=await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
    try {
      for(const id of clientAudienceIds) {
        const admin=await open(id),before=JSON.stringify(JSON.parse(fs.readFileSync(dbPath)).offers.find(row=>row.id===id));
        assert(admin.offer.noticeReview.notices.some(notice=>notice.message.includes("Smart Import:")));
        assert(admin.offer.noticeReview.notices.some(notice=>notice.message.includes("INTERNAL_QA_STATUS_ONLY")));
        assert(admin.offer.noticeReview.unresolved>0);
        const gate=await request(`/api/offers/${id}/status`,{method:"PATCH",body:JSON.stringify({status:"sent"})});assert.equal(gate.status,422);
        for(const selectedHotelId of ["aud-a","aud-b","aud-c"]) {
          const page=await browser.newPage();
          await page.setRequestInterception(true);page.on("request",req=>req.isNavigationRequest()||req.url().startsWith(base)||req.url().startsWith("data:")?req.continue():req.abort());
          await page.goto(`${base}/api/offers/view/${id}?selectedHotelId=${selectedHotelId}`,{waitUntil:"networkidle0"});
          const visible=await page.evaluate(()=>document.body.innerText);
          assert(!visible.includes(internalReview));assert(!visible.includes("Smart Import:"));assert(!visible.includes("INTERNAL_QA_STATUS_ONLY"));assert(!visible.includes("[object Object]"));assert(visible.includes(materialTransfer));assert(visible.includes("Багажът подлежи на потвърждение"));
          {
            const scoped=await page.$eval(".aya-client-notices",node=>node.innerText);
            assert.equal(scoped.includes("Изхранването за избрания хотел"),selectedHotelId==="aud-b");
            assert.equal(scoped.includes("Хотелската заетост"),selectedHotelId==="aud-b");
            assert.equal(scoped.includes("ограничена или липсваща наличност"),selectedHotelId==="aud-c");
            if(selectedHotelId==="aud-a") {
              await page.click(id.endsWith("REGISTRY") ? '.v11-prefer-option[data-option-id="aud-b"]' : '[data-hotel-id="aud-b"] [data-hotel-choice]');assert((await page.$eval(".aya-client-notices",node=>node.innerText)).includes("Изхранването за избрания хотел"));
              await page.click(id.endsWith("REGISTRY") ? '.v11-prefer-option[data-option-id="aud-a"]' : '[data-hotel-id="aud-a"] [data-hotel-choice]');assert(!(await page.$eval(".aya-client-notices",node=>node.innerText)).includes("Изхранването за избрания хотел"));
            }
          }
          await page.close();
          const print=await request(`/api/offers/${id}/print?selectedHotelId=${selectedHotelId}`);assert.equal(print.status,200,print.body);
          const response=await fetch(`${base}/api/offers/${id}/pdf?selectedHotelId=${selectedHotelId}`);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,4).toString(),"%PDF");
          const pdfText=execFileSync("pdftotext",["-","-"],{input:bytes,encoding:"utf8"}).replace(/\s+/g," ");
          const pageCount=Number(execFileSync("pdfinfo",["-"],{input:bytes,encoding:"utf8"}).match(/^Pages:\s+(\d+)/m)?.[1]);assert.equal(pageCount,5,"same minimal synthetic fixture is five pages on baseline 83939ba");
          const expectedPrice={"aud-a":"2 100,00 EUR","aud-b":"2 310,00 EUR","aud-c":"2 520,00 EUR"}[selectedHotelId];assert(pdfText.includes(expectedPrice),pdfText);
          if(process.env.AYA_AUDIENCE_EVIDENCE_DIR){fs.mkdirSync(process.env.AYA_AUDIENCE_EVIDENCE_DIR,{recursive:true});const prefix=path.join(process.env.AYA_AUDIENCE_EVIDENCE_DIR,id+"-"+selectedHotelId);fs.writeFileSync(prefix+".pdf",bytes);fs.writeFileSync(prefix+".txt",pdfText);fs.writeFileSync(prefix+".html",print.body);}

          for(const text of [print.body,pdfText]) {
            assert(!text.includes(internalReview));assert(!text.includes("Smart Import:"));assert(!text.includes("INTERNAL_QA_STATUS_ONLY"));assert(!text.includes("[object Object]"));assert(!text.includes("всички хотелски варианти"));assert(text.includes(materialTransfer));assert(text.includes("Багажът подлежи на потвърждение"));
            assert.equal(text.includes("Изхранването за избрания хотел"),selectedHotelId==="aud-b");assert.equal(text.includes("Хотелската заетост и броят стаи"),selectedHotelId==="aud-b");assert.equal(text.includes("ограничена или липсваща наличност"),selectedHotelId==="aud-c");
            assert(text.includes({"aud-a":"QA Abu Dhabi Alpha","aud-b":"QA Abu Dhabi Beta","aud-c":"QA Abu Dhabi Gamma"}[selectedHotelId]));
          }
          console.log("PASS audience HTML/Print/actual PDF",id,selectedHotelId,bytes.length);
        }
        const after=JSON.parse(fs.readFileSync(dbPath)).offers.find(row=>row.id===id);const original=JSON.parse(before);
        for(const field of ["hotels","flights","finalPrice","markupPercent","guests","travelDates","status","noticeDecisions","validationWarnings"])assert.deepEqual(after[field],original[field],field+" source mutation");
      }
    } finally {await browser.close();}
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
      assert(!unpublished.body.includes("Офертата има условия за преглед"));
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
        assert(result.body.includes("Изхранването за избрания хотел подлежи на потвърждение"));
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
