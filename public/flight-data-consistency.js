"use strict";
(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("../server/travel-normalizers/date-normalizer") : root.AYATravelDates);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AYAFlightDataConsistency = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (dates) {
  if (!dates?.normalizeTravelDate || !dates?.extractTime) throw new Error("Existing travel date normalizer is required");
  const copy = value => JSON.parse(JSON.stringify(value));
  const months = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември";
  function calendar(value) {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const day = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
  }
  function tokens(value) {
    const pattern = new RegExp(`\\b\\d{4}-\\d{1,2}-\\d{1,2}(?=T|\\b)|\\b\\d{1,2}[./]\\d{1,2}(?:[./]\\d{2,4})?\\b|(?<![:\\d])\\b\\d{1,2}\\s+(?:${months})\\.?(?:\\s+\\d{4}\\b(?!:))?|\\b(?:${months})\\.?\\s+\\d{1,2}\\b(?:,?\\s+\\d{4}\\b(?!:))?`, "gi");
    const parsedTokens = [...String(value || "").matchAll(pattern)].map(match => {
      let raw = match[0];
      const monthFirst = raw.match(new RegExp(`^(${months})\\.?\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?$`, "i"));
      if (monthFirst) raw = `${monthFirst[2]} ${monthFirst[1]} ${monthFirst[3] || ""}`;
      const parsed = dates.normalizeTravelDate(raw);
      const year = raw.match(/^(\d{4})-/)?.[1] || raw.match(/[./](\d{4})$/)?.[1] || raw.match(/\s(\d{4})$/)?.[1];
      if (!parsed.day || !parsed.month) return { raw: match[0], key: null };
      const key = `${year || "????"}-${String(parsed.month).padStart(2,"0")}-${String(parsed.day).padStart(2,"0")}`;
      return { raw: match[0], key: calendar(key.replace("????", "2000")) ? key : null };
    });
    const years = new Set(parsedTokens.map(item=>item.key?.slice(0,4)).filter(Boolean));
    if (/\b\d{5,}\b/.test(String(value)) || [...String(value || "").matchAll(/\b(?:19|20|21)\d{2}\b/g)].some(match=>!years.has(match[0])) || [...String(value || "").matchAll(/\b\d{1,2}[./]\d{1,2}[./](\d+)\b/g)].some(match=>match[1].length!==4)) parsedTokens.push({raw:String(value),key:null});
    return parsedTokens;
  }
  const identity = segment => [segment?.flightNumber || segment?.flightNo || "", segment?.from || segment?.departureAirport || "", segment?.to || segment?.arrivalAirport || ""].map(x => String(x).replace(/\s+/g, "").toUpperCase()).join("|");
  const dateKeys = value => tokens(value).map(x => x.key);
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  function inspect(flight = {}) {
    if (!flight || typeof flight !== "object" || Array.isArray(flight)) return {ok:false,conflicts:[{path:"flight",message:"Invalid flight object",values:flight}],legs:{outbound:[],inbound:[]}};
    const conflicts = [], legs = {}, fail = (path, message, values) => conflicts.push({ path, message, values });
    for (const [leg, summary] of [["outbound","departure"],["inbound","arrival"]]) {
      const direct = flight[leg + "Segments"], nested = flight[leg]?.segments;
      for (const [path,value] of [[leg+"Segments",direct],[leg+".segments",nested]]) if (value !== undefined && !Array.isArray(value)) fail(path,"Invalid segment array",value);
      const segments = Array.isArray(direct) && direct.length ? direct : Array.isArray(nested) ? nested : [];
      legs[leg] = segments;
      const expected = [];
      for (const [i,segment] of segments.entries()) {
        if (!segment || typeof segment !== "object") { fail(`${leg}[${i}]`,"Invalid segment",segment); continue; }
        for (const side of ["departure","arrival"]) {
          const primary = segment[side], keys = dateKeys(primary);
          if (!segment.from || !segment.to || keys.length !== 1 || !keys[0]) fail(`${leg}[${i}].${side}`,"Incomplete or ambiguous segment date",primary);
          expected.push(keys[0] || null);
          for (const alias of side === "departure" ? ["date","departureDate"] : ["arrivalDate"]) {
            if (segment[alias] && !same(dateKeys(segment[alias]), keys)) fail(`${leg}[${i}].${alias}`,"Contradictory segment date aliases",[primary,segment[alias]]);
          }
        }
      }
      if (segments.length && String(flight[summary] || "").trim()) {
        const actual = dateKeys(flight[summary]);
        const matches = actual.length === 1 ? actual[0] && actual[0] === expected[0] : actual.length === 2 ? actual[0] === expected[0] && actual[1] === expected[expected.length-1] : same(actual,expected);
        if (!matches) fail(summary,"Summary and segment dates differ",{summary:flight[summary],segments:segments.map(s=>({flightNumber:s?.flightNumber,from:s?.from,to:s?.to,departure:s?.departure,arrival:s?.arrival}))});
      }
      if (Array.isArray(direct) && direct.length && Array.isArray(nested) && nested.length && !same(direct.map(s=>[identity(s),dateKeys(s?.departure),dateKeys(s?.arrival)]),nested.map(s=>[identity(s),dateKeys(s?.departure),dateKeys(s?.arrival)]))) fail(leg,"Conflicting segment representations",[direct,nested]);
    }
    const canonical = [...legs.outbound,...legs.inbound];
    if (flight.segments !== undefined && !Array.isArray(flight.segments)) fail("segments","Invalid combined segment array",flight.segments);
    if (canonical.length && Array.isArray(flight.segments) && flight.segments.length && !same(canonical.map(s=>[identity(s),dateKeys(s?.departure),dateKeys(s?.arrival)]),flight.segments.map(s=>[identity(s),dateKeys(s?.departure),dateKeys(s?.arrival)]))) fail("segments","Combined segments differ from leg segments",flight.segments);
    if (!canonical.length && Array.isArray(flight.segments) && flight.segments.length) fail("segments","Assign segments to explicit outbound/inbound legs before editing dates",flight.segments);
    for (const [path,list] of [["segments",flight.segments],["outbound.segments",flight.outbound?.segments],["inbound.segments",flight.inbound?.segments]]) {
      if (!Array.isArray(list)) continue;
      for (const [index,segment] of list.entries()) {
        if (!segment || typeof segment !== "object") { fail(`${path}[${index}]`,"Invalid segment",segment); continue; }
        for (const side of ["departure","arrival"]) {
          const keys = dateKeys(segment[side]);
          if (keys.length !== 1 || !keys[0]) fail(`${path}[${index}].${side}`,"Incomplete or ambiguous segment date",segment[side]);
          for (const alias of side === "departure" ? ["date","departureDate"] : ["arrivalDate"]) if (segment[alias] && !same(dateKeys(segment[alias]),keys)) fail(`${path}[${index}].${alias}`,"Contradictory segment date aliases",[segment[side],segment[alias]]);
        }
      }
    }
    return { ok: !conflicts.length, conflicts, legs };
  }
  // Existing Gemini summary contract, shared by server imports and explicit review.
  function summary(segments = [], fallback = "") {
    const list = Array.isArray(segments) ? segments : [], first = list[0], last = list[list.length-1];
    if (!first || !last) return fallback;
    const via = list.slice(1).map(segment=>segment.from).filter((code,index,all)=>code && code !== first.from && code !== last.to && all.indexOf(code) === index);
    const route = `${first.from || "-"} -> ${last.to || "-"}`;
    const times = [first.departure,last.arrival].filter(Boolean).join(" - ");
    return [route,times,via.length ? `via ${via.join(" + ")}` : ""].filter(Boolean).join(", ");
  }
  function redated(value, key) {
    const iso = String(value).match(/^\d{4}-\d{2}-\d{2}([T\s].*)?$/), time = dates.extractTime(value);
    return key + (iso ? iso[1] || "" : time ? `T${time}` : "");
  }
  function alignCopies(previous, corrected) {
    if (!previous?.length) return copy(corrected);
    if (previous.length !== corrected.length || previous.some((item,index)=>identity(item)!==identity(corrected[index]))) throw new Error("Segment identity/order differs; source review required, nothing discarded");
    return previous.map((item,index)=>{
      if (["departure","arrival"].some(side=>dates.extractTime(item[side])!==dates.extractTime(corrected[index][side]))) throw new Error("Conflicting segment clocks: source review required");
      const next={...item,departure:redated(item.departure,corrected[index].departure.slice(0,10)),arrival:redated(item.arrival,corrected[index].arrival.slice(0,10))};
      for (const alias of ["date","departureDate","arrivalDate"]) if(Object.hasOwn(next,alias)) next[alias]=redated(next[alias],(alias==="arrivalDate"?next.arrival:next.departure).slice(0,10));
      return next;
    });
  }
  function resolve(flight, choice, reviewedDates) {
    if (!["summary","segments","manual"].includes(choice)) throw new Error("Explicit date source required");
    const current = inspect(flight), next = copy(flight), originals = [...current.legs.outbound,...current.legs.inbound];
    if (!originals.length) throw new Error("No unambiguous outbound/inbound segment mapping");
    const selected = {};
    for (const [leg,field] of [["outbound","departure"],["inbound","arrival"]]) {
      const list = current.legs[leg];
      const supplied = choice === "summary" ? tokens(flight[field]) : [];
      if (choice === "summary" && supplied.length !== list.length*2) throw new Error("Summary needs one explicit departure and arrival date per segment");
      selected[leg] = list.map((segment,index) => {
        if (!segment?.from || !segment?.to || !segment.departure || !segment.arrival) throw new Error("Incomplete segment: review the source before saving");
        const result = copy(segment);
        for (const [side,offset] of [["departure",0],["arrival",1]]) {
          const key = choice === "summary" ? supplied[index*2+offset]?.key : choice === "segments" ? tokens(segment[side])[0]?.key : reviewedDates?.[leg]?.[index]?.[side];
          if (!calendar(key)) throw new Error("An explicit valid YYYY-MM-DD is required for every segment");
          const sourceTokens = tokens(segment[side]);
          if (sourceTokens.length !== 1 || !sourceTokens[0].key) throw new Error("Ambiguous original segment; correct its source explicitly");
          result[side] = redated(segment[side],key);
          for (const alias of side === "departure" ? ["date","departureDate"] : ["arrivalDate"]) if (Object.hasOwn(result,alias)) result[alias] = redated(result[alias],key);
        }
        return result;
      });
      next[leg+"Segments"] = selected[leg];
      if (next[leg]?.segments) next[leg] = {...next[leg],segments:alignCopies(next[leg].segments,selected[leg])};
      next[field] = summary(selected[leg]);
    }
    if (Array.isArray(next.segments)) next.segments = alignCopies(next.segments,[...selected.outbound,...selected.inbound]);
    delete next.displayBg; // Derived display is rebuilt by the existing server normalizer.
    const verdict = inspect(next);
    if (!verdict.ok) throw new Error("Flight dates remain inconsistent");
    return next;
  }
  function offerConflicts(body = {}) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return [{path:"offer",message:"Invalid offer payload"}];
    const conflicts = [];
    if (body.flights !== undefined && !Array.isArray(body.flights)) conflicts.push({path:"flights",message:"Invalid flight array"});
    const flights = Array.isArray(body.flights) && body.flights.length ? body.flights : (body.flightSegments !== undefined || body.flightOutboundSegments !== undefined || body.flightInboundSegments !== undefined) ? [{departure:body.flightDeparture,arrival:body.flightArrival,segments:body.flightSegments,outboundSegments:body.flightOutboundSegments,inboundSegments:body.flightInboundSegments}] : [];
    for (const [index,flight] of flights.entries()) {
      for (const finding of inspect(flight).conflicts) conflicts.push({...finding,path:`flights[${index}].${finding.path}`});
      if (index === 0 && (body.flightDeparture || body.flightArrival)) {
        const combined = {...flight,departure:body.flightDeparture || flight.departure,arrival:body.flightArrival || flight.arrival};
        for (const finding of inspect(combined).conflicts) conflicts.push({...finding,path:`form.${finding.path}`});
      }
    }
    if (body.proposalInput?.flight && (typeof body.proposalInput.flight !== "object" || Array.isArray(body.proposalInput.flight))) conflicts.push({path:"proposalInput.flight",message:"Invalid proposal flight object"});
    if (body.proposalInput?.flight) for (const finding of inspect({...body.proposalInput.flight,departure:typeof body.proposalInput.flight.outbound === "string" ? body.proposalInput.flight.outbound : body.proposalInput.flight.departure,arrival:typeof body.proposalInput.flight.inbound === "string" ? body.proposalInput.flight.inbound : body.proposalInput.flight.arrival}).conflicts) conflicts.push({...finding,path:`proposalInput.flight.${finding.path}`});
    if (flights.length && body.proposalInput?.flight) {
      const models = flights.map(f=>inspect(f));
      const expected = [...models.flatMap(a=>a.legs.outbound),...models.flatMap(a=>a.legs.inbound)].map(s=>[identity(s),dateKeys(s?.departure),dateKeys(s?.arrival)]);
      const a=inspect(body.proposalInput.flight),actual=[...a.legs.outbound,...a.legs.inbound].map(s=>[identity(s),dateKeys(s?.departure),dateKeys(s?.arrival)]);
      if (expected.length && !same(expected,actual)) conflicts.push({path:"proposalInput.flight",message:"Saved proposal and offer segment dates differ",values:{offer:expected,proposal:actual}});
    }
    return conflicts;
  }
  return {inspect,resolve,tokens,calendar,offerConflicts,summary};
});
