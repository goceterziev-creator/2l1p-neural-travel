'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('../gt63-core/presentation-view-model');
const legacy=require('../gt63-core/legacy-offer-print-input');
test('unknown and malformed baggage cannot stringify objects or invent allowance',()=>{
 for(const raw of [null,{},[],{checked:{weightKg:23}},'[object Object]','UNKNOWN','BusinessPrime',{confirmed:true,checked:{confirmed:false,weightKg:23}},{confirmed:true,checked:{weightKg:-1,pieces:'1'}}])assert.equal(vm.baggageLabel(raw),'Багажът подлежи на потвърждение');
});
test('explicitly confirmed structured baggage renders only supported supplied facts without mutation',()=>{
 const raw={confirmed:true,checked:{pieces:1,weightKg:23},cabin:{weightKg:8},personalItem:{pieces:1}},before=JSON.stringify(raw);
 const label=vm.baggageLabel(raw);assert.equal(label,'Регистриран багаж: 1 бр., 23 кг; Ръчен багаж: 8 кг; Личен багаж: 1 бр.');
 assert.equal(vm.baggageLabel('Checked baggage: 23 kg'),'Checked baggage: 23 kg');
 const input=legacy.buildLegacyOfferPrintInput({flights:[{baggage:raw}]});assert.equal(input.flight.baggage,label);assert.equal(JSON.stringify(raw),before);
});
test('hotel-scoped conditions follow selected ID; global material notices remain',()=>{
 const input={hotelOptions:[{id:'a',meal:'Breakfast'},{id:'b',meal:''}]};const before=JSON.stringify(input);
 vm.setTrustedNotices(input,[{message:'Transfer pending',severity:'INFO'},{message:'Meal pending',parameters:{hotelId:'b'}}]);
 assert.deepEqual(vm.presentationNotices(input).map(n=>n.text),['Transfer pending']);
 assert.deepEqual(vm.presentationNotices(input,{selectedHotelId:'b'}).map(n=>n.text),['Transfer pending','Meal pending']);
 assert.equal(JSON.stringify(input),before);
});

test('unconfirmed baggage stays out of included package and in pending print conditions',()=>{
 const input=legacy.buildLegacyOfferPrintInput({destination:'Abu Dhabi',flights:[{route:'SOF-AUH',baggage:{checked:{weightKg:23}}}],hotels:[{id:'a',name:'QA Hotel',meal:'Breakfast',price:100,occupancy:{adults:2,children:0,rooms:1,confirmed:true}}]});
 const print=require('../gt63-core/renderers/print-presentation').renderPrintProposal(input);
 const pending=print.match(/data-service-state="pending"[\s\S]*?<\/div><\/div>/)?.[0] || '';
 assert(pending.includes('Багажът подлежи на потвърждение'));
 const html=require('../gt63-core/renderers/multi-hotel').renderMultiHotelProposal(input);assert(!html.includes('Багаж: Багажът подлежи на потвърждение'));assert(html.includes('Багажът подлежи на потвърждение'));
});
