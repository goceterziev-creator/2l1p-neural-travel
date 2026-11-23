'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),{execFileSync}=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aya-meal-evidence-'));
for(const [k,f] of Object.entries({DATA_DIR:'.',DB_FILE:'db.json',AIRPORT_CONFIG_FILE:'airports.json',OCR_PATTERN_CONFIG_FILE:'ocr.json'}))process.env[k]=path.join(temp,f);
process.env.SERPAPI_KEY='';process.on('exit',()=>fs.rmSync(temp,{recursive:true,force:true}));
const filename=path.resolve(__dirname,'../server.js'),h=new Module(filename,module);h.filename=filename;h.paths=Module._nodeModulePaths(path.dirname(filename));
h._compile(fs.readFileSync(filename,'utf8')+'\nmodule.exports.mealTest={normalizeHotelTextToBulgarian,enrichHotelImportFallbacks,renderOfferHtml,renderGt63PrintOfferHtml,extractHotelHintWithSerpApi,buildSmartImportResponse,normalizeOffer,setMealVisionStub(stub){const original=callVisionJson;callVisionJson=stub;return()=>{callVisionJson=original;};}};',filename);
const api=h.exports.mealTest,vm=require('../gt63-core/presentation-view-model');
function imported(raw){return api.enrichHotelImportFallbacks(api.normalizeHotelTextToBulgarian(raw),raw,'Абу Даби');}
const rawCases=[
 ['Desert Key',{name:'QA Desert Key',price:1659.4,currency:'EUR',meal:'',description:'Безплатна анулация. Включена закуска.',amenities:['WiFi','Включена закуска']},''],
 ['tentative',{meal:'Възможна закуска според видимата информация',description:'Включена закуска.'},''],
 ['unsupported model claim',{meal:'Breakfast included',description:'Breakfast included.'},''],
 ['EDITION',{meal:'Breakfast included',mealSourceText:'Закуската е включена в цената',description:'Безплатна анулация.'},'Включена закуска'],
 ['Mayan',{meal:'',description:'Апартамент с 2 спални.'},''],
 ['paid breakfast',{meal:'Breakfast included',mealSourceText:'Breakfast available for an additional charge'},'Breakfast available for an additional charge'],
 ['not included',{meal:'Breakfast included',mealSourceText:'Breakfast not included'},''],
 ['different board',{meal:'Breakfast and dinner',mealSourceText:'Breakfast included'},''],
 ['room only',{meal:'Room only',mealSourceText:'Room only'},'Без включено изхранване'],
 ['half board',{meal:'Half board',mealSourceText:'Half board'},'Полупансион']
];
for(const [name,raw,expected]of rawCases)test('import evidence: '+name,()=>{const before=JSON.stringify(raw),out=imported(raw);assert.equal(out.meal,expected);assert.equal(JSON.stringify(raw),before);if(!expected)assert.doesNotMatch(out.description,/включена закуска|breakfast included/i);if(raw.description?.includes('Безплатна анулация'))assert(out.description.includes('Безплатна анулация'));if(raw.price)assert.equal(out.price,raw.price);});
for(const raw of ['Възможна закуска според видимата информация','Закуска срещу доплащане','Breakfast not included','Breakfast not confirmed','Breakfast on request','Possible all inclusive','не е потвърдена закуска'])test('qualifier precedes meal keyword: '+raw,()=>assert.equal(vm.compactMealLabel(raw),raw==='Закуска срещу доплащане'?raw:'Хранене за потвърждение'));
for(const raw of ['Без включено изхранване','Без включена закуска','Room only'])test('exclusion is not breakfast inclusion: '+raw,()=>assert.equal(vm.compactMealLabel(raw),'Без включено хранене'));
test('negative description is not rewritten as an inclusion claim',()=>assert.equal(imported({description:'Закуската не е включена в цената.'}).description,'Закуската не е включена в цената.'));
function offer(meal,description='Синтетична хотелска опция.'){return {id:'SYNTHETIC-MEAL-EVIDENCE',status:'draft',destination:'Абу Даби',travelDates:'21.11.2026 - 29.11.2026',guests:'2 възрастни и 2 деца',finalPrice:4311.25,hotelPrice:1659.4,hotels:[{id:'desert',selected:true,name:'QA Desert Key',price:1659.4,meal,description,room:'Апартамент',occupancy:{adults:2,children:2,rooms:1,childAges:[1,9],confirmed:true}}],flights:[{airline:'QA Airline',route:'SOF-AUH',baggage:'1 ръчен багаж 8 кг',outboundSegments:[{from:'SOF',to:'AUH',departure:'2026-11-21T16:00',arrival:'2026-11-22T01:30',flightNumber:'QA101'}]}]};}
const fixtures=[['legacy-tentative',offer('Възможна закуска според видимата информация','Безплатна анулация. Включена закуска.'),'Хранене за потвърждение'],['import-desert',offer(imported(rawCases[0][1]).meal,imported(rawCases[0][1]).description),'Хранене за потвърждение'],['confirmed-edition',offer('Включена закуска'),'Закуска'],['paid-bg',offer('Закуска срещу такса'),'Закуска срещу такса'],['paid-en',offer('Breakfast for a fee'),'Breakfast for a fee'],['mixed-dinner',offer('Без закуска, вечерята е включена'),'Без закуска, вечерята е включена'],['unrelated-inclusion',offer(imported({meal:'Breakfast included',mealSourceText:'Breakfast available; parking included',description:'Breakfast included.'}).meal),'Хранене за потвърждение']];
const finalPaidCases = [
 ['included-paid-en', 'Breakfast is included for a fee of 15 EUR', '15 EUR'],
 ['included-extra-en', 'Breakfast included for an additional charge', 'additional charge'],
 ['included-paid-bg', 'Закуската е включена срещу доплащане 20 EUR', '20 EUR'],
 ['comma-paid-en', 'Breakfast is included, for a fee of 15 EUR', '15 EUR'],
 ['comma-paid-bg', 'Закуската е включена, срещу доплащане 20 EUR', '20 EUR'],
 ['paid-and-dinner', 'Breakfast is included for a fee of 15 EUR; dinner included', '15 EUR']
];
for (const [name, quote, charge] of finalPaidCases) {
 const raw = {meal:'Включена закуска', mealSourceText:quote, description:'Включена закуска.'};
 const hotel = imported(raw);
 fixtures.push([name, offer(hotel.meal, hotel.description), name.startsWith('comma-paid-') ? quote : vm.compactMealLabel(quote)]);
 test('paid evidence overrides included: '+name,()=>{
  const before=JSON.stringify(raw);
  assert.equal(vm.mealServiceConditions(quote).breakfast,'paid');
  assert.equal(imported(raw).meal,quote);
  assert(vm.compactMealLabel(quote).includes(charge));
  if(name==='paid-and-dinner')assert.equal(vm.mealServiceConditions(quote).dinner,'included');
  assert.equal(JSON.stringify(raw),before);
 });
}
test('unrelated parking fee does not change included breakfast',()=>{
 const quote='Breakfast included; parking for a fee of 15 EUR';
 assert.equal(vm.mealServiceConditions(quote).breakfast,'included');
 assert.equal(imported({meal:'Breakfast included',mealSourceText:quote}).meal,'Включена закуска');
});
test('active Vision extraction receives the paid contract and preserves returned fee evidence',async()=>{
 for(const [name,quote]of finalPaidCases){
  let captured='';
  const raw={name:'QA Desert Key',room:'Апартамент',price:1659.4,currency:'EUR',meal:'Включена закуска',mealSourceText:quote};
  const before=JSON.stringify(raw);
  const restore=api.setMealVisionStub(async request=>{captured=request.prompt;return raw;});
  try {
   const result=await api.extractHotelHintWithSerpApi([{buffer:Buffer.from('synthetic fixture'),mimetype:'image/png'}],{archive:false,destination:'Абу Даби'});
   assert(/explicitly paid breakfast\/dinner\/other meals/.test(captured),name);
   assert(/amount and currency verbatim/.test(captured),name);
   assert(!captured.includes('meal must be empty unless mealSourceText proves the selected rate includes it'));
   assert.equal(result.hotel.meal,quote);
   assert.equal(result.rawParsedHotels[0].mealSourceText,quote);
   assert.equal(JSON.stringify(raw),before);
  }finally{restore();}
 }
});
test('actual client HTML and print retain meal certainty and input data',async()=>{for(const [name,o,label]of fixtures){const before=JSON.stringify(o),html=await api.renderOfferHtml(o),print=api.renderGt63PrintOfferHtml(o,{selectedHotelId:'desert'});assert(html.includes(o.meal||'Информация при запитване'),name);if(name.startsWith('comma-paid-'))assert(html.includes(label),name);assert(print.includes(label),name);if(name==='legacy-tentative'){assert(!html.includes('Включена закуска'));assert(!print.includes('Включена закуска'));assert(html.includes('Безплатна анулация'));}if(label!=='Закуска')assert.doesNotMatch(print,/<(?:strong|p)>Закуска<\//);assert(print.includes('4 311,25 EUR'));assert.equal(JSON.stringify(o),before);}});
test('registry client HTML also rejects contradictory meal descriptions',()=>{const render=require('../gt63-core/renderers/multi-hotel').renderMultiHotelProposal,adapt=require('../gt63-core/legacy-offer-print-input').buildLegacyOfferPrintInput;for(const [name,o,label]of fixtures){const input=adapt(o),before=JSON.stringify(input),html=render(input,{selectedHotelId:'desert'});assert(html.includes(label),name);if(label==='Хранене за потвърждение')assert(!html.includes('Включена закуска'));assert.equal(JSON.stringify(input),before);}});
test('actual PDF bytes preserve unconfirmed vs confirmed meal', async () => {
  const browser = await require('puppeteer').launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  try {
    for (const [name, offerData, label] of fixtures) {
      const before = JSON.stringify(offerData);
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', request => request.abort());
      await page.setContent(api.renderGt63PrintOfferHtml(offerData, { selectedHotelId: 'desert' }), { waitUntil: 'domcontentloaded' });
      if (name === 'paid-and-dinner' || name.startsWith('comma-paid-')) {
        const pending = await page.$$eval('[data-service-state="pending"] article strong', nodes => nodes.map(node => node.textContent));
        const included = await page.$$eval('[data-service-state="included"] article strong', nodes => nodes.map(node => node.textContent));
        if (name === 'paid-and-dinner') {
          assert(pending.includes('Breakfast is included for a fee of 15 EUR'), name);
          assert(included.includes('dinner included'), name);
        } else {
          assert(pending.includes(label), name);
          assert(!included.includes(label), name);
        }
      }
      const bytes = Buffer.from(await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true }));
      assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
      const text = execFileSync('pdftotext', ['-', '-'], { input: bytes, encoding: 'utf8' }).replace(/\s+/g, ' ');
      assert(text.includes(label), name);
      if (name === 'paid-and-dinner') {
        assert(text.includes('dinner included Изрично посочено като включено'), name);
        assert(text.includes('Breakfast is included for a fee of 15 EUR За потвърждение преди резервация'), name);
      }
      if (name.startsWith('comma-paid-')) {
        assert(text.includes(label + ' За потвърждение преди резервация'), name);
      }
      if (label === 'Хранене за потвърждение') assert(!text.includes('Закуска'), name);
      for (const value of ['4 311,25 EUR', 'QA Desert Key', '1 ръчен багаж 8 кг', '2026', '2 възрастни', '2 деца']) {
        assert(text.includes(value), name + ': ' + value);
      }
      assert.equal(JSON.stringify(offerData), before);
      if (process.env.AYA_MEAL_EVIDENCE_DIR) {
        fs.mkdirSync(process.env.AYA_MEAL_EVIDENCE_DIR, { recursive: true });
        fs.writeFileSync(path.join(process.env.AYA_MEAL_EVIDENCE_DIR, name + '.pdf'), bytes);
        fs.writeFileSync(path.join(process.env.AYA_MEAL_EVIDENCE_DIR, name + '.txt'), text);
      }
      await page.close();
      console.log('PDF verified', name, bytes.length);
    }
  } finally {
    await browser.close();
  }
});

for(const quote of ['Breakfast available; parking included','Breakfast available; WiFi included','Breakfast available and parking included','Закуска се предлага; паркингът е включен'])test('unrelated inclusion cannot prove breakfast: '+quote,()=>{const raw={meal:'Breakfast included',description:'Breakfast included.'},before=JSON.stringify(raw);assert.equal(require('../server/smart-import-hotel-review').importedMealEvidence(raw,{mealSourceText:quote}).meal,'');assert.equal(JSON.stringify(raw),before);});
for(const value of ['Закуска срещу такса','Breakfast for a fee','Breakfast available for a fee','Breakfast available for an additional charge','Breakfast for a fee of 15 EUR','Закуска срещу такса 20 EUR','Без закуска, вечерята е включена','No breakfast, dinner included'])test('preserve separate material meal conditions: '+value,()=>{assert.equal(vm.compactMealLabel(value),value);assert.equal(require('../server/smart-import-hotel-review').importedMealEvidence({meal:'Breakfast included'},{mealSourceText:value}).meal,value);});
for(const quote of ['Breakfast not included; parking included','Breakfast on request; WiFi included','Без закуска; паркингът е включен'])test('negative service evidence is not inclusion: '+quote,()=>assert.equal(require('../server/smart-import-hotel-review').importedMealEvidence({meal:'Breakfast included'},{mealSourceText:quote}).meal,''));
test('paid meals are under confirmation conditions in print, not quoted inclusion',()=>{const html=api.renderGt63PrintOfferHtml(offer('Закуска срещу такса'),{selectedHotelId:'desert'});const section=html.slice(html.indexOf('Условия за потвърждение'));assert(section.includes('Закуска срещу такса'));});


const p2Meal = 'Breakfast is included for a fee of 15 EUR/person/day; dinner included';
const childAgeMeal = 'Breakfast for a fee of 15 EUR/adult/day, 20 EUR/child/day (ages 6–11); dinner included';
const prefixedChildAgeMeal = 'Breakfast for a fee of €15/adult/day, €20/child/day (ages 6–11); dinner included';
const childAgeYearsMeal = 'Breakfast for a fee of 15 EUR/adult/day, 20 EUR/child/day (ages 6–11 years); dinner included';
const prefixedChildAgeYearMeal = 'Breakfast for a fee of €15/adult/day, €20/child/day (age 1 year); dinner included';
const semicolonMeal = 'Breakfast for a fee of 15 EUR/adult/day; 20 EUR/child/day (ages 6–11 years); dinner included';
const sharedRoomMeal = 'Breakfast for a fee of 15 EUR/adult/day, 20 EUR/child/day (ages 6–11 years, when sharing a room); dinner included';
const semicolonQualifierMeal = 'Breakfast for a fee of 15 EUR/adult/day, 20 EUR/child/day (ages 6–11 years; when sharing a room); dinner included';
const nestedChildMeal = 'Breakfast for a fee of 15 EUR/adult/day, 20 EUR/child/day (ages 6–11 years (inclusive); when sharing a room); dinner included';
const weekendMeal = 'Breakfast for a fee of 15 EUR/adult/day (20 EUR/adult/day on weekends); dinner included';
const prefixedWeekendMeal = 'Breakfast for a fee of €15/adult/day (€20/adult/day on weekends); dinner included';
const weekdayMeal = 'Breakfast for a fee of 15 EUR/adult/day (20 EUR/adult/day on weekdays); dinner included';
const resetBreakfastMeal = 'Breakfast for a fee of 15 EUR/adult/day (parking; 30 EUR/adult/day on weekends; breakfast; 25 EUR/adult/day on weekdays); dinner included';
const alternatingMeal = 'Breakfast for a fee of 15 EUR/adult/day (breakfast; 18 EUR/adult/day on weekdays; spa; 30 EUR/adult/day on weekdays; breakfast; 25 EUR/adult/day on weekends; parking; 40 EUR/adult/day on weekends); dinner included';
const tieredBreakfast = 'Breakfast is available, for an additional fee of 15 EUR/adult/day, 20 EUR/child/day';
const tieredBreakfastBg = 'Закуската се предлага, срещу допълнително заплащане: 15 EUR/възрастен/ден, 20 EUR/дете/ден';

test('tiered paid breakfast survives Smart Import extraction, Apply and offer save normalization', async () => {
  const admin = fs.readFileSync(path.resolve(__dirname, '../public/admin.js'), 'utf8');
  const start = admin.indexOf('async function applyUniversalTravelIntakeResult()');
  const apply = admin.slice(start, admin.indexOf('\n}', start) + 2);
  for (const quote of [tieredBreakfast, tieredBreakfastBg, p2Meal, childAgeMeal, prefixedChildAgeMeal, childAgeYearsMeal, prefixedChildAgeYearMeal, semicolonMeal, sharedRoomMeal, semicolonQualifierMeal, nestedChildMeal, weekendMeal, prefixedWeekendMeal, weekdayMeal, resetBreakfastMeal, alternatingMeal]) {
    const raw = { name: 'QA Family Hotel', room: 'Family room', price: 300, currency: 'EUR', meal: quote, mealSourceText: quote };
    const restore = api.setMealVisionStub(async () => raw);
    let result;
    try {
      result = await api.extractHotelHintWithSerpApi([{ buffer: Buffer.from('synthetic fixture'), mimetype: 'image/png' }], { archive: false });
    } finally {
      restore();
    }
    assert.equal(result.rawParsedHotels[0].mealSourceText, quote);
    const data = api.buildSmartImportResponse({ offerHotel: result.hotel, offerHotelOptions: result.hotelOptions, hotelResult: result });
    const fields = { universalHotelMeal: { value: data.offerHotel.meal }, hotelMeal: { value: '' } };
    const applied = [];
    const warnings = [];
    const context = require('node:vm').createContext({
      latestUniversalTravelIntake: data,
      $: id => fields[id],
      reviewFlightDateConsistencyUI: async flight => flight,
      addHotel: hotel => applied.push(hotel),
      mergeCurrentValidationWarnings: rows => warnings.push(...rows),
      calculatePricing() {},
      alert() {}
    });
    require('node:vm').runInContext(apply, context);
    await context.applyUniversalTravelIntakeResult();
    assert.equal(fields.hotelMeal.value, quote, 'Apply must populate Meal');
    assert.equal(applied[0].meal, quote);
    assert.equal(warnings.length, 0);
    const saved = api.normalizeOffer({ destination: 'Абу Даби', hotels: applied, hotelMeal: fields.hotelMeal.value, hotelPrice: 300, currency: 'EUR' });
    const reloaded = JSON.parse(JSON.stringify(saved));
    assert.equal(reloaded.hotels[0].meal, quote);
    assert.equal(reloaded.hotels[0].price, 300);
    assert.equal(reloaded.hotels[0].selected, true);
  }
});

test('manually saved tiered breakfast survives client HTML, Print and actual PDF', async t => {
  const browser = await require('puppeteer').launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  try {
    for (const [name, meal, adultFee, childFee, unrelatedFee, unconfirmedRate, expectedServices = []] of [
      ['production-p1-en', tieredBreakfast, '15 EUR/adult/day', '20 EUR/child/day'],
      ['production-p1-bg', tieredBreakfastBg, '15 EUR/възрастен/ден', '20 EUR/дете/ден'],
      ['production-p1-mixed', tieredBreakfast + '; dinner included', '15 EUR/adult/day', '20 EUR/child/day'],
      ['production-p2', p2Meal, '15 EUR/person/day', null],
      ['parking-rate', 'Breakfast for a fee of 15 EUR/adult/day, 20 EUR/day parking; dinner included', '15 EUR/adult/day', null, '20 EUR/day parking'],
      ['spa-rate', 'Breakfast for a fee of 15 EUR/adult/day, 20 EUR/person/day spa access; dinner included', '15 EUR/adult/day', null, '20 EUR/person/day spa access'],
      ['prefixed-rates', 'Breakfast for a fee of €15/adult/day, €20/child/day; dinner included', '€15/adult/day', '€20/child/day'],
      ['child-age-rate', childAgeMeal, '15 EUR/adult/day', '20 EUR/child/day (ages 6–11)'],
      ['prefixed-child-age-rate', prefixedChildAgeMeal, '€15/adult/day', '€20/child/day (ages 6–11)'],
      ['child-age-years-rate', childAgeYearsMeal, '15 EUR/adult/day', '20 EUR/child/day (ages 6–11 years)'],
      ['prefixed-child-age-year-rate', prefixedChildAgeYearMeal, '€15/adult/day', '€20/child/day (age 1 year)'],
      ['child-age-years-spa-rate', 'Breakfast for a fee of 15 EUR/adult/day, €20/child/day (ages 6–11 years, spa access); dinner included', '15 EUR/adult/day', null, '€20/child/day'],
      ['child-age-years-parking-rate', 'Breakfast for a fee of 15 EUR/adult/day, €20/child/day (ages 6–11 years) parking; dinner included', '15 EUR/adult/day', null, '€20/child/day'],
      ['semicolon-child-rate', semicolonMeal, '15 EUR/adult/day', '20 EUR/child/day (ages 6–11 years)'],
      ['shared-room-child-rate', sharedRoomMeal, '15 EUR/adult/day', '20 EUR/child/day (ages 6–11 years, when sharing a room)'],
      ['semicolon-parking-rate', 'Breakfast for a fee of 15 EUR/adult/day; 20 EUR/child/day (ages 6–11 years) parking; dinner included', '15 EUR/adult/day', null, '20 EUR/child/day'],
      ['semicolon-unbound-rate', 'Breakfast for a fee of 15 EUR/adult/day; parking available; 20 EUR/child/day (ages 6–11 years); dinner included', '15 EUR/adult/day', null, '20 EUR/child/day'],
      ['shared-room-spa-rate', 'Breakfast for a fee of 15 EUR/adult/day, 20 EUR/child/day (ages 6–11 years, when sharing a room, spa access); dinner included', '15 EUR/adult/day', null, '20 EUR/child/day'],
      ['qualifier-semicolon', semicolonQualifierMeal, '15 EUR/adult/day', '20 EUR/child/day (ages 6–11 years; when sharing a room)'],
      ['parenthetical-parking', 'Breakfast for a fee of 15 EUR/adult/day (advance booking; parking for a fee of 20 EUR/day); dinner included', '15 EUR/adult/day (advance booking)', null, 'parking for a fee of 20 EUR/day'],
      ['parenthetical-spa', 'Breakfast for a fee of 15 EUR/adult/day (advance booking, spa access for 20 EUR/day); dinner included', '15 EUR/adult/day (advance booking)', null, 'spa access for 20 EUR/day'],
      ['parenthetical-transfer', 'Breakfast for a fee of 15 EUR/adult/day (advance booking; airport transfer for 35 EUR/person); dinner included', '15 EUR/adult/day (advance booking)', null, 'airport transfer for 35 EUR/person'],
      ['nested-booking', 'Breakfast for a fee of 15 EUR/adult/day (advance booking (at least 24 hours ahead; parking for 20 EUR/day)); dinner included', '15 EUR/adult/day (advance booking (at least 24 hours ahead))', null, 'parking for 20 EUR/day'],
      ['multiple-services', 'Breakfast for a fee of 15 EUR/adult/day (advance booking; luggage storage for 10 EUR/day; spa access for 20 EUR/day); dinner included', '15 EUR/adult/day (advance booking)', null, /luggage storage|spa access/],
      ['lowercase-service-fee', 'Breakfast for a fee of 15 EUR/adult/day (advance booking; luggage storage for 10 eur/day; spa access for 20 EUR/day); dinner included', '15 EUR/adult/day (advance booking)', null, /luggage storage|spa access/],
      ['weekend-meal-rate', weekendMeal, '15 EUR/adult/day', '20 EUR/adult/day on weekends'],
      ['prefixed-weekend-meal-rate', prefixedWeekendMeal, '€15/adult/day', '€20/adult/day on weekends'],
      ['weekday-meal-rate', weekdayMeal, '15 EUR/adult/day', '20 EUR/adult/day on weekdays'],
      ['weekday-booking-rate', 'Breakfast for a fee of €15/adult/day (advance booking; €20/adult/day on weekdays); dinner included', '€15/adult/day', '€20/adult/day on weekdays'],
      ['reset-breakfast', resetBreakfastMeal, '15 EUR/adult/day', '25 EUR/adult/day on weekdays', '30 EUR/adult/day on weekends', null, [['parking', '30 EUR/adult/day on weekends']]],
      ['alternating', alternatingMeal, '18 EUR/adult/day on weekdays', '25 EUR/adult/day on weekends', /30 EUR\/adult\/day on weekdays|40 EUR\/adult\/day on weekends/, null, [['spa', '30 EUR/adult/day on weekdays'], ['parking', '40 EUR/adult/day on weekends']]],
      ['parking-weekend-rate', 'Breakfast for a fee of 15 EUR/adult/day (advance booking; parking; 20 EUR/adult/day on weekends); dinner included', '15 EUR/adult/day (advance booking)', null, '20 EUR/adult/day on weekends', null, [['parking', '20 EUR/adult/day on weekends']]],
      ['spa-weekday-rate', 'Breakfast for a fee of 15 EUR/adult/day (advance booking; spa) (20 EUR/adult/day on weekdays); dinner included', '15 EUR/adult/day (advance booking)', null, '20 EUR/adult/day on weekdays', null, [['spa', '20 EUR/adult/day on weekdays']]],
      ['unconfirmed-alternative-rate', 'Breakfast for a fee of 15 EUR/adult/day (optional arrangements; 20 EUR/adult/day on weekends); dinner included', '15 EUR/adult/day', null, null, '20 EUR/adult/day on weekends'],
      ['weekend-service-fee', 'Breakfast for a fee of 15 EUR/adult/day (advance booking; locker rental for 20 gbp/adult/day on weekends); dinner included', '15 EUR/adult/day (advance booking)', null, /locker rental/],
      ['nested-child-age', nestedChildMeal, '15 EUR/adult/day', '20 EUR/child/day (ages 6–11 years (inclusive); when sharing a room)'],
      ['nested-child-extra-fee', 'Breakfast for a fee of 15 EUR/adult/day, 20 EUR/child/day (ages 6–11 years (inclusive); storage for 10 EUR/day); dinner included', '15 EUR/adult/day', null, /20 EUR\/child\/day|storage for 10 EUR/],
      ['child-parking-rate', 'Breakfast for a fee of 15 EUR/adult/day, 20 EUR/child/day (parking); dinner included', '15 EUR/adult/day', null, '20 EUR/child/day (parking)'],
      ['child-spa-rate', 'Breakfast for a fee of 15 EUR/adult/day, €20/child/day (ages 6–11, spa access); dinner included', '15 EUR/adult/day', null, '€20/child/day']
    ]) {
      await t.test(name, async () => {
        const hasUnrelatedFee = text => unrelatedFee instanceof RegExp ? unrelatedFee.test(text) : text.includes(unrelatedFee);
        const retainsRates = text => text.includes(adultFee) && (!childFee || text.includes(childFee));
        const data = offer(meal);
        data.hotels = JSON.parse(JSON.stringify(api.normalizeOffer(data).hotels));
        assert.equal(data.hotels[0].meal, meal);
        const legacy = await api.renderOfferHtml(data);
        const print = api.renderGt63PrintOfferHtml(data, { selectedHotelId: 'desert' });
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', request => request.abort());
        await page.setContent(print, { waitUntil: 'domcontentloaded' });
        const cards = await page.$$eval('[data-service-state="pending"] article', nodes => nodes.map(card => ({
          label: card.querySelector('p').textContent,
          rate: card.querySelector('strong').textContent,
          text: card.textContent
        })));
        const pending = cards.filter(card => card.label === 'Изхранване').map(card => card.rate);
        const included = await page.$$eval('[data-service-state="included"] article strong', cards => cards.map(card => card.textContent));
        const pdf = Buffer.from(await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true }));
        const extracted = execFileSync('pdftotext', ['-', '-'], { input: pdf, encoding: 'utf8' }).replace(/\s+/g, ' ');
        const dir = process.env.AYA_MEAL_EVIDENCE_DIR;
        if (dir) {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, name + '.pdf'), pdf);
          fs.writeFileSync(path.join(dir, name + '.txt'), extracted);
        }
        if (unrelatedFee) assert(pending.every(card => !hasUnrelatedFee(card)), name + ' unrelated fee in meal card');
        const summary = vm.compactMealLabel(data.hotels[0].meal);
        assert(retainsRates(summary), name + ' meal summary');
        assert(retainsRates(legacy), name + ' legacy HTML');
        assert(retainsRates(extracted), name + ' PDF must retain all rates');
        const paidCard = pending.find(retainsRates);
        assert(paidCard, name + ' pending card must retain all rates');
        assert(!included.some(card => card.includes(adultFee) || (childFee && card.includes(childFee))), name);
        assert(extracted.includes(paidCard + ' За потвърждение преди резервация'), name);
        if (meal.includes('dinner included')) {
          assert(included.includes('dinner included'), name);
          assert(extracted.includes('dinner included Изрично посочено като включено'), name);
        }
        const adapt = require('../gt63-core/legacy-offer-print-input').buildLegacyOfferPrintInput;
        const registry = require('../gt63-core/renderers/multi-hotel').renderMultiHotelProposal(adapt(data), { selectedHotelId: 'desert' });
        assert(retainsRates(registry), name + ' registry HTML');
        if (unconfirmedRate) {
          for (const surface of [summary, legacy, registry, extracted]) {
            assert(surface.includes('Тарифа за потвърждение – ' + unconfirmedRate), name);
          }
          assert(pending.every(card => !card.includes(unconfirmedRate)), name);
        }
        if (unrelatedFee) {
          for (const surface of [summary, legacy, registry]) assert(!hasUnrelatedFee(surface), name);
          if (!expectedServices.length) assert(!hasUnrelatedFee(extracted), name);
        }
        for (const [label, rate] of expectedServices) {
          const card = cards.find(card => card.label === label && card.rate === rate);
          assert(card, name + ' service label and rate must share one card');
          assert(extracted.replace(/\s/g, '').toLowerCase().includes((label + rate).replace(/\s/g, '').toLowerCase()), name + ' associated PDF entry');
          console.log('Service evidence', JSON.stringify({name, ...card}));
        }
        assert.equal(vm.mealServiceConditions(meal).breakfast, 'paid');
        await page.close();
      });
    }
  } finally {
    await browser.close();
  }
});
