"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const hotel = require("../server/smart-import-hotel-review");
const occupancy = require("../public/hotel-occupancy");
const view = require("../gt63-core/presentation-view-model");
const { checkoutRecord, bindOfferPrices } = require("../server/smart-import-price-binding");

const dates = ["2026-12-01","2026-12-11"];
const rin = { name:"RIN Airport Hotel", address:"Street 15", room:"Standard Twin", ratePlan:"Bed Only",
  pageKind:"checkout", priceRole:"stay_total", priceLabel:"Total Reservation", priceText:"1444,00 €",
  meal:"Breakfast Excluded", mealSourceText:"Breakfast Excluded", nights:10, stayDates:dates,
  occupancy:{adults:3,children:null,rooms:2} };
const valid = { adults:3, rooms:2, children:0, confirmed:true };
const insufficient = { ...valid, adults:2, rooms:1 };

test("structured coverage tests selected and published alternatives independently", () => {
  assert.equal(occupancy.coverage("3 adults",valid),"");
  assert.match(occupancy.coverage("3 възрастни",insufficient),/2 от 3/);
  assert.match(occupancy.coverage("3 adults and 1 child",valid),/0 от 1/);
  assert.equal(occupancy.coverage("3 adults and 1 child",{...valid,children:null}),"");
  assert.equal(occupancy.normalize({ ...valid, children:null }).confirmed,false);
  const offer={guests:"3 adults",hotels:[
    {id:"caro",occupancy:insufficient},{id:"rin",selected:true,occupancy:valid}
  ]};
  assert.equal(occupancy.warning(offer),"");
  assert.deepEqual(occupancy.insufficient(offer).map(item=>item.hotelId),["caro"]);
  assert.equal(occupancy.insufficient({...offer,hotels:[...offer.hotels,{id:"third",occupancy:insufficient}]}).length,2);
  const property={...rin,pageKind:"property",occupancy:valid,name:"Caro Hotel"};
  const checkout={...rin,occupancy:insufficient,name:"Caro Hotel"};
  assert.equal(hotel.groupSmartHotelScreenshots([
    hotel.smartHotelRecord(property,"SRC-7"),hotel.smartHotelRecord(checkout,"SRC-6")
  ]).hotels[0].occupancy.adults,2);
});

test("reservation total is bound once, distinct from tax, fees and other observations", () => {
  const sourceId="SRC-5", agencyId="AGY-QA", intakeId="SMART-1795568264465-8bba9f";
  const record = hotel.smartHotelRecord(rin,sourceId);
  assert.equal(record.price,1444);
  assert.equal(record.currency,"EUR");
  assert.deepEqual(record.priceEvidence,{sourceId,label:"Total Reservation",text:"1444,00 €",currency:"EUR",role:"stay_total"});
  for (const priceLabel of ["Reservation Subtotal","Room Total","Per night","Per person","Tax","Deposit","Cancellation fee","Discount","Genius credit","Subtotal / Total Reservation"]) {
    assert.equal(hotel.smartHotelRecord({...rin,priceLabel},sourceId).price,0,priceLabel);
  }
  for (const change of [{priceRole:"per_person"},{priceRole:"tax"},{priceRole:"unknown"},{pageKind:"property"},{priceText:"1444,00"},
    {priceText:"722 € / 1444 €"},{priceText:"1444 722 €"}]) assert.equal(hotel.smartHotelRecord({...rin,...change},sourceId).price,0,JSON.stringify(change));
  const binding=checkoutRecord({intakeId,agencyId,hotel:record,source:{sourceId,sourceType:"hotel"},parsed:record});
  assert.equal(binding.eurPrice,1444);
  const applied={...record,stayDates:{checkIn:dates[0],checkOut:dates[1]},
    importedPrice:{kind:"checkout",version:2,referenceId:binding.referenceId,intakeId,sourceId},
    sourcePrice:1444,sourceCurrency:"EUR",exchangeRate:1};
  const options={agencyId,intakes:{[intakeId]:{agencyId,records:[binding]}},invalid:(i,code)=>new Error(code)};
  assert.equal(bindOfferPrices({...options,body:{hotels:[applied]}}).hotels[0].price,1444);
  assert.throws(()=>bindOfferPrices({...options,body:{hotels:[{...applied,stayDates:[dates[0],"2026-12-12"]}]}}),/CHECKOUT_HOTEL_RATE_MISMATCH/);
  assert.throws(()=>bindOfferPrices({...options,previous:{hotels:[applied]},body:{hotels:[{...applied,importedPrice:undefined}]}}),/CHECKOUT_OPERATOR_CORRECTION_REQUIRED/);
  assert.equal(bindOfferPrices({...options,previous:{hotels:[applied]},body:{hotels:[{...applied,importedPrice:{kind:"operator"}}]}}).hotels[0].price,1444);
});

