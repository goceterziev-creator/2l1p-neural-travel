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



 // Execute the production Use Result and addFlight handlers with a synthetic intake.
 await page.addScriptTag({content:
   source.slice(source.indexOf('async function applyUniversalTravelIntakeResult('), source.indexOf('function getImportedFlightPrice(')) +
   source.slice(source.indexOf('function flightIdentityKey('), source.indexOf('function addHotel('))
 });
 await page.evaluate(() => {
   const fields = {
     travelDates: { value: '25.11 - 27.11' },
     universalFlightDeparture: { value: 'SOF -> SAW, 2026-11-25T12:55 - 2026-11-25T15:10' },
     universalFlightArrival: { value: 'SAW -> SOF, 2026-11-27T18:05 - 2026-11-27T18:25' },
     flightDeparture: { value: '' },
     flightArrival: { value: '' }
   };
   window.$ = id => fields[id];
   window.flights = [];
   window.normalizeFlightFields = flight => flight;
   window.renderFlightCards = () => {};
   window.updateAutoPrice = () => {};
   window.calculatePricing = () => {};
   window.setAdminBaggageInput = () => {};
   const flight = {
     airline: 'Pegasus', route: 'SOF -> SAW / SAW -> SOF', currency: 'EUR', price: 100,
     outbound: { segments: [{ flightNumber: 'PC272', from: 'SOF', to: 'SAW', departure: '25-ноем. 12:55', arrival: '25-ноем. 15:10' }] },
     inbound: { segments: [{ flightNumber: 'PC273', from: 'SAW', to: 'SOF', departure: '27-ноем. 18:05', arrival: '27-ноем. 18:25' }] }
   };
   window.latestUniversalTravelIntake = { mode: 'GT63_SMART_IMPORT', flight, offerFlight: flight };
   window.intakeBefore = JSON.stringify(latestUniversalTravelIntake);
 });
 await page.evaluate(() => { window.pending = applyUniversalTravelIntakeResult(); });
 await page.click('[data-date-source="cancel"]');
 await page.evaluate(() => pending);
 assert.equal(await page.evaluate(() => flights.length), 0);

 const manualDates = ['2026-11-25', '2026-11-25', '2026-11-27', '2026-11-27'];
 const dialogs = [];
 page.on('dialog', async dialog => {
   dialogs.push(dialog.message());
   await dialog.accept(dialog.type() === 'prompt' ? manualDates.shift() : undefined);
 });
 await page.evaluate(() => { window.pending = applyUniversalTravelIntakeResult(); });
 await page.click('[data-date-source="manual"]');
 await page.evaluate(() => pending);
 assert.equal(manualDates.length, 0);
 assert(dialogs.some(message => message.includes('Smart Import result applied')));
 assert(!dialogs.some(message => message.includes('Датите не са приложени')));
 const applied = await page.evaluate(() => ({
   flight: flights[0],
   summaries: [$('flightDeparture').value, $('flightArrival').value],
   conflicts: AYAFlightDataConsistency.offerConflicts({ flights }),
   unchanged: JSON.stringify(latestUniversalTravelIntake) === intakeBefore
 }));
 assert.deepEqual(applied.flight.outboundSegments.map(({ flightNumber, departure, arrival }) => [flightNumber, departure, arrival]), [
   ['PC272', '2026-11-25T12:55', '2026-11-25T15:10']
 ]);
 assert.deepEqual(applied.flight.inboundSegments.map(({ flightNumber, departure, arrival }) => [flightNumber, departure, arrival]), [
   ['PC273', '2026-11-27T18:05', '2026-11-27T18:25']
 ]);
 assert.deepEqual(applied.summaries, [applied.flight.departure, applied.flight.arrival]);
 assert.deepEqual(applied.conflicts, []);
 assert(applied.unchanged);
 console.log('PASS real Chromium: PC272/PC273 Use Result, manual dates, synchronized summaries, and save guard');

 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
