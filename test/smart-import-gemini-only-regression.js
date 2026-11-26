"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const fixture = require("./fixtures/smart-import/istanbul-integrity.json");

test("Smart Import Gemini-only policy with isolated provider transports", async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aya-gemini-only-"));
  const secret = crypto.randomBytes(32).toString("hex");
  const primary = "gemini-3.5-flash-lite";
  const fallback = "gemini-3.8-flash";
  const legacyFlight = "booking-flights.jpg";
  const checkout = "hotel-checkout.jpg";
  const property = "hotel-property.jpg";
  const env = {
    DATA_DIR: temp, DB_FILE: path.join(temp, "db.json"), SOURCE_EVIDENCE_DIR: path.join(temp, "evidence"),
    REGRESSION_LIBRARY_DIR: path.join(temp, "library"),
    AIRPORT_CONFIG_FILE: path.join(temp, "airports.json"), OCR_PATTERN_CONFIG_FILE: path.join(temp, "ocr.json"),
    BETA_AUTH_BYPASS: "false", AUTH_SECRET: secret, OPENAI_API_KEY: "mock-openai", SERPAPI_KEY: "",
    GEMINI_API_KEY: "mock-gemini", GEMINI_VISION_MODEL: primary, GEMINI_VISION_FALLBACK_MODEL: fallback,
    AI_FLIGHT_PROVIDER: "auto", SMART_IMPORT_GEMINI_ONLY: "true"
  };
  const originalEnv = Object.fromEntries(Object.keys(env).map(key => [key,process.env[key]]));
  Object.assign(process.env, env);
  fs.writeFileSync(env.DB_FILE, JSON.stringify({
    offers: [], users: [{ id: "QA", name: "QA", agencyId: "AGY-AYA", role: "admin", email: "qa@example.test" }]
  }));
  const nativeFetch = global.fetch;
  let listener;
  let calls = [];
  let unexpected = [];
  let reply = null;
  let allowOpenAi = false;
  const response = (status, value) => new Response(JSON.stringify(value), { status });
  const gemini = (value) => response(200, { candidates: [{ content: { parts: [
    { thought: true, text: "Internal reasoning {not JSON}" }, { text: typeof value === "string" ? value : JSON.stringify(value) }
  ] } }] });
  const throttle = (model) => response(429,{error:{message:"Quota exceeded",details:[{
    "@type":"type.googleapis.com/google.rpc.QuotaFailure",
    violations:[{quotaId:"GenerateRequestsPerDayPerProjectPerModel",quotaDimensions:{model},quotaValue:"20"}]
  }]}});
  const defaultResult = ({operation,name}) => {
    if (operation === "classification") return {
      sourceType: name === legacyFlight ? "flight" : "hotel",
      flightProvider: name === legacyFlight ? "Booking Flights" : ""
    };
    if (operation === "hotel-price-recovery") return {price:190.98,priceText:"190,98 EUR",currency:"EUR"};
    return structuredClone(fixture[name]);
  };
  global.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url || input.href);
    const provider = url.hostname === "generativelanguage.googleapis.com" ? "gemini"
      : url.hostname === "api.openai.com" ? "openai" : null;
    if (!provider) {
      unexpected.push(url.hostname);
      throw new Error("Unexpected outbound host");
    }
    const body = JSON.parse(init.body);
    const parts = provider === "gemini" ? body.contents[0].parts : body.input[0].content;
    const prompt = parts[0].text;
    const encoded = provider === "gemini" ? parts[1].inlineData.data : parts[1].image_url.split(",")[1];
    const name = Buffer.from(encoded,"base64").toString();
    assert(Object.hasOwn(fixture,name));
    const operation = prompt.startsWith("You are extracting flight") ? "flight"
      : prompt.includes("Classify this travel screenshot") ? "classification"
      : prompt.startsWith("Read only the TOTAL STAY price") ? "hotel-price-recovery" : "hotel";
    const model = provider === "gemini" ? url.pathname.split("/").at(-1).split(":")[0] : body.model;
    const call = {provider,operation,model,name,config:body.generationConfig};
    calls.push(call);
    if (provider === "openai" && !allowOpenAi) throw new Error("OpenAI attempted in Gemini-only mode");
    if (provider === "gemini" && !allowOpenAi) {
      assert.equal(call.config.thinkingConfig.thinkingLevel,"MEDIUM");
      assert.equal(call.config.mediaResolution,"MEDIA_RESOLUTION_HIGH");
      assert.equal(call.config.responseMimeType,"application/json");
      assert.equal(call.config.responseSchema.type,"object");
    }
    const customized = reply?.(call);
    if (customized instanceof Response) return customized;
    const value = customized ?? defaultResult(call);
    return provider === "gemini" ? gemini(value) : response(200,{output:[{content:[{type:"output_text",text:JSON.stringify(value)}]}]});
  };
  try {
    const filename = path.resolve(__dirname,"../server.js");
    const harness = new Module(filename,module);
    harness.filename = filename;
    harness.paths = Module._nodeModulePaths(path.dirname(filename));
    harness._compile(fs.readFileSync(filename,"utf8") + "\nwait = async () => {}; module.exports.app = app;",filename);
    listener = await new Promise((resolve,reject) => {
      const server = harness.exports.app.listen(0,"127.0.0.1",()=>resolve(server));
      server.once("error",reject);
    });
    const base = "http://127.0.0.1:" + listener.address().port;
    const data = Buffer.from(JSON.stringify({userId:"QA",exp:Date.now()+60000})).toString("base64url");
    const cookie = "aya_session=" + data + "." + crypto.createHmac("sha256",secret).update(data).digest("base64url");
    const upload = async (...names) => {
      calls = [];
      const form = new FormData();
      for (const name of names) form.append("image",new Blob([name],{type:"image/jpeg"}), name);
      const result = await nativeFetch(base+"/api/smart-import",{method:"POST",headers:{cookie},body:form});
      const body = await result.json();
      if (!allowOpenAi) assert.equal(calls.filter(call=>call.provider==="openai").length,0);
      return {status:result.status,body};
    };

    await t.test("classification, flights, hotels, source archive and commercial guards", async () => {
      const {status,body} = await upload(legacyFlight,checkout,property);
      assert.equal(status,200,JSON.stringify(body));
      assert.deepEqual(calls.map(c=>c.operation),["classification","classification","classification","flight","hotel","hotel"]);
      assert.equal(body.flightCandidates[0].flight.price,294);
      assert.equal(body.flightCandidates[0].flight.baggage,"2 лични вещи");
      assert.equal(body.offerHotelOptions.length,1);
      assert.equal(body.offerHotelOptions[0].checkoutBinding.eurPrice,190.98);
      assert.equal(body.offerHotelOptions[0].occupancy.confirmed,false);
      assert.equal(body.offerHotel.sourceAuthority.hotelPrimary,"gemini-vision");
      assert(body.debug.visionExecutions.every(item=>item.model===primary && item.provider==="gemini-vision"));
      const stored = await nativeFetch(base+"/api/smart-import/"+body.intakeId,{headers:{cookie}});
      assert.equal(stored.status,200);
      assert.deepEqual((await stored.json()).debug.visionExecutions,body.debug.visionExecutions);
    });

    await t.test("hotel price recovery uses the same source and verifies amount, role and currency",async () => {
      reply = ({operation}) => operation === "hotel" ? {...fixture[checkout],priceText:"",price:190.98,currency:"EUR"} : null;
      const {status,body}=await upload(checkout);
      assert.equal(status,200,JSON.stringify(body));
      assert.deepEqual(calls.map(c=>c.operation),["classification","hotel","hotel-price-recovery"]);
      assert.equal(body.offerHotelOptions[0].checkoutBinding.eurPrice,190.98);
      assert.deepEqual(body.debug.visionExecutions.at(-1).sourceIds,["SRC-1"]);
      reply = ({operation}) => operation === "hotel" ? {...fixture[checkout],priceText:"",price:190.98,currency:"EUR"}
        : operation === "hotel-price-recovery" ? {priceText:"195 EUR",price:195,currency:"EUR"} : null;
      assert.equal((await upload(checkout)).body.offerHotelOptions[0].checkoutBinding,undefined);
    });

    await t.test("provider failures and invalid JSON have a fixed retry budget",async () => {
      reply = ({model,operation}) => model===primary && operation==="classification"
        ? response(503,{error:{message:"Unavailable"}}) : null;
      const {status,body}=await upload(checkout);
      assert.equal(status,200,JSON.stringify(body));
      assert.deepEqual(calls.slice(0,3).map(c=>c.model),[primary,primary,fallback]);
      assert.equal(body.debug.visionExecutions[0].model,fallback);
      reply = () => "not json";
      const stopped=await upload(checkout);
      assert.equal(stopped.status,502);
      assert.match(stopped.body.details,/INVALID_JSON/);
      assert.deepEqual(calls.map(c=>c.model),[primary,fallback]);
    });

    await t.test("daily quota skips exhausted model across operations and stops when both are exhausted",async () => {
      reply = ({model}) => model===primary ? throttle(model) : null;
      const accepted=await upload(checkout,property);
      assert.equal(accepted.status,200,JSON.stringify(accepted.body));
      assert.deepEqual(calls.map(c=>c.model),[primary,fallback,fallback,fallback,fallback]);
      reply = ({model}) => throttle(model);
      const stopped=await upload(checkout,property);
      assert.equal(stopped.status,429);
      assert.match(stopped.body.details,/QUOTA_EXHAUSTED/);
      assert.deepEqual(calls.map(c=>c.model),[primary,fallback]);
      reply = () => response(429,{error:{message:"Too Many Requests"}});
      const unclear=await upload(checkout);
      assert.equal(unclear.status,429);
      assert.match(unclear.body.details,/QUOTA_UNKNOWN/);
      assert.deepEqual(calls.map(c=>c.model),[primary,primary,fallback]);
    });

    await t.test("missing fields stay unknown, including price without same-source scope",async () => {
      reply = ({operation}) => operation==="flight" ? { priceObservations:[{
        label:"Standard fare",text:"266 EUR",amount:266,currency:"EUR",priceUnit:"per-person",routeScope:"round-trip",componentRole:"fare-total"
      }] } : operation==="hotel" ? {...fixture[checkout],priceText:"",price:0,occupancy:{adults:2,rooms:1}} : null;
      const {status,body}=await upload(legacyFlight,checkout);
      assert.equal(status,200);
      assert.equal(calls.length,4);
      assert.equal(body.flightCandidates[0].flight.price,0);
      assert.equal(body.flightCandidates[0].flight.outboundSegments.length,0);
      assert.equal(body.flightCandidates[0].priceReview.warning,"FLIGHT_PRICE_SCOPE_UNKNOWN");
      assert.equal(body.offerHotelOptions[0].occupancy.children,null);
      assert.equal(body.offerHotelOptions[0].checkoutBinding,undefined);
      delete process.env.GEMINI_API_KEY;
      const stopped=await upload(checkout);
      assert.equal(stopped.status,503);
      assert.match(stopped.body.details,/GEMINI_API_KEY is unavailable/);
      assert.equal(calls.length,0);
      process.env.GEMINI_API_KEY=env.GEMINI_API_KEY;
    });

    await t.test("disabled policy retains OpenAI classification, hotel and flight fallback",async () => {
      process.env.SMART_IMPORT_GEMINI_ONLY="false";
      allowOpenAi=true;
      reply = ({provider}) => provider==="gemini" ? response(503,{error:{message:"Unavailable"}}) : null;
      const {status,body}=await upload(legacyFlight,checkout);
      assert.equal(status,200,JSON.stringify(body));
      assert.deepEqual(calls.filter(c=>c.provider==="openai").map(c=>c.operation),
        ["classification","classification","flight","hotel"],JSON.stringify(body.sources));
      assert.equal(body.offerHotel.sourceAuthority.hotelPrimary,"openai-vision");
      assert.equal(body.offerHotelOptions[0].checkoutBinding.eurPrice,190.98);
      assert.equal(body.offerFlight.sourceAuthority.extractionPath,"fallback");
      assert.equal(body.debug.visionExecutions,undefined);
    });
    assert.deepEqual(unexpected,[]);
    console.log("Gemini-only OpenAI attempts: 0; real provider calls: 0; disabled control OpenAI mocks: 4");
  } finally {
    if (listener) await new Promise(resolve=>listener.close(resolve));
    global.fetch=nativeFetch;
    for (const [key,value] of Object.entries(originalEnv)) {
      if (value===undefined) delete process.env[key];
      else process.env[key]=value;
    }
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
