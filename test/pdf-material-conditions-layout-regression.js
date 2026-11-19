'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),{execFileSync}=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aya-pdf-conditions-'));
for(const [key,file]of Object.entries({DATA_DIR:'.',DB_FILE:'db.json',AIRPORT_CONFIG_FILE:'airports.json',OCR_PATTERN_CONFIG_FILE:'ocr.json'}))process.env[key]=path.join(temp,file);
process.env.SERPAPI_KEY='';process.on('exit',()=>fs.rmSync(temp,{recursive:true,force:true}));
const filename=path.resolve(__dirname,'../server.js'),harness=new Module(filename,module);harness.filename=filename;harness.paths=Module._nodeModulePaths(path.dirname(filename));
harness._compile(fs.readFileSync(filename,'utf8')+'\nmodule.exports.conditionsTest={renderOfferHtml,renderGt63PrintOfferHtml,assertClientStatusSafety};',filename);
const api=harness.exports.conditionsTest,notices=require('../server/offer-notices'),adapter=require('../gt63-core/legacy-offer-print-input');
const transfer='Трансферът до хотела подлежи на потвърждение преди резервация.',cancel='При анулация след 17 ноември се дължат 240 EUR.',tax='Туристическата такса се заплаща на място.';
function fixture(){
 const offer={id:'SYNTHETIC-PDF-CONDITIONS',clientName:'QA ONLY',status:'draft',destination:'Abu Dhabi',travelDates:'21.11.2099 - 29.11.2099',guests:'2 adults',markupPercent:5,finalPrice:2100,
  flights:[{airline:'QA Airline',route:'SOF -> IST -> AUH / AUH -> IST -> SOF',baggage:{checked:{weightKg:23}},price:1000,outboundSegments:[{from:'SOF',to:'IST',flightNumber:'QA100',departure:'2099-11-21T21:45',arrival:'2099-11-22T00:15'},{from:'IST',to:'AUH',flightNumber:'QA101',departure:'2099-11-22T01:15',arrival:'2099-11-22T06:45'}],inboundSegments:[{from:'AUH',to:'IST',flightNumber:'QA102',departure:'2099-11-29T02:35',arrival:'2099-11-29T07:00'},{from:'IST',to:'SOF',flightNumber:'QA103',departure:'2099-11-29T08:20',arrival:'2099-11-29T08:40'}]}],
  hotels:[{id:'a',name:'QA Alpha',selected:true,area:'Abu Dhabi',price:1000,room:'QA ROOM A',meal:'Breakfast',roomsLeft:'sold out',occupancy:{adults:2,children:0,rooms:1,confirmed:true}},{id:'b',name:'QA Beta',area:'Abu Dhabi',price:1200,room:'QA ROOM B',meal:'UNKNOWN',roomsLeft:'sold out',occupancy:{adults:2,children:0,rooms:1,confirmed:false}}],validationWarnings:['[INFO] INTERNAL_QA_ONLY',transfer,cancel,tax]};
 offer.noticeDecisions=Object.fromEntries(notices.rawNotices(offer).filter(n=>n.message!==offer.validationWarnings[0]).map(n=>[n.id,{classification:notices.MATERIAL,clientText:n.message,actorId:'QA',decidedAt:'2026-11-19T00:00:00Z'}]));
 offer.proposalInput=adapter.buildLegacyOfferPrintInput(offer);offer.proposalInput.proposalTemplate.selected='multi-hotel';offer.proposalTemplate={selected:'multi-hotel'};offer.proposalInput.transfer={route:'AUH → хотел',included:false,status:'Трансфер за потвърждение'};return offer;
}
function material(text){for(const value of [transfer,cancel,tax])assert(text.includes(value),value);assert(!text.includes('INTERNAL_QA_ONLY'));}
test('selected/comparison Print remove the notice section and preserve scoped terms in existing sections',()=>{
 const offer=fixture(),before=JSON.stringify(offer);
 for(const id of ['a','b']){const html=api.renderGt63PrintOfferHtml(offer,{selectedHotelId:id});assert(!/class="[^"]*\bgt63-print-notices\b/.test(html));assert(!html.includes('Условия и важни бележки'));material(html);const price=html.match(/class="gt63-print-investment-list"[\s\S]*?<\/section>/)?.[0]||'';assert(price.includes(cancel));assert(price.includes(tax));const services=html.match(/gt63-print-included-services[\s\S]*?gt63-print-investment-page/)?.[0]||'';assert(services.includes('Багажът подлежи на потвърждение'));assert(services.includes('Трансфер за потвърждение'));assert(!html.includes(id==='a'?'QA Beta':'QA Alpha'));}
 const comparison=api.renderGt63PrintOfferHtml(offer,{mode:'comparison',selectedHotelId:'a'});assert(!/class="[^"]*\bgt63-print-notices\b/.test(comparison));assert(!comparison.includes('Условия и важни бележки'));material(comparison);assert(comparison.includes('Трансфер за потвърждение'));assert(comparison.includes('QA Alpha: Хотелът'));assert(comparison.includes('QA Beta: Хотелът'));assert(comparison.includes('<tfoot>'));assert.equal(JSON.stringify(offer),before);
});
test('client HTML, admin review inputs and READY/SENT protection are unchanged',async()=>{
 const offer=fixture(),before=JSON.stringify(offer),htmlBefore=await api.renderOfferHtml(offer,{selectedHotelId:'a'}),reviewBefore=notices.adminState(offer);
 assert(htmlBefore.includes('Условия и важни бележки'));material(htmlBefore);
 api.renderGt63PrintOfferHtml(offer,{selectedHotelId:'b'});api.renderGt63PrintOfferHtml(offer,{mode:'comparison'});
 assert.equal(await api.renderOfferHtml(offer,{selectedHotelId:'a'}),htmlBefore);assert.deepEqual(notices.adminState(offer),reviewBefore);assert(reviewBefore.unresolved>0);
 for(const status of ['ready','sent','booked'])assert.throws(()=>api.assertClientStatusSafety({...offer,status}),e=>e.status===422&&e.message==='AYA_NOTICE_REVIEW_REQUIRED');
 assert.equal(JSON.stringify(offer),before);
});
test('selected A/B and comparison actual PDF text has no notice heading and retains business facts',async()=>{
 const browser=await require('puppeteer').launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{for(const [name,options]of [['selected-a',{selectedHotelId:'a'}],['selected-b',{selectedHotelId:'b'}],['comparison',{mode:'comparison',selectedHotelId:'a'}]]){
  const offer=fixture(),before=JSON.stringify(offer),html=api.renderGt63PrintOfferHtml(offer,options),page=await browser.newPage();await page.setRequestInterception(true);page.on('request',r=>r.abort());await page.setContent(html,{waitUntil:'domcontentloaded'});
  const headings=await page.$$eval('h1,h2,h3,.gt63-print-kicker',nodes=>nodes.map(n=>n.textContent.trim().toLowerCase()));assert(!headings.includes('преди резервация'));assert(!headings.includes('условия и важни бележки'));
  const bytes=Buffer.from(await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:true,margin:{top:'0',right:'0',bottom:'0',left:'0'}}));await page.close();assert.equal(bytes.subarray(0,4).toString(),'%PDF');
  const raw=execFileSync('pdftotext',['-','-'],{input:bytes,encoding:'utf8'}),flat=raw.replace(/\s+/g,' ');assert(!raw.split(/\n/).some(line=>line.trim().toLowerCase()==='преди резервация'));assert(!flat.toLowerCase().includes('условия и важни бележки'));material(flat);assert(flat.includes('Трансфер за потвърждение'));
  for(const value of ['QA Airline','QA100','QA101','QA102','QA103','2099','21.11.2099','29.11.2099','21:45','00:15','01:15','06:45','02:35','07:00','08:20','08:40','Багажът подлежи на потвърждение'])assert(flat.includes(value),`${name}: ${value}`);
  if(name==='comparison'){for(const value of ['QA Alpha: Хотелът','QA Beta: Хотелът','QA Beta: Изхранването','2 100,00 EUR','2 310,00 EUR'])assert(flat.includes(value),value);}else{const a=name==='selected-a';assert(flat.includes(a?'QA Alpha':'QA Beta'));assert(!flat.includes(a?'QA Beta':'QA Alpha'));assert(flat.includes(a?'2 100,00 EUR':'2 310,00 EUR'));assert(flat.includes('Трансфер за потвърждение'));}
  assert.equal(JSON.stringify(offer),before);
  if(process.env.AYA_PDF_CONDITIONS_EVIDENCE_DIR){fs.mkdirSync(process.env.AYA_PDF_CONDITIONS_EVIDENCE_DIR,{recursive:true});const prefix=path.join(process.env.AYA_PDF_CONDITIONS_EVIDENCE_DIR,name);fs.writeFileSync(prefix+'.pdf',bytes);fs.writeFileSync(prefix+'.txt',raw);fs.writeFileSync(prefix+'.html',html);}
  console.log('PDF verified',name,bytes.length);
 }}finally{await browser.close();}
});
