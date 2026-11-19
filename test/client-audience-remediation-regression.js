'use strict';
// Synthetic rendering only; no production URLs, server listening or supplier calls.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),{execFileSync}=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aya-audience-remediation-'));
for(const [key,file]of Object.entries({DATA_DIR:'.',DB_FILE:'db.json',AIRPORT_CONFIG_FILE:'airports.json',OCR_PATTERN_CONFIG_FILE:'ocr.json'}))process.env[key]=path.join(temp,file);
process.env.SERPAPI_KEY='';
process.on('exit',()=>fs.rmSync(temp,{recursive:true,force:true}));
const filename=path.resolve(__dirname,'../server.js'),harness=new Module(filename,module);harness.filename=filename;harness.paths=Module._nodeModulePaths(path.dirname(filename));
harness._compile(fs.readFileSync(filename,'utf8')+'\nmodule.exports.remediation={renderOfferHtml,renderGt63PrintOfferHtml};',filename);
const api=harness.exports.remediation,model=require('../gt63-core/presentation-view-model'),adapter=require('../gt63-core/legacy-offer-print-input'),notices=require('../server/offer-notices');
const transfer='Трансферът до хотела подлежи на потвърждение преди резервация.',cancellation='При анулация след 17 ноември се дължат 240 EUR.';
const forbidden=['5% марж','Подготвено за финален преглед','ЗА ПРЕГЛЕД','INTERNAL_QA_ONLY','Офертата има условия за преглед','[object Object]'];
function fixture(baggage,template){
 const offer={id:'QA-REMEDIATION',clientName:'SYNTHETIC QA',destination:'Abu Dhabi',status:'draft',travelDates:'21.11.2099 - 29.11.2099',guests:'2 adults',markupPercent:5,finalPrice:2100,
 flights:[{airline:'QA Airline',route:'SOF -> IST -> AUH / AUH -> IST -> SOF',baggage,price:1000,outboundSegments:[{from:'SOF',to:'AUH',departure:'2099-11-21T16:00',arrival:'2099-11-21T23:00'}],inboundSegments:[{from:'AUH',to:'SOF',departure:'2099-11-29T02:35',arrival:'2099-11-29T08:40'}]}],
 hotels:[{id:'a',name:'QA Alpha',area:'Abu Dhabi',selected:true,price:1000,meal:'Breakfast',occupancy:{adults:2,children:0,rooms:1,confirmed:true}},{id:'b',name:'QA Beta',area:'Abu Dhabi',price:1200,meal:'UNKNOWN',roomsLeft:'sold out',occupancy:{adults:2,children:0,rooms:1,confirmed:false}}],validationWarnings:['[INFO] INTERNAL_QA_ONLY',transfer,cancellation]};
 offer.noticeDecisions=Object.fromEntries(notices.rawNotices(offer).filter(n=>n.message!==offer.validationWarnings[0]).map(n=>[n.id,{classification:notices.MATERIAL,clientText:n.message,actorId:'QA',decidedAt:'2026-11-19T00:00:00Z'}]));
 if(template){offer.proposalInput=adapter.buildLegacyOfferPrintInput(offer);offer.proposalInput.flight.baggage=baggage;offer.proposalInput.proposalTemplate.selected=template;offer.proposalTemplate={selected:template};}
 return offer;
}
function checkClient(text){for(const value of forbidden)assert(!text.includes(value),value);assert(text.includes(transfer));assert(text.includes(cancellation));}
const baggageCases=[['zero',{confirmed:true,cabin:{pieces:0},personalItem:{pieces:0}},'Ръчен багаж: 0 бр.; Личен багаж: 0 бр.'],['detail',{confirmed:true,cabin:{pieces:1,weightKg:8}},'Ръчен багаж: 1 бр., 8 кг'],['unconfirmed',{cabin:{pieces:1,weightKg:8}},'Багажът подлежи на потвърждение'],['malformed',{confirmed:true,cabin:{pieces:'1',weightKg:'8'}},'Багажът подлежи на потвърждение']];
test('F1/F2 actual HTML paths reuse canonical baggage and exclude fallback operator details',async()=>{
 for(const [name,baggage,label]of baggageCases)for(const template of [null,'multi-hotel','cathedral','city-discovery','multi-city']){
  const offer=fixture(baggage,template),before=JSON.stringify(offer),html=await api.renderOfferHtml(offer,{selectedHotelId:'a'}),print=api.renderGt63PrintOfferHtml(offer,{selectedHotelId:'a'});
  for(const text of [html,print]){checkClient(text);assert(text.includes(label),`${name}/${template}`);assert(!text.includes('Включен cabin baggage'));assert(!text.includes('Включен личен багаж.'));}
  assert.equal(JSON.stringify(offer),before);
 }
});
test('F2 fallback readiness ready/review never becomes a client badge; admin input retained',async()=>{
 for(const template of ['cathedral','city-discovery','multi-city'])for(const readiness of ['ready','review']){
  const offer=fixture('За потвърждение',template);offer.proposalInput.readiness=readiness;const before=JSON.stringify(offer);
  const html=await api.renderOfferHtml(offer);checkClient(html);assert(!html.includes('>ГОТОВО<'));assert(html.includes('Следваща стъпка'));assert.equal(offer.markupPercent,5);assert.equal(offer.proposalInput.pricing.marginPercent,5);assert.equal(offer.proposalInput.readiness,readiness);assert.equal(JSON.stringify(offer),before);
 }
});
test('F2 product browser script order resolves the canonical formatter lazily',()=>{
 const context=require('node:vm').createContext({});
 for(const relative of ['gt63-core/luxury-v11-renderer.js','public/hotel-occupancy.js','gt63-core/presentation-view-model.js'])require('node:vm').runInContext(fs.readFileSync(path.resolve(__dirname,'..',relative),'utf8'),context);
 const input=fixture({confirmed:true,cabin:{pieces:0}},'cathedral').proposalInput;
 context.GT63PresentationViewModel.setTrustedNotices(input,[{message:transfer},{message:cancellation}]);
 const html=context.GT63LuxuryV11Renderer.renderLuxuryProposal(input);checkClient(html);assert(html.includes('Ръчен багаж: 0 бр.'));
});
test('F3 comparison restores all displayed-hotel material terms, selected mode stays scoped',()=>{
 const offer=fixture('За потвърждение','multi-hotel');offer.hotels[0].roomsLeft='sold out';const before=JSON.stringify(offer),selected=api.renderGt63PrintOfferHtml(offer,{selectedHotelId:'a'}),comparison=api.renderGt63PrintOfferHtml(offer,{mode:'comparison',selectedHotelId:'a'});
 checkClient(selected);checkClient(comparison);assert(selected.includes('QA Alpha'));assert(selected.includes('ограничена или липсваща наличност'));assert(!selected.includes('QA Beta'));assert(!selected.includes('Изхранването за избрания хотел'));
 assert(comparison.includes('QA Alpha: Хотелът'));assert(comparison.includes('QA Beta: Хотелът'));assert(comparison.includes('QA Beta: Изхранването за избрания хотел'));assert(comparison.includes('QA Beta: Хотелската заетост'));assert(comparison.includes('QA Alpha'));assert.equal(JSON.stringify(offer),before);
 const input={hotelOptions:offer.hotels};model.setTrustedNotices(input,[{message:'A material term',parameters:{hotelId:'a'}},{message:'B material term',parameters:{hotelId:'b'}},{message:'Unshown hotel term',parameters:{hotelId:'c'}}]);assert.deepEqual(model.presentationNotices(input).map(n=>n.text),['A material term']);assert.deepEqual(model.presentationNotices(input,{mode:'comparison'}).map(n=>n.text),['QA Alpha: A material term','QA Beta: B material term']);
});
test('F1/F3 actual PDF bytes preserve baggage facts and attributed comparison conditions',async()=>{
 const browser=await require('puppeteer').launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const [name,baggage,label]of [...baggageCases,['comparison','За потвърждение','Багажът подлежи на потвърждение']]){
   const offer=fixture(baggage,'multi-hotel');if(name==='comparison')offer.hotels[0].roomsLeft='sold out';const html=api.renderGt63PrintOfferHtml(offer,{mode:name==='comparison'?'comparison':'selected',selectedHotelId:'a'}),page=await browser.newPage();
   await page.setRequestInterception(true);page.on('request',request=>request.abort());await page.setContent(html,{waitUntil:'domcontentloaded'});
   const bytes=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,margin:{top:'0',right:'0',bottom:'0',left:'0'}});await page.close();assert.equal(Buffer.from(bytes).subarray(0,4).toString(),'%PDF');
   const text=execFileSync('pdftotext',['-','-'],{input:Buffer.from(bytes),encoding:'utf8'}).replace(/\s+/g,' ');checkClient(text);assert(text.includes(label),name);assert(!text.includes('Включен cabin baggage'));assert(!text.includes('Включен личен багаж.'));
   if(name==='comparison'){assert(text.includes('QA Alpha'));assert(text.includes('QA Alpha: Хотелът'));assert(text.includes('QA Beta: Хотелът'));assert(text.includes('QA Beta: Изхранването за избрания хотел'));assert(text.includes('QA Beta: Хотелската заетост'));}else assert(!text.includes('QA Beta'));
   if(process.env.AYA_REMEDIATION_EVIDENCE_DIR){fs.mkdirSync(process.env.AYA_REMEDIATION_EVIDENCE_DIR,{recursive:true});const prefix=path.join(process.env.AYA_REMEDIATION_EVIDENCE_DIR,name);fs.writeFileSync(prefix+'.pdf',bytes);fs.writeFileSync(prefix+'.txt',text);fs.writeFileSync(prefix+'.html',html);}
   console.log('PDF verified',name,bytes.length);
  }
 }finally{await browser.close();}
});
