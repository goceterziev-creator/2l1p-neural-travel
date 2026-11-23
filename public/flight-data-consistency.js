"use strict";
(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("../server/travel-normalizers/date-normalizer") : root.AYATravelDates);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AYAFlightDataConsistency = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (dates) {
  if (!dates?.normalizeTravelDate || !dates?.extractTime) throw new Error("Existing travel date normalizer is required");
  const copy = value => JSON.parse(JSON.stringify(value));
  const months = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември|яну?|февр?|мар|апр|авг|септ?|окт|ноем?|дек";
  function calendar(value) {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const day = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
  }
  function tokens(value) {
    const pattern = new RegExp(`\\b\\d{4}-\\d{1,2}-\\d{1,2}(?=T|\\b)|\\b\\d{1,2}[./]\\d{1,2}(?:[./]\\d{2,4})?\\b|(?<![:\\d])\\b\\d{1,2}-(?:${months})(?![A-Za-zА-Яа-я])\\.?(?:\\s+\\d{4}\\b(?!:))?|(?<![:\\d])\\b\\d{1,2}\\s+(?:${months})\\.?(?:\\s+\\d{4}\\b(?!:))?|\\b(?:${months})\\.?\\s+\\d{1,2}\\b(?:,?\\s+\\d{4}\\b(?!:))?`, "gi");
    const parsedTokens = [...String(value || "").matchAll(pattern)].map(match => {
      let raw = match[0].replace(/^(\d{1,2})-(?=[A-Za-zА-Яа-я])/, "$1 ");
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
  // Join a separately extracted source date to a clock-only value; never infer a day.
  function clockOnly(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
    if (!match) return false;
    const hour = Number(match[1]);
    return Number(match[2]) < 60 && (match[3] ? hour >= 1 && hour <= 12 : hour < 24);
  }
  // A yearless numeric date is accepted only with a reviewed full calendar date.
  function partialDateTime(value) {
    const match = String(value || "").match(/^(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    return !!match && (calendar(`2000-${match[1]}-${match[2]}`) || calendar(`2000-${match[2]}-${match[1]}`)) && Number(match[3]) < 24 && Number(match[4]) < 60;
  }
  function segmentDateTime(segment, side) {
    const raw = String(segment[side] || "").trim();
    const aliases = (side === "departure" ? [segment.departureDate, segment.date] : [segment.arrivalDate])
      .map(value => String(value || "").trim()).filter(Boolean);
    const separateTime = String(segment[side + "Time"] || "").trim();
    if (dates.extractTime(raw) && clockOnly(separateTime) && dates.extractTime(raw) !== dates.extractTime(separateTime)) throw new Error("Conflicting source segment clocks");
    const dateValues = [raw, ...aliases].filter(value => tokens(value).length);
    const parsed = dateValues.map(value => tokens(value));
    if (parsed.some(items => items.length !== 1 || !items[0].key)) throw new Error("Ambiguous source segment date");
    const keys = parsed.map(items => items[0].key);
    if (new Set(keys.map(key => key.slice(5))).size > 1 || new Set(keys.map(key => key.slice(0,4)).filter(year => year !== "????")).size > 1) throw new Error("Conflicting source segment date aliases");
    const sourceDate = aliases.find(value => tokens(value)[0]?.key && !tokens(value)[0].key.startsWith("????"))
      || aliases.find(value => tokens(value).length === 1);
    if (raw && !clockOnly(raw)) {
      const originalDate = tokens(raw)[0];
      if (originalDate?.key?.startsWith("????") && sourceDate && !tokens(sourceDate)[0].key.startsWith("????")) return raw.replace(originalDate.raw, tokens(sourceDate)[0].raw);
      if (originalDate?.key && !dates.extractTime(raw) && clockOnly(separateTime)) return [raw, separateTime].join(" ");
      return raw; // Explicit historical/invalid values are not repaired.
    }
    const time = raw || String(segment[side + "Time"] || "").trim();
    if (time && !clockOnly(time)) return raw || time;
    if (!sourceDate) return raw || time;
    const sourceClock = dates.extractTime(sourceDate);
    if (sourceClock) {
      if (time && sourceClock !== dates.extractTime(time)) throw new Error("Conflicting source segment clocks");
      return sourceDate;
    }
    return [sourceDate, time].filter(Boolean).join(" ");
  }
  const identity = segment => [segment?.flightNumber || segment?.flightNo || "", segment?.from || segment?.departureAirport || "", segment?.to || segment?.arrivalAirport || ""].map(x => String(x).replace(/\s+/g, "").toUpperCase()).join("|");
  const dateKeys = value => tokens(value).map(x => x.key);
  // Recognize newly supported supplier labels for review, but keep them
  // blocked at the save boundary until the year is resolved.
  const segmentDateKeys = value => tokens(value).map(({ raw, key }) =>
    key?.startsWith("????") && /^\d{1,2}-[A-Za-zА-Яа-я]/.test(raw) ? null : key);
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
          const primary = segment[side], keys = segmentDateKeys(primary);
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
          const keys = segmentDateKeys(segment[side]);
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
          if ((sourceTokens.length !== 1 || !sourceTokens[0].key) && !(choice === "manual" && (clockOnly(segment[side]) || partialDateTime(segment[side])))) throw new Error("Ambiguous original segment; correct its source explicitly");
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
    if (next.dateResolution?.version === 2 && Array.isArray(next.dateResolution.evidence) && next.dateResolution.evidence.some(item=>selected[item.leg]?.[item.index]?.[item.side]?.slice(0,10) !== item.resolved)) {
      next.dateResolution = {...next.dateResolution, status:"INVALIDATED", reason:"MANUAL_DATE_CORRECTION",
        supersededEvidence:[...(next.dateResolution.supersededEvidence || []),...next.dateResolution.evidence], evidence:[]};
    }
    delete next.displayBg; // Derived display is rebuilt by the existing server normalizer.
    const verdict = inspect(next);
    if (!verdict.ok) throw new Error("Flight dates remain inconsistent");
    return next;
  }
  function needsYearResolution(flight) {
    const analysis = inspect(flight);
    return [...analysis.legs.outbound,...analysis.legs.inbound].some(segment=>["departure","arrival"].some(side=>{
      const raw = segment?.[side], parsed = tokens(raw);
      return partialDateTime(raw) || parsed.some(item=>item.key?.startsWith("????"));
    }));
  }
  // Resolve a detached candidate, never the screenshot evidence or editor state.
  // Context must be supplied explicitly; arbitrary URL text is not trusted context.
  function resolveYearContext(flight, context = {}) {
    try {
      const today = (context.now || new Date()).toISOString().slice(0,10);
      const periodRaw = String(context.verifiedTravelDates || "").trim();
      const period = tokens(periodRaw).map(item => item.key);
      if (periodRaw && (period.length !== 2 || !period.every(calendar) || period[0] > period[1])) throw Error("Unverified travel period");
      if (period.length && Number(period[1].slice(0,4)) - Number(period[0].slice(0,4)) > 1) throw Error("Ambiguous multi-year travel period");
      const analysis = inspect(flight), reviewed = {}, evidence = [];
      if (![...analysis.legs.outbound,...analysis.legs.inbound].length) throw Error("No explicit leg mapping");
      if (analysis.conflicts.some(item=>["Conflicting segment representations","Combined segments differ from leg segments","Invalid segment array","Invalid combined segment array"].includes(item.message))) throw Error("Conflicting segment copies");
      const canonical = [...analysis.legs.outbound,...analysis.legs.inbound];
      for (const [expected,list] of [[canonical,flight.segments],[analysis.legs.outbound,flight.outbound?.segments],[analysis.legs.inbound,flight.inbound?.segments]]) {
        if (Array.isArray(list) && list.length && (list.length !== expected.length || list.some((segment,index)=>identity(segment)!==identity(expected[index]) || ["departure","arrival"].some(side=>String(segment?.[side] || "").trim() !== String(expected[index]?.[side] || "").trim())))) throw Error("Conflicting raw segment copies");
      }
      const sourceYears = [...new Set([...analysis.legs.outbound,...analysis.legs.inbound].flatMap(segment=>["departure","arrival","date","departureDate","arrivalDate"].flatMap(key=>tokens(segment?.[key]).filter(item=>calendar(item.key)).map(item=>Number(item.key.slice(0,4))))))];
      if (!period.length && sourceYears.length > 1) throw Error("Rollover requires verified travel period");
      let previous = "", previousArrival = null;
      for (const leg of ["outbound","inbound"]) {
        reviewed[leg] = analysis.legs[leg].map((segment,index) => {
          const result = {};
          for (const side of ["departure","arrival"]) {
            const raw = String(segment?.[side] || "");
            const parsed = tokens(raw);
            const partial = raw.match(/^(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
            let explicit = parsed.length === 1 && calendar(parsed[0].key) ? parsed[0].key : "";
            let monthDays = [];
            if (explicit) monthDays = [explicit.slice(5)];
            else if (partial && Number(partial[3]) < 24 && Number(partial[4]) < 60) {
              monthDays = [...new Set([`${partial[1]}-${partial[2]}`,`${partial[2]}-${partial[1]}`])].filter(md => calendar(`2000-${md}`));
            } else if (parsed.length === 1 && parsed[0].key?.startsWith("????")) monthDays = [parsed[0].key.slice(5)];
            else throw Error("Ambiguous source date");
            const aliases = side === "departure" ? ["date","departureDate"] : ["arrivalDate"];
            const explicitAliases = aliases.filter(key=>segment[key]).map(key=>tokens(segment[key]));
            if (explicitAliases.some(items=>items.length !== 1 || !items[0].key)) throw Error("Ambiguous date alias");
            const aliasDates = explicitAliases.map(items=>items[0].key).filter(calendar);
            if (new Set([explicit,...aliasDates].filter(Boolean)).size > 1) throw Error("Conflicting explicit source years/dates");
            explicit = explicit || aliasDates[0] || "";
            const years = explicit ? [Number(explicit.slice(0,4))] : period.length ? [...new Set(period.map(day=>Number(day.slice(0,4))))] : sourceYears.length ? sourceYears : [Number(today.slice(0,4))];
            const candidates = years.flatMap(year=>monthDays.map(md=>`${year}-${md}`)).filter(day=>calendar(day) && (!explicit || day === explicit) && (period.length ? day >= period[0] && day <= period[1] : true) && (explicit ? day >= today : day > today));
            const compatible = candidates.filter(day=>!previous || day >= previous);
            if (compatible.length !== 1) throw Error("No unique future chronological year");
            const day = compatible[0];
            if (explicitAliases.some(items=>items[0].key.slice(5) !== day.slice(5))) throw Error("Conflicting date aliases");
            const clock = dates.extractTime(raw);
            if (side === "departure" && previousArrival?.airport === segment.from && clock && previousArrival.time > `${day}T${clock}`) throw Error("Connection departs before arrival at the same airport");
            if (side === "arrival") previousArrival = {airport:segment.to,time:clock ? `${day}T${clock}` : ""};
            previous = day; result[side] = day;
            evidence.push({leg,index,side,raw,resolved:day,provenance:explicit ? "EXPLICIT_SOURCE_YEAR" : "CONTEXT_RESOLVED_YEAR",basis:explicit ? "source" : period.length ? "verifiedTravelDates" : sourceYears.length ? "explicitSourceYear" : "futureCurrentYear"});
          }
          return result;
        });
      }
      // Validate aliases in every redundant representation before alignCopies can redate them.
      for (const [expected,list] of [[reviewed.outbound,flight.outboundSegments],[reviewed.inbound,flight.inboundSegments],[reviewed.outbound,flight.outbound?.segments],[reviewed.inbound,flight.inbound?.segments],[[...reviewed.outbound,...reviewed.inbound],flight.segments]]) {
        if (!Array.isArray(list)) continue;
        for (const [index,segment] of list.entries()) for (const [alias,side] of [["date","departure"],["departureDate","departure"],["arrivalDate","arrival"]]) {
          if (!segment?.[alias]) continue;
          const parsed = tokens(segment[alias]), day = expected[index]?.[side];
          if (parsed.length !== 1 || !day || !(parsed[0].key === day || parsed[0].key === `????-${day.slice(5)}`)) throw Error("Conflicting or ambiguous source date alias in segment copy");
        }
      }
      // Explicit years in the summary are evidence too; never overwrite a conflict.
      for (const [leg,field] of [["outbound","departure"],["inbound","arrival"]]) {
        const parsed = tokens(flight[field]);
        if (parsed.some(item=>!item.key)) throw Error("Ambiguous summary evidence");
        const hints = parsed.map(item=>[item.key]);
        for (const match of String(flight[field] || "").matchAll(/(?<![\d-])(\d{2})-(\d{2})T\d{2}:\d{2}/g)) hints.push([...new Set([`????-${match[1]}-${match[2]}`,`????-${match[2]}-${match[1]}`])].filter(key=>calendar(key.replace("????","2000"))));
        const bounds = reviewed[leg].flatMap(item=>[item.departure,item.arrival]);
        const expected = hints.length === 1 ? bounds.slice(0,1) : hints.length === 2 ? [bounds[0],bounds.at(-1)] : bounds;
        if (hints.length && (hints.length !== expected.length || hints.some((keys,index)=>keys.filter(key=>key === expected[index] || key === `????-${expected[index]?.slice(5)}`).length !== 1))) throw Error("Summary contradicts source/context");
      }
      const next = resolve(flight,"manual",reviewed);
      const rawDates = {};
      const collect = (record,path) => {
        if (!record || typeof record !== "object") return;
        for (const key of ["departure","arrival","date","departureDate","arrivalDate"]) if (Object.hasOwn(record,key)) rawDates[`${path}.${key}`] = record[key];
      };
      collect(flight,"flight");
      for (const [path,list] of [["outboundSegments",flight.outboundSegments],["inboundSegments",flight.inboundSegments],["segments",flight.segments],["outbound.segments",flight.outbound?.segments],["inbound.segments",flight.inbound?.segments]]) if (Array.isArray(list)) list.forEach((record,index)=>collect(record,`${path}[${index}]`));
      next.dateResolution = {version:2,evidence,rawDates};
      return {ok:true,flight:next};
    } catch (error) { return {ok:false,reason:error.message}; }
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
  return {inspect,resolve,resolveYearContext,needsYearResolution,tokens,calendar,offerConflicts,summary,segmentDateTime};
});
