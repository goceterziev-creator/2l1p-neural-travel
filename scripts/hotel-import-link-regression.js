'use strict';
const assert=require('node:assert/strict');const {readHotelImportLink,attachHotelImportLink}=require('../server/hotel-import-link');
const original=[{name:'Maamadi Boutique',room:'Suite',price:59.11,currency:'EUR'},{name:'Other Hotel',price:100,currency:'MKD'}];const before=JSON.stringify(original);
const link=readHotelImportLink('https://www.booking.com/hotel/mv/maamadi-boutique.en-gb.html?aid=123&token=secret#guest');assert.equal(link.nameHint,'maamadi boutique');assert.equal(link.url,'https://www.booking.com/hotel/mv/maamadi-boutique.en-gb.html');
const linked=attachHotelImportLink(original,link);assert.equal(linked.records[0].url,link.url);assert.equal(linked.records[1].url,undefined);assert.equal(linked.records[0].price,59.11);assert.equal(JSON.stringify(original),before);
console.log('PASS public property link strips query/fragment and matches one hotel without changing price');
assert.ok(readHotelImportLink('https://secure.booking.com/book.html?token=secret').warning);assert.ok(readHotelImportLink('javascript:alert(1)').warning);assert.equal(readHotelImportLink('').warning,'');
assert.equal(attachHotelImportLink(original,readHotelImportLink('not-a-link')).records.length,2);
console.log('PASS invalid/private checkout links cannot block screenshot import');
const hint=attachHotelImportLink([{name:'',room:'Suite',price:100}],link);assert.equal(hint.records[0].name,'maamadi boutique');assert.ok(hint.warnings.length);
assert.equal(attachHotelImportLink([{name:'Different Hotel',price:100}],link).records[0].name,'Different Hotel');
console.log('PASS URL name hint requires review and never overwrites an existing brand');

assert.equal(attachHotelImportLink([{name:"The Plaza Doha, LXR Hotels & Resorts",price:150988.6}],readHotelImportLink("https://www.booking.com/hotel/qa/the-plaza-doha-lxr-hotels-and-resorts.html")).records[0].url,"https://www.booking.com/hotel/qa/the-plaza-doha-lxr-hotels-and-resorts.html");
console.log("PASS brand ampersand matches public URL wording");

const {attachHotelImportLinks}=require('../server/hotel-import-link');
const manyHotels=Array.from({length:16},(_,i)=>({name:`Hotel ${i+1}`,room:'Suite',price:50+i,currency:'EUR'}));
const manyLinks=manyHotels.map((h,i)=>`https://www.booking.com/hotel/bg/hotel-${i+1}.html?token=discard`);
const manyBefore=JSON.stringify(manyHotels);const many=attachHotelImportLinks(manyHotels,[...manyLinks,manyLinks[0],'bad-link']);
assert.equal(many.links.length,16);assert.equal(many.records.length,16);
many.records.forEach((h,i)=>{assert.equal(h.url,`https://www.booking.com/hotel/bg/hotel-${i+1}.html`);assert.equal(h.price,50+i);});
assert.equal(JSON.stringify(manyHotels),manyBefore);
assert.ok(many.warnings.length);assert.equal(attachHotelImportLinks(manyHotels,[]).records.length,16);
const ambiguous=attachHotelImportLinks([{name:'',room:'Suite',price:20}],manyLinks.slice(0,2));assert.equal(ambiguous.records[0].name,'');
console.log('PASS 16 links are preserved and matched independently; invalid/duplicate/ambiguous links leave prices intact');
