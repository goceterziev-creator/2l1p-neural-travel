'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer');
(async()=>{const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 const page=await browser.newPage();await page.setViewport({width:390,height:844});await page.setContent('<html><body></body></html>');
 for(const p of ['server/travel-normalizers/date-normalizer.js','public/flight-data-consistency.js'])await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'..',p),'utf8')});
 const source=fs.readFileSync(path.join(__dirname,'../public/admin.js'),'utf8');await page.addScriptTag({content:source.slice(source.indexOf('async function reviewFlightDateConsistencyUI('),source.indexOf('function syncPrimaryFlightDateFields('))});
 await page.evaluate(()=>{window.fixture={price:7173.89,outboundSegments:[{flightNumber:'TK1030',from:'SOF',to:'IST',departure:'11-21T21:45',arrival:'11-22T00:15'}]};window.before=JSON.stringify(fixture);window.pending=reviewFlightDateConsistencyUI(fixture,true);});
 await page.waitForSelector('dialog[open]');assert.equal(await page.$$eval('dialog button',b=>b.length),4);await page.click('[data-date-source="cancel"]');assert.equal(await page.evaluate(()=>pending),null);
 const dates=['2026-11-21','2026-11-22'];page.on('dialog',async d=>{if(d.type()==='prompt')await d.accept(dates.shift());else if(d.type()==='confirm')await d.accept();else{console.error(d.message());await d.dismiss();}});
 await page.evaluate(()=>{window.pending=reviewFlightDateConsistencyUI(fixture,true);});await page.waitForSelector('dialog[open]');await page.click('[data-date-source="manual"]');
 const result=await page.evaluate(async()=>({result:await pending,unchanged:before===JSON.stringify(fixture)}));assert.equal(result.result.outboundSegments[0].arrival,'2026-11-22T00:15');assert.equal(result.result.price,7173.89);assert(result.unchanged);console.log('PASS real Chromium: source buttons, cancel, manual dates, final confirmation, overnight clock, immutable input');
 page.removeAllListeners('dialog');
 await page.evaluate(()=>{const OriginalDate=Date;window.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:['2026-11-19T12:00:00Z']));}};});
 for(const approved of [false,true]) {
  page.once('dialog',async dialog=>{assert.equal(dialog.type(),'confirm');assert(dialog.message().includes('CONTEXT_RESOLVED_YEAR'));if(approved)await dialog.accept();else await dialog.dismiss();});
  const resolved=await page.evaluate(async()=>({result:await reviewFlightDateConsistencyUI(fixture),unchanged:before===JSON.stringify(fixture)}));
  assert.equal(Boolean(resolved.result),approved);assert(resolved.unchanged);
  if(approved){assert.equal(resolved.result.outboundSegments[0].departure,'2026-11-21T21:45');assert.equal(resolved.result.outboundSegments[0].arrival,'2026-11-22T00:15');}
 }
 console.log('PASS real Chromium: future current-year proposal, provenance, approval/cancel and no source mutation');
 await page.evaluate(()=>{window.$=()=>({value:'21.11.2026 - 29.11.2026'});window.fixture={outboundSegments:[{from:'SOF',to:'IST',departure:'21 Nov 21:45',arrival:'22 Nov 00:15'}]};window.before=JSON.stringify(fixture);if(!AYAFlightDataConsistency.inspect(fixture).ok)throw Error('Expected recognized yearless input');});
 for(const approved of [false,true]) {
  page.once('dialog',async dialog=>{assert.equal(dialog.type(),'confirm');assert(dialog.message().includes('CONTEXT_RESOLVED_YEAR'));if(approved)await dialog.accept();else await dialog.dismiss();});
  const resolved=await page.evaluate(async()=>({result:await reviewFlightDateConsistencyUI(fixture),unchanged:before===JSON.stringify(fixture)}));
  assert.equal(Boolean(resolved.result),approved);assert(resolved.unchanged);
  if(approved){assert.equal(resolved.result.outboundSegments[0].departure,'2026-11-21T21:45');assert.equal(resolved.result.dateResolution.evidence[0].raw,'21 Nov 21:45');}
 }
 console.log('PASS real Chromium F3: recognized yearless confirmation, provenance and cancel nonmutation');
 await page.evaluate(()=>{window.$=()=>({value:''});window.fixture={outboundSegments:[{from:'SOF',to:'IST',departure:'16 Nov 21:45',arrival:'17 Nov 00:15'}]};window.before=JSON.stringify(fixture);window.pending=reviewFlightDateConsistencyUI(fixture);});
 await page.waitForSelector('dialog[open]');await page.click('[data-date-source="cancel"]');
 assert.equal(await page.evaluate(()=>pending),null);assert(await page.evaluate(()=>before===JSON.stringify(fixture)));
 console.log('PASS real Chromium F3: unresolved recognized yearless dates retain manual source dialog and cancel nonmutation');



 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