test("Bucharest Debug JSON replay retains price and party boundaries across sources", () => {
  const make = (sourceId, fields) => hotel.smartHotelRecord({ ...rin, ...fields }, sourceId);
  const cozy = make("SRC-2", { name:"Cozy SoRaDa 2 apartment", priceText:"€ 660.66", priceLabel:"Общо" });
  const cozyProperty = make("SRC-3", { name:cozy.name, priceText:"€ 661", pageKind:"property" });
  const grand = make("SRC-4", { name:"Grand Hotel Bucharest", pageKind:"property", priceText:"" });
  const caro = make("SRC-6", { name:"Caro Hotel", priceText:"€ 1 941.90", priceLabel:"Общо",
    occupancy:{adults:2,children:null,rooms:1} });
  const result = hotel.groupSmartHotelScreenshots([cozy,cozyProperty,grand,make("SRC-5",{}),caro]);
  assert.equal(result.hotels.find(item=>item.sourceId==="SRC-2").price,660.66);
  assert.equal(result.hotels.find(item=>item.sourceId==="SRC-5").price,1444);
  assert.equal(result.propertyReview.find(item=>item.sourceId==="SRC-4").candidateSourceIds.length,0);
  assert.deepEqual(occupancy.insufficient({guests:"3 adults",hotels:result.hotels}).map(item=>item.hotelId),["Caro Hotel"]);
  const flights = require("../server/smart-import-flight-price");
  const flight = {route:"SOF → OTP / OTP → SOF", outboundSegments:[{from:"SOF",to:"OTP"}],
    inboundSegments:[{from:"OTP",to:"CTA"},{from:"CTA",to:"SOF"}]};
  const observations = flights.normalizePriceObservations([{ sourceId:"SRC-1", label:"Стандартен билет",
    text:"266,00 €",amount:266,currency:"EUR",priceUnit:"per-person",componentRole:"fare-total",routeScope:"round-trip" }]);
  assert.equal(flights.reviewFlightPrice(flight,observations,["SRC-1"],3).total,undefined);
});

test("hotel stay dates preserve years and classify incomplete or conflicting representations", () => {
  const canonical={status:"complete",dates};
  for(const value of [dates,"1.12.2026 – 11.12.2026","1–11.12.2026",
    {checkin:"вторник, 1 дек. 2026",checkout:"петък, 11 дек. 2026"}]) assert.deepEqual(hotel.hotelStay(value),canonical);
  for(const value of [[null,dates[1]],[dates[0],null],["1 дек.","11 дек."]]) assert.equal(hotel.hotelStay(value).status,"partial");
  assert.equal(hotel.hotelStay(["31.02.2026",dates[1]]).status,"malformed");
  assert.equal(hotel.hotelStay({checkin:dates[0],checkIn:"2026-12-02",checkout:dates[1]}).status,"conflicting");
  assert.equal(hotel.hotelStay(["2026-12-31","2027-01-03"]).status,"complete");
  assert.equal(hotel.hotelStay(undefined).status,"unknown");
  const checkout=hotel.smartHotelRecord(rin,"SRC-5");
  const other={...checkout,sourceId:"SRC-7",stayDates:["2026-12-02",dates[1]]};
  assert.equal(hotel.groupSmartHotelScreenshots([checkout,other]).hotels.length,2);
  const property=hotel.smartHotelRecord({...rin,pageKind:"property",stayDates:[dates[0],"2026-12-12"]},"SRC-4");
  assert.equal(hotel.groupSmartHotelScreenshots([checkout,property]).propertyReview[0].conflict,true);
});

