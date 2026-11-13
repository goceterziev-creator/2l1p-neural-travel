"use strict";
// Presentation-only synthetic fixture: no credentials, production routes or DB writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),Module=require('node:module');
const puppeteer=require('puppeteer');
const root=path.resolve(__dirname,'..'),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'aya-presentation-'));
for(const [key,file] of Object.entries({DATA_DIR:'.',DB_FILE:'db.json',AIRPORT_CONFIG_FILE:'airports.json',OCR_PATTERN_CONFIG_FILE:'ocr.json'}))process.env[key]=path.join(scratch,file);
process.env.SERPAPI_KEY='';
const out=process.env.AYA_PRESENTATION_OUTPUT||scratch,captureOnly=process.env.AYA_PRESENTATION_CAPTURE_ONLY==='1';fs.mkdirSync(out,{recursive:true});
const filename=path.join(root,'server.js'),harness=new Module(filename,module);harness.filename=filename;harness.paths=Module._nodeModulePaths(root);
harness._compile(fs.readFileSync(filename,'utf8')+'\nmodule.exports.presentationTest={renderOfferHtml,renderGt63PrintOfferHtml};',filename);
const api=harness.exports.presentationTest,adapter=require('../gt63-core/legacy-offer-print-input'),vm=require('../gt63-core/presentation-view-model');
const rows=[],documents={};let browser,server;
const canonicalPrice=s=>String(s).replace(/[\s\u00a0\u202f]/g,'').replace(/,(?=\d{3}(?:[.,]|EUR))/g,'').replace(/,(?=\d{2}(?:EUR|$))/g,'.');
(async()=>{try{
 server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/offer-hotel-selection.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,'public/offer-hotel-selection.js')));return;}if(url.pathname.startsWith('/test-images/')){const hive=url.pathname.includes('hive');res.setHeader('Content-Type','image/png');res.end(await require('sharp')(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640"><rect width="960" height="640" fill="${hive?'#235c66':'#886749'}"/><path d="M0 480L400 160L960 480V640H0" fill="#ffffff" opacity=".12"/><text x="60" y="100" fill="white" font-size="30">SYNTHETIC QA IMAGE — NOT A HOTEL PHOTO</text><text x="60" y="350" fill="white" font-size="70">${hive?'THE HIVE':'TRIVIHO'}</text></svg>`)).png().toBuffer());return;}if(documents[url.pathname]){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(documents[url.pathname]);return;}res.writeHead(404);res.end();});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const offer={id:'SYNTHETIC-PRESENTATION-V2',clientName:'QA ONLY — NOT PRODUCTION',destination:'Рим',travelDates:'16.11.2026 - 20.11.2026',guests:'2 възрастни',currency:'EUR',markupPercent:0,finalPrice:1034.06,flightPrice:200,status:'draft',validationWarnings:['[INFO] CIA: Проверете трансфера до хотела.','[WARNING] Условията за анулация изискват потвърждение.'],
 flights:[{route:'SOF → CIA / CIA → SOF',airline:'Buzz / Malta Air',price:200,baggage:'Тестов багаж — реалните условия са за потвърждение',outboundSegments:[{from:'SOF',to:'CIA',departure:'2026-11-16T13:25',arrival:'2026-11-16T14:15',airline:'Buzz',flightNumber:'FR625'}],inboundSegments:[{from:'CIA',to:'SOF',departure:'2026-11-20T12:25',arrival:'2026-11-20T15:10',airline:'Malta Air',flightNumber:'FR626'}]}],
 hotels:[{id:'qa-hive',name:'The Hive Hotel',price:834.06,selected:true,room:'QA стая — реалната стая е за потвърждение',meal:'Изхранване за потвърждение',description:'Синтетични данни за визуален тест. Наличността и условията не са независимо потвърдени.',area:'Рим',images:[base+'/test-images/hive.png'],occupancy:{adults:2,children:0,rooms:1,confirmed:true}},{id:'qa-triviho',name:'Triviho Hotel',price:1123.78,selected:false,room:'QA стая — реалната стая е за потвърждение',meal:'Изхранване за потвърждение',description:'Синтетични данни за визуален тест. Наличността и условията не са независимо потвърдени.',area:'Рим',images:[base+'/test-images/triviho.png'],occupancy:{adults:2,children:0,rooms:1,confirmed:true}}]};
 const before=JSON.stringify(offer),input=adapter.buildLegacyOfferPrintInput(offer),registry={...offer,proposalInput:input,proposalTemplate:{selected:'multi-hotel'}};
 documents['/legacy']=await api.renderOfferHtml(offer);documents['/registry']=await api.renderOfferHtml(registry);
 // Replace only navigation hosts inside this disposable fixture, never application data.
 for(const key of ['/legacy','/registry'])documents[key]=documents[key].replace(/https?:\/\/[^"<> ]+(?=\/api\/offers\/)/g,base);
 for(const id of ['qa-hive','qa-triviho'])documents['/print-'+id]=api.renderGt63PrintOfferHtml(offer,{selectedHotelId:id});
 assert.equal(JSON.stringify(offer),before);
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();
 const genericImage=await require('sharp')({create:{width:960,height:640,channels:3,background:'#193245'}}).png().toBuffer();
 await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(base)||r.url().startsWith('data:')?r.continue():r.resourceType()==='image'?r.respond({contentType:'image/png',body:genericImage}):r.abort());
 for(const mode of ['legacy','registry'])for(const width of [360,390,430]){
  await page.setViewport({width,height:844,deviceScaleFactor:1});await page.goto(base+'/'+mode,{waitUntil:'networkidle0'});
  for(const [id,total]of [['qa-triviho',1323.78],['qa-hive',1034.06]]){
   const selector=mode==='legacy'?`[data-hotel-choice-card][data-hotel-id="${id}"] [data-hotel-choice]`:`button[data-option-id="${id}"]`;
   await page.click(selector);
   await page.evaluate(()=>Promise.all([...document.images].map(image=>image.decode().catch(()=>{}))));
   const actual=await page.evaluate(mode=>({overflow:document.documentElement.scrollWidth>innerWidth+1,price:document.querySelector(mode==='legacy'?'[data-client-price]':'.js-selected-option-price').textContent,link:document.querySelector(mode==='legacy'?'[data-selected-hotel-pdf]':'[data-offer-pdf]').href,warnings:[...document.querySelectorAll('.aya-client-notices li,.v11-note li,.warning li')].map(x=>({text:x.textContent,visible:x.getBoundingClientRect().height>0})),broken:[...document.images].filter(x=>!x.hidden&&x.getBoundingClientRect().width>0&&(!x.complete||!x.naturalWidth)).length,selectedImage:document.querySelector(mode==='legacy'?'.hotel-option-card.selected .hotel-images img':'.js-selected-option-image')?.src,smallTargets:[...document.querySelectorAll('button[data-hotel-choice],button.v11-prefer-option,.actions a,.gt63-client-actions a')].filter(x=>x.getBoundingClientRect().height<44).length}),mode);
   assert(actual.link.includes('selectedHotelId='+id));assert.equal(Number(canonicalPrice(actual.price).replace(/EUR/g,'')),total);
   if(!captureOnly){assert.equal(actual.overflow,false,mode+' '+width+' overflow');assert.equal(actual.broken,0);assert(actual.selectedImage.includes('/test-images/'+(id==='qa-hive'?'hive':'triviho')+'.png'));assert(actual.warnings.some(w=>w.text.includes('анулация')));assert.equal(actual.smallTargets,0);assert.equal(actual.warnings.length,2);assert(actual.warnings.every(w=>w.visible));}
   await page.screenshot({path:path.join(out,`${mode}-${width}-${id}.png`),fullPage:true});rows.push({mode,width,id,...actual});
  }
 }
 for(const [id,total]of [['qa-hive',1034.06],['qa-triviho',1323.78]]){
  await page.goto(base+'/print-'+id,{waitUntil:'networkidle0'});await page.emulateMediaType('print');
  const text=await page.$eval('body',x=>x.textContent);assert(text.includes('FR625')&&text.includes('FR626')&&text.includes('13:25')&&text.includes('14:15')&&text.includes('12:25')&&text.includes('15:10'));assert(canonicalPrice(text).includes(String(total)));
  const other=id==='qa-hive'?'Triviho Hotel':'The Hive Hotel';assert(!text.includes(other));
  if(!captureOnly){assert(text.includes('Проверете трансфера'));assert(text.includes('Условията за анулация'));}
  const pdf=Buffer.from(await page.pdf({preferCSSPageSize:true,printBackground:true}));fs.writeFileSync(path.join(out,id+'.pdf'),pdf);
  const pageCount=(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
  if(!captureOnly){assert(pageCount<=5,'compact synthetic PDF must stay within five portrait pages');const box=pdf.toString('latin1').match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/);assert(box&&Number(box[1])<Number(box[2]),'portrait media box');}
  rows.push({mode:'pdf',id,total,pageCount});await page.emulateMediaType('screen');
  assert.equal(vm.optionPackageTotal(offer.hotels.find(h=>h.id===id),input),total);
 }
 assert.equal(JSON.stringify(offer),before);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({captureOnly,synthetic:true,rows},null,2));console.log(JSON.stringify({result:'PASS',captureOnly,rows:rows.length,pdf:rows.filter(x=>x.mode==='pdf')}));
}catch(e){console.error(e);process.exitCode=1;}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(scratch,{recursive:true,force:true});}})();
