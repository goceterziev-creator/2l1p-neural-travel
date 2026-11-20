'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {numericStars}=require('../gt63-core/presentation-view-model');
const {renderMultiHotelProposal}=require('../gt63-core/renderers/multi-hotel');
const {renderPrintProposal}=require('../gt63-core/renderers/print-presentation');
const cases=[
 ['rating 9.1',{rating:9.1},''],
 ['rating 9.4',{rating:9.4},''],
 ['stars 10',{stars:'10'},''],
 ['free-text category',{category:'Апартамент с 1 спалня'},''],
 ['numeric stars',{stars:5},'5'],
 ['string stars',{stars:'4'},'4'],
 ['missing',{},''],
 ['stars precede rating',{stars:'5',rating:9.1},'5'],
 ['invalid stars cannot fall back',{stars:'10',category:5,rating:9.1},''],
 ['name and description are not a category',{name:'5 Star Hotel',description:'Категория 5 звезди'},''],
 ['unverified generic category',{category:5},''],
 ['boolean',{stars:true},''],
 ['object',{stars:{value:5}},''],
 ['fraction',{stars:4.5},''],
 ['embedded digit',{stars:'Апартамент с 1 спалня'},'']
];
for(const n of [1,2,3,4,5])cases.push([`valid category ${n}`,{stars:n},String(n)]);
for(const [label,fields,expected]of cases){
 test(label,()=>{
  assert.equal(numericStars(fields),expected);
  const input={destination:{name:'Абу Даби'},client:{travelDates:'21.11.2026 - 29.11.2026'},pricing:{currency:'EUR'},hotelOptions:[{id:'qa',name:'SYNTHETIC CATEGORY QA',price:100,images:['https://example.test/a.jpg','https://example.test/b.jpg'],occupancy:{adults:2,children:0,rooms:1,confirmed:true},...fields}]};
  const original=JSON.stringify(input);
  const html=renderMultiHotelProposal(input,{selectedHotelId:'qa'});
  const print=renderPrintProposal(input,{selectedHotelId:'qa'});
  if(expected){
   assert(html.includes(`Категория: ${expected} звезди`));
   assert(print.includes(`aria-label="Категория: ${expected} звезди"`));
   const stars=print.match(/<div class="gt63-luxury-stars"[\s\S]*?<\/div>/)?.[0];
   assert.equal((stars.match(/class="gt63-luxury-icon"/g)||[]).length,Number(expected));
  }else{
   assert(html.includes('Категорията не е посочена'));
   assert(print.includes('Категорията не е посочена'));
   assert(!print.includes('class="gt63-luxury-stars"'));
   assert(!html.includes('Хотелът е с категория'));
  }
  assert.equal(JSON.stringify(input),original);
 });
}
