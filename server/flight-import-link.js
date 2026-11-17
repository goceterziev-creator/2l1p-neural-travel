'use strict';
// Query/path hints only. No DNS, HTTP, redirects or provider calls. Never retain
// the URL: flight checkout links commonly contain sessions and personal tokens.
function reviewFlightSourceUrl(value, flight = {}, parsers = {}) {
  if (!String(value || '').trim()) return null;
  const result={source:'url-parameters-only',access:'NOT_FETCHED',hints:{},comparisons:[],warnings:[],unknown:['price','availability','booking','allSegments']};
  let url;
  try {
    if (typeof value !== 'string' || value.length>8192) throw Error();
    url=new URL(value.trim());
    if (!['https:','http:'].includes(url.protocol)||url.username||url.password||!url.hostname.includes('.')||/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/i.test(url.hostname)||url.hostname.includes(':')) throw Error();
  } catch {result.warnings.push('Невалиден помощен линк за полет. Импортът продължава със скрийншотите.');return result;}
  const p=url.searchParams,h=result.hints;
  const fields=['from','origin','departure','src','to','destination','arrival','dst','depart','departureDate','outboundDate','return','returnDate','inboundDate','departureTime','arrivalTime','returnTime','baggage'];
  const aliases=[['from','origin','departure','src'],['to','destination','arrival','dst'],['depart','departureDate','outboundDate'],['return','returnDate','inboundDate']];
  const conflictingAliases=aliases.some((group,index)=>new Set(group.flatMap(field=>p.getAll(field)).filter(v=>index<2?/^[A-Za-z]{3}$/.test(v):/^\d{4}-\d{2}-\d{2}$/.test(v)).map(v=>v.toUpperCase())).size>1);
  if(conflictingAliases||fields.some(field=>new Set(p.getAll(field)).size>1)) {
    result.warnings.push('Противоречиви параметри в линка. Използвайте скрийншотите; URL подсказките не са приложени.');
    return result;
  }
  const code=v=>/^[A-Za-z]{3}$/.test(v||'')?v.toUpperCase():'';
  const from=code(p.get('from')||p.get('origin')||p.get('departure')||p.get('src'));
  const to=code(p.get('to')||p.get('destination')||p.get('arrival')||p.get('dst'));
  const parsedRoute=parsers.extractRouteFromUrl?.(value)||'';
  const route=parsedRoute.match(/^([A-Z]{3})\s*[→-]+\s*([A-Z]{3})$/);
  if(from&&to)h.route=route?`${route[1]} → ${route[2]}`:`${from} → ${to}`;
  const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  const range=(parsers.extractDatesFromUrl?.(value)||'').match(/^(\d{4}-\d{2}-\d{2}) - (\d{4}-\d{2}-\d{2})$/);
  if(range&&range.slice(1).every(validDate)&&range[1]<=range[2]){h.departureDate=range[1];h.returnDate=range[2];}
  const clock=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v||'')?v:'';
  for(const field of ['departureTime','arrivalTime','returnTime']){const v=clock(p.get(field));if(v)h[field]=v;}
  if(/(?:^|\.)turkishairlines\.com$/i.test(url.hostname))h.airline='Turkish Airlines';
  else if(/(?:^|\.)ryanair\.com$/i.test(url.hostname))h.airline='Ryanair';
  else if(/(?:^|\.)wizzair\.com$/i.test(url.hostname))h.airline='Wizz Air';
  const baggage=(p.get('baggage')||'').match(/^(\d{1,2})\s*(kg|pc)$/i);if(baggage)h.baggage=`${baggage[1]} ${baggage[2].toLowerCase()}`;
  const out=flight.outboundSegments||[],back=flight.inboundSegments||[];
  const iso=v=>String(v||'').match(/\b\d{4}-\d{2}-\d{2}(?=T|\b)/)?.[0]||'';
  const time=v=>String(v||'').match(/(?:T|\s)([0-2]\d:[0-5]\d)\b/)?.[1]||'';
  const routeCodes=String(flight.route||'').match(/\b[A-Z]{3}\b/g)||[];
  const screen={route:out.length&&out[0].from&&out.at(-1).to?`${out[0].from} → ${out.at(-1).to}`:routeCodes.length>=2?`${routeCodes[0]} → ${routeCodes[1]}`:'',departureDate:iso(out[0]?.departure),returnDate:iso(back[0]?.departure),departureTime:time(out[0]?.departure),arrivalTime:time(out.at(-1)?.arrival),returnTime:time(back[0]?.departure),airline:flight.airline||'',baggage:flight.baggage||''};
  const key=v=>String(v).toLowerCase().replace(/\s+/g,'');
  for(const [field,urlValue]of Object.entries(h)){
    const screenshotValue=screen[field]||'';
    const status=!screenshotValue?'UNKNOWN':key(urlValue)===key(screenshotValue)?'MATCH':'CONFLICT';
    result.comparisons.push({field,urlValue,screenshotValue,status});
    if(status==='CONFLICT')result.warnings.push(`Разминаване между URL подсказката и скрийншота: ${field}. Запазени са двете стойности за преглед.`);
  }
  if(!Object.keys(h).length)result.warnings.push('От линка не са извлечени надеждни параметри. Използвайте скрийншотите.');
  result.warnings.push('Съдържанието на сайта не е зареждано. URL е помощна подсказка, не потвърждение на цена, наличност или резервация.');
  return result;
}
module.exports={reviewFlightSourceUrl};