test("meal exclusion and typed baggage remain distinct in client representations", () => {
  const meal=hotel.importedMealEvidence(rin,rin);
  assert.equal(meal.mealSourceText,"Breakfast Excluded");
  assert.equal(view.mealServiceConditions(meal.meal).breakfast,"excluded");
  assert.equal(view.compactMealLabel("Bed Only"),"Без включено хранене");
  assert.equal(view.mealServiceConditions("Breakfast included").breakfast,"included");
  const whatsapp = view.selectedOptionPayload(meal,0,"EUR",{client:{travelDates:"01–11.12.2026"}},1444).whatsappUrl;
  assert.match(new URL(whatsapp).searchParams.get("text"),/Закуската не е включена/);
  for(const value of ["1",1,""]) assert.match(view.baggageLabel(value),/потвърждение/);
  for(const value of ["1 personal item","1 cabin bag","1 checked bag"]) assert.equal(view.baggageLabel(value),value);
  assert.match(view.baggageLabel({confirmed:true,checked:{pieces:0},cabin:{pieces:1},personalItem:{pieces:1}}),/Регистриран багаж: 0 бр.; Ръчен багаж: 1 бр.; Личен багаж: 1 бр./);
});

test("flight metadata distinguishes direct, fallback, failed and unknown paths with mocks", async () => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"aya-stabilization-authority-"));
  const variables=["DATA_DIR","DB_FILE","OCR_PATTERN_CONFIG_FILE","AIRPORT_CONFIG_FILE","AI_FLIGHT_PROVIDER","OPENAI_API_KEY"];
  const previous=Object.fromEntries(variables.map(key=>[key,process.env[key]]));
  const set = (key,value) => value === undefined ? delete process.env[key] : process.env[key]=value;
  try {
    for(const key of variables.slice(0,4)) set(key,key==="DATA_DIR"?temp:path.join(temp,key+".json"));
    const filename=path.resolve(__dirname,"../server.js");
    const harness=new Module(filename,module);
    harness.filename=filename;
    harness.paths=Module._nodeModulePaths(path.dirname(filename));
    harness._compile(fs.readFileSync(filename,"utf8")+`\nmodule.exports.authorityTest={
      extractFlightWithAiVision,universalHotelSourceAuthority,
      stub(gemini,openai){ extractFlightWithGeminiVision=gemini; extractFlightWithOpenAiVision=openai; }
    };`,filename);
    const api=harness.exports.authorityTest;
    const result = name => ({provider:name,flight:{sourceAuthority:{flightPrimary:name,extractionPath:"direct"},notes:"OpenAI Vision result."}});
    let order=[];
    const gemini=async()=>{order.push("gemini");return result("gemini-vision");};
    const openai=async()=>{order.push("openai");return result("openai-vision");};
    api.stub(gemini,openai);
    for (const provider of ["gemini","openai"]) {
      set("AI_FLIGHT_PROVIDER",provider);
      const processed=await api.extractFlightWithAiVision([]);
      assert.equal(processed.flight.sourceAuthority.extractionPath,"direct");
      assert.equal(processed.flight.sourceAuthority.flightPrimary,provider+"-vision");
    }
    assert.deepEqual(order,["gemini","openai"]);
    order=[];
    set("AI_FLIGHT_PROVIDER","auto");
    set("OPENAI_API_KEY","local-stub");
    api.stub(async()=>{order.push("gemini");throw new Error("Provider unavailable");},openai);
    const fallback=await api.extractFlightWithAiVision([]);
    assert.deepEqual(order,["gemini","openai"]);
    assert.deepEqual(fallback.flight.sourceAuthority,{flightPrimary:"openai-vision",extractionPath:"fallback",fallbackFrom:"gemini-vision"});
    assert.match(fallback.flight.notes,/fallback/);
    api.stub(async()=>{throw new Error("Invalid image");},openai);
    await assert.rejects(api.extractFlightWithAiVision([]),/Invalid image/);
    assert.deepEqual(order,["gemini","openai"]);
    assert.equal(api.universalHotelSourceAuthority().hotelPrimary,"unknown");
    assert.equal(api.universalHotelSourceAuthority({extractor:"openai-vision",hasSerpApiKey:true}).imageEnrichment,null);
    const image=api.universalHotelSourceAuthority({extractor:"openai-vision",imageCount:3});
    assert.equal(image.hotelPrimary,"openai-vision");
    assert.equal(image.imageEnrichment,"serpapi");
    assert.equal(Object.hasOwn(image,"flightPrimary"),false);
  } finally {
    for(const [key,value] of Object.entries(previous)) set(key,value);
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
