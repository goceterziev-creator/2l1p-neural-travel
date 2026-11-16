'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer');
(async()=>{const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 const page=await browser.newPage();await page.setViewport({width:390,height:844});await page.setContent('<html><body></body></html>');
 for(const p of ['server/travel-normalizers/date-normalizer.js','public/flight-data-consistency.js'])await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'..',p),'utf8')});
 const source=fs.readFileSync(path.join(__dirname,'../public/admin.js'),'utf8');await page.addScriptTag({content:source.slice(source.indexOf('async function reviewFlightDateConsistencyUI('),source.indexOf('function syncPrimaryFlightDateFields('))});
 await page.evaluate(()=>{window.fixture={price:7173.89,outboundSegments:[{flightNumber:'TK1030',from:'SOF',to:'IST',departure:'11-21T21:45',arrival:'11-22T00:15'}]};window.before=JSON.stringify(fixture);window.pending=reviewFlightDateConsistencyUI(fixture);});
 await page.waitForSelector('dialog[open]');assert.equal(await page.$$eval('dialog button',b=>b.length),4);await page.click('[data-date-source="cancel"]');assert.equal(await page.evaluate(()=>pending),null);
 const dates=['2026-11-21','2026-11-22'];page.on('dialog',async d=>{if(d.type()==='prompt')await d.accept(dates.shift());else if(d.type()==='confirm')await d.accept();else{console.error(d.message());await d.dismiss();}});
 await page.evaluate(()=>{window.pending=reviewFlightDateConsistencyUI(fixture);});await page.waitForSelector('dialog[open]');await page.click('[data-date-source="manual"]');
 const result=await page.evaluate(async()=>({result:await pending,unchanged:before===JSON.stringify(fixture)}));assert.equal(result.result.outboundSegments[0].arrival,'2026-11-22T00:15');assert.equal(result.result.price,7173.89);assert(result.unchanged);console.log('PASS real Chromium: source buttons, cancel, manual dates, final confirmation, overnight clock, immutable input');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
