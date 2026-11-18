'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {resolveSeasonalTheme,renderPrintProposal:renderProjectedProposal}=require('../gt63-core/renderers/print-presentation');
const theme=(name,dates)=>resolveSeasonalTheme({destination:{name},client:{travelDates:dates}});
const viewModel = require('../gt63-core/presentation-view-model');
// These fixtures exercise presentation after an authoritative classification.
function projectFixture(input) {
  const approved = (input.warnings || []).map(value => {
    const message = value.message || value;
    const severity = message.startsWith('[INFO]') ? 'INFO' : 'WARNING';
    const terms = message.replace(/^\[(?:INFO|WARNING)\] /, '');
    const meal = terms.match(/^(?:Smart Import: храненето за поне един хотел не е потвърдено\.|Не е потвърдено изхранването за 3 хотел\(а\)\. Проверете преди изпращане\.)(.*)$/);
    return { severity, message: meal ? `[${severity}] ${viewModel.unconfirmedMealNotice}${meal[1]}` : message };
  });
  viewModel.setTrustedNotices(input, [...(input.blockingIssues || []).map(value => ({severity:'BLOCKING',message:value.message || value})), ...approved]);
}
function renderPrintProposal(input, options) {
  projectFixture(input);
  return renderProjectedProposal(input, options);
}

test('explicit northern and southern calendars cover four visual themes',()=>{
 for(const[date,north,south]of [['10.01.2026 - 20.01.2026','winter','summer'],['10.04.2026 - 20.04.2026','spring','autumn'],['10.07.2026 - 20.07.2026','summer','winter'],['10.10.2026 - 20.10.2026','autumn','spring']]){assert.equal(theme('Рим',date).theme,north);assert.equal(theme('Sydney',date).theme,south);}
 assert.equal(theme('Tokyo','2026-06-10 - 2026-06-20').theme,'summer');
});
test('desert and tropical profiles are explicit visual choices, not hemisphere guesses or weather forecasts',()=>{
 assert.deepEqual(theme('АБУ-ДАБИ','21.11.2026 - 29.11.2026'),{theme:'autumn',region:'abu-dhabi-desert'});
 assert.equal(theme('Dubai','2026-07-01 - 2026-07-10').theme,'summer');assert.equal(theme('Maldives','2026-01-01 - 2026-01-10').theme,'summer');assert.equal(theme('Maldives','2026-06-01 - 2026-06-10').theme,'summer');
 for(const name of ['Bali','Thailand','Australia','Abu Dhabi / Sydney','NOTrome','Abu Dhabi QA'])assert.equal(theme(name,'21.11.2026 - 29.11.2026').theme,'neutral');
});
test('partial, ambiguous, impossible and reversed ranges fail neutral without any year inference',()=>{
 for(const dates of ['', '21.11 - 29.11.2026', '21.11.26 - 29.11.26', '2026-02-30 - 2026-03-01', '31.02.2026 - 02.03.2026', '11.21.2026 - 11.29.2026','2026-11-29 - 2026-11-21','2026-11-21 - 2026-11-29 extra','2026-11-21'])assert.equal(theme('Abu Dhabi',dates).theme,'neutral',dates);
 assert.equal(theme('Rome','28.02.2026 - 02.03.2026').theme,'neutral');assert.equal(theme('Rome','01.01.2026 - 31.12.2026').theme,'neutral');assert.equal(theme('Rome','20.12.2026 - 10.01.2027').theme,'winter');assert.equal(theme('Sydney','20.12.2026 - 10.01.2027').theme,'summer');
 assert.equal(resolveSeasonalTheme({destination:{name:'Rome',requested:'Sydney'},client:{travelDates:'2026-01-01 - 2026-01-10'}}).theme,'neutral');
});
test('the exact selected hotel supplies decoration; missing/single images and source records remain safe',()=>{
 const input={destination:{name:'Abu Dhabi'},client:{travelDates:'21.11.2026 - 29.11.2026',travelers:'2 възрастни и 2 деца'},pricing:{currency:'EUR'},hotelOptions:[{id:'a',name:'QA A',price:100,images:['https://example.test/a.jpg'],occupancy:{adults:2,children:2,rooms:1,confirmed:false}},{id:'b',name:'QA B',price:200,images:['https://example.test/b1.jpg','https://example.test/b2.jpg'],occupancy:{adults:2,children:2,rooms:1,confirmed:true}}],warnings:['[WARNING] Изхранване за потвърждение.']};
 const before=JSON.stringify(input);
 const a=renderPrintProposal(input,{selectedHotelId:'a'}),b=renderPrintProposal(input,{selectedHotelId:'b'});
 assert(a.includes('data-seasonal-theme="autumn"'));assert(a.includes('gt63-seasonal-hotel-background" aria-hidden="true"><img src="https://example.test/a.jpg"'));assert(!a.includes('https://example.test/b'));
 assert(b.includes('gt63-seasonal-hotel-background" aria-hidden="true"><img src="https://example.test/b2.jpg"'));assert(!b.includes('https://example.test/a.jpg'));
 assert(a.includes('непотвърдена заетост'));assert(b.includes('— потвърдена заетост'));assert(a.includes('Важно: Изхранване за потвърждение.'));
 const none=renderPrintProposal({...input,hotelOptions:[{id:'none',name:'QA EMPTY',price:100}]});assert(!none.includes('gt63-seasonal-hotel-background'));assert(none.includes('Снимка за потвърждение'));
 assert.equal(JSON.stringify(input),before);
});

