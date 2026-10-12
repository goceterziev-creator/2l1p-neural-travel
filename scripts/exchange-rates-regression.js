"use strict";
const assert=require('node:assert/strict');const {createExchangeRateService,validateRates}=require('../server/exchange-rates');
const now=Date.now();const data={result:'success',base_code:'EUR',rates:{EUR:1,MKD:61.497,QAR:4.077842,USD:1.120287,BAD:-1},time_last_update_unix:Math.floor(now/1000)-60,time_next_update_unix:Math.floor(now/1000)+3600};
(async()=> {
 let calls=0;const get=createExchangeRateService({now:()=>now,fetchImpl:async()=> {calls++;return {ok:true,json:async()=>data};}});
 const results=await Promise.all([get(),get()]);assert.equal(calls,1);assert.equal((await get()).rates.MKD,61.497);assert.equal(calls,1);assert.equal(results[0].rates.BAD,undefined);
 assert.throws(()=>validateRates({...data,time_last_update_unix:Math.floor(now/1000)-49*3600},now));assert.throws(()=>validateRates({...data,base_code:'USD'},now));
 const unavailable=createExchangeRateService({fetchImpl:async()=>{throw Error('offline');}});await assert.rejects(unavailable(),/offline/);
 console.log('PASS one cached request serves concurrent conversions; invalid/stale rates and outages fail safely');
 const live=await createExchangeRateService()();console.log({updatedAt:live.updatedAt,MKD:live.rates.MKD,QAR:live.rates.QAR});
})().catch(e=>{console.error(e);process.exitCode=1;});
