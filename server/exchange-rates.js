"use strict";
const fs=require('node:fs');const path=require('node:path');
function validateRates(data, now=Date.now()) {
  const updatedAt=Number(data.time_last_update_unix)*1000;
  if(data.result!=="success" || data.base_code!=="EUR" || !Number.isFinite(updatedAt) || updatedAt>now+300000 || now-updatedAt>48*3600000) throw Error('Exchange rates are invalid or older than 48 hours');
  const rates=Object.fromEntries(Object.entries(data.rates||{}).filter(([code,rate])=>/^[A-Z]{3}$/.test(code)&&typeof rate==='number'&&Number.isFinite(rate)&&rate>0));
  if(rates.EUR!==1) throw Error('Invalid EUR base');
  return {base:'EUR',rates,updatedAt:new Date(updatedAt).toISOString(),provider:'https://www.exchangerate-api.com',nextUpdate:Number(data.time_next_update_unix)*1000};
}
function createExchangeRateService({cacheFile,fetchImpl=fetch,now=Date.now}={}) {
  let cache=null,pending=null;
  const usable=()=>cache&&now()<Math.min(cache.nextUpdate||0,Date.parse(cache.updatedAt)+48*3600000);
  return async function getRates() {
    if(usable()) return cache;
    if(!cache&&cacheFile) try { cache=validateRates(JSON.parse(fs.readFileSync(cacheFile,'utf8')),now()); } catch {}
    if(usable()) return cache;
    if(pending) return pending;
    pending=(async()=> {
      const response=await fetchImpl('https://open.er-api.com/v6/latest/EUR',{signal:AbortSignal.timeout(10000)});
      if(!response.ok) throw Error('Exchange rate provider unavailable');
      const data=await response.json();const validated=validateRates(data,now());
      if(cacheFile) {fs.mkdirSync(path.dirname(cacheFile),{recursive:true});fs.writeFileSync(cacheFile,JSON.stringify(data));}
      cache=validated;return cache;
    })();
    try {return await pending;} finally {pending=null;}
  };
}
module.exports={validateRates,createExchangeRateService};