test('luxury composition uses supplied stars, icons, price and supported benefits on the selected page',()=>{
 const input={destination:{name:'Abu Dhabi'},client:{travelDates:'21.11.2026 - 29.11.2026',travelers:'2 възрастни и 2 деца'},pricing:{currency:'EUR'},hotelOptions:[{id:'a',name:'QA FIVE STAR',stars:'5',room:'QA ROOM',price:100,images:['https://example.test/a1.jpg','https://example.test/a2.jpg','https://example.test/a3.jpg'],occupancy:{adults:2,children:2,rooms:1,confirmed:false}},{id:'b',name:'QA OTHER',price:200}],warnings:['[WARNING] Непотвърдено изхранване.']};const before=JSON.stringify(input),html=renderPrintProposal(input,{selectedHotelId:'a'});
 assert(html.includes('gt63-luxury-hotel'));assert(html.includes('gt63-luxury-wave'));assert(html.includes('gt63-luxury-brand'));assert(html.includes('is-price'));
 const stars=html.match(/<div class="gt63-luxury-stars"[\s\S]*?<\/div>/)?.[0];assert(stars);assert.equal((stars.match(/class="gt63-luxury-icon"/g)||[]).length,5);
 const benefits=html.match(/<ul class="gt63-luxury-benefits">[\s\S]*?<\/ul>/)?.[0];assert(benefits);assert(benefits.includes('най-достъпният'));assert(benefits.includes('QA ROOM'));assert(!benefits.includes('потвърждение'));
 assert(html.includes('непотвърдена заетост'));assert(html.includes('Важно: Непотвърдено изхранване.'));assert.equal(JSON.stringify(input),before);
 for(const stars of ['', '4.5']){const changed=JSON.parse(JSON.stringify(input));changed.hotelOptions[0].stars=stars;assert(!renderPrintProposal(changed,{selectedHotelId:'a'}).includes('class="gt63-luxury-stars"'),'do not invent/round a five-star row');}
});

test('price-includes presentation separates quote data, explicit inclusion and pending conditions',()=>{
 const input={destination:{name:'Abu Dhabi'},client:{travelDates:'21.11.2026 - 29.11.2026',travelers:'2 възрастни и 2 деца'},pricing:{currency:'EUR'},flight:{airline:'QA AIR',route:'SOF-AUH',baggage:'Not specified'},hotelOptions:[{id:'a',name:'QA HOTEL',room:'QA ROOM',price:100,images:['https://example.test/a.jpg'],occupancy:{adults:2,children:2,rooms:1,confirmed:false}}],transfer:{route:'AUH → QA HOTEL',included:false},warnings:['[WARNING] Не е потвърдено изхранването.']};
 const before=JSON.stringify(input),html=renderPrintProposal(input,{selectedHotelId:'a'});
 assert(html.includes('ЦЕНАТА ВКЛЮЧВА'));assert(!html.includes('Какво съдържа офертата'));assert(!html.includes('data-service-state="included"'));assert(html.includes('data-service-state="quoted"'));assert(html.includes('data-service-state="pending"'));
 const pending=html.slice(html.indexOf('data-service-state="pending"'),html.indexOf('gt63-luxury-service-photo'));for(const text of ['Хотелска заетост','непотвърдена заетост','Изхранване','Багаж','Трансфер'])assert(pending.includes(text),text);
 const explicit=structuredClone(input);explicit.transfer.included=true;explicit.hotelOptions[0].occupancy.confirmed=true;const yes=renderPrintProposal(explicit,{selectedHotelId:'a'}),start=yes.indexOf('data-service-state="included"'),end=yes.indexOf('data-service-state="pending"',start),included=yes.slice(start,end);
 assert(included.includes('Трансфер'));assert(included.includes('AUH → QA HOTEL'));assert(!included.includes('Хранене за потвърждение'));assert(!included.includes('Багажът подлежи на потвърждение'));assert.equal(JSON.stringify(input),before);
});

test('final price, all warning severities and manual next action retain offer-versus-booking distinction',()=>{
 const input={destination:{name:'Rome'},client:{travelDates:'21.11.2026 - 29.11.2026',travelers:'2 възрастни'},pricing:{currency:'EUR'},hotelOptions:[{id:'a',name:'QA HOTEL',price:100}],warnings:['[INFO] Проверете трансфера.','[WARNING] Изхранване за потвърждение.'],blockingIssues:['Непотвърдена заетост.'],contact:{phone:'QA-PHONE',email:'qa@example.test'}};const before=JSON.stringify(input),html=renderPrintProposal(input,{selectedHotelId:'a'});
 for(const text of ['Инвестиция във Вашето пътуване','Офертата не представлява потвърдена резервация.','Информация: Проверете трансфера.','Важно: Изхранване за потвърждение.','Непотвърдена заетост.','Свържете се с консултанта','QA-PHONE','qa@example.test'])assert(html.includes(text),text);
 for(const level of ['info','warning','blocking'])assert(html.includes(`data-notice-level="${level}"`));
 const closing=html.slice(html.indexOf('class="gt63-print-closing gt63-luxury-closing"'));assert(!closing.includes('<button'));assert(!closing.includes('onclick'));assert(closing.includes('Изборът на хотел не е потвърдена резервация.'));assert.equal(JSON.stringify(input),before);
});


test('PDF groups all price displays and keeps unresolved collection warnings without internal provenance',()=>{
 for(const price of [9145.95,9872.34,10521.63]) {
 const input={client:{travelDates:'21.11.2026 - 29.11.2026'},pricing:{currency:'EUR'},hotelOptions:[{id:'a',name:'QA HOTEL',price}],warnings:['[WARNING] Smart Import: храненето за поне един хотел не е потвърдено.','[WARNING] Не е потвърдено изхранването за 3 хотел(а). Проверете преди изпращане.','[INFO] Проверете трансфера.']};
 const before=JSON.stringify(input),html=renderPrintProposal(input,{selectedHotelId:'a'});
 const expected=price.toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,' ');
 assert(html.includes(expected+' EUR'),expected);assert(!html.includes('Smart Import:'));assert(!html.includes('3 хотел(а)'));assert(html.includes('не е потвърдено за всички хотелски варианти'));assert(html.includes('Проверете трансфера.'));assert.equal((html.match(/data-notice-level=/g)||[]).length,2);assert.equal(JSON.stringify(input),before);
 }
});


test('PDF merges only the proven meal duplicate, preserving distinct scope, UNKNOWN and severity',()=>{
 const warnings=['[WARNING] Smart Import: храненето за поне един хотел не е потвърдено.','[WARNING] Не е потвърдено изхранването за 3 хотел(а). Проверете преди изпращане.','[WARNING] Le Meridien: изхранване UNKNOWN.','[WARNING] Smart Import: храненето за поне един хотел не е потвърдено. Допълнително условие.','[INFO] Не е потвърдено изхранването за 3 хотел(а). Проверете преди изпращане.'];
 const input={hotelOptions:[{id:'a',name:'Le Meridien',price:9145.95}],warnings,blockingIssues:['Изхранване UNKNOWN — нужна проверка.']},before=JSON.stringify(input);
 projectFixture(input);assert.equal(viewModel.presentationNotices(input).length,6);
 const html=renderPrintProposal(input,{selectedHotelId:'a'});assert.equal((html.match(/data-notice-level=/g)||[]).length,5);assert(html.includes('Le Meridien: изхранване UNKNOWN.'));assert(html.includes('Допълнително условие.'));assert(html.includes('Изхранване UNKNOWN — нужна проверка.'));for(const level of ['info','warning','blocking'])assert(html.includes(`data-notice-level="${level}"`));assert.equal(JSON.stringify(input),before);
});


test('PDF-only normalization retains object INFO and blocking severity without changing shared HTML notices',()=>{
 const input={hotelOptions:[{id:'a',name:'QA HOTEL',price:100}],warnings:[{message:'[INFO] Проверете трансфера.'}],blockingIssues:[{message:'[INFO] Нужна е проверка.'}]};
 projectFixture(input);const vm=viewModel,before=JSON.stringify(input),shared=JSON.stringify(vm.presentationNotices(input));
 const html=renderPrintProposal(input,{selectedHotelId:'a'});assert(html.includes('data-notice-level="info"'));assert(html.includes('data-notice-level="blocking"'));assert(html.includes('Информация: Проверете трансфера.'));assert.equal(JSON.stringify(vm.presentationNotices(input)),shared);assert.equal(JSON.stringify(input),before);
});
