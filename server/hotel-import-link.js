"use strict";
function readHotelImportLink(value) {
  if(!String(value||'').trim()) return {url:'',nameHint:'',warning:''};
  try {
    const u=new URL(String(value).trim());
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hostname==='localhost'||/^(?:127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)||u.hostname.includes(':')) throw Error('Invalid link');
    // Public property identity only: never retain booking/session/query tokens.
    const match=u.hostname.match(/(?:^|\.)booking\.com$/i) && u.pathname.match(/^\/hotel\/[^/]+\/([^/]+)\.html$/i);
    if(/(?:^|\.)booking\.com$/i.test(u.hostname) && !match) throw Error('Not a public property link');
    const nameHint=match ? decodeURIComponent(match[1]).replace(/\.(?:[a-z]{2}(?:-[a-z]{2})?)$/i,'').replace(/-/g,' ').trim() : '';
    return {url:u.origin+u.pathname,nameHint,warning:''};
  } catch {return {url:'',nameHint:'',warning:'Линкът не е публичен хотелски адрес. Импортът продължава със скрийншотите.'};}
}
const key=s=>String(s||'').toLowerCase().replace(/&/g,'and').replace(/[^\p{L}\p{N}]/gu,'');
function attachHotelImportLink(records,link) {
  const copy=records.map(h=>({...h}));const warnings=link.warning?[link.warning]:[];
  if(!link.url) return {records:copy,warnings};
  const names=[...new Set(copy.map(h=>h.name).filter(Boolean))];
  const rooms=[...new Set(copy.map(h=>key(h.room)).filter(Boolean))];
  if(!names.length && link.nameHint && rooms.length<=1) {
    copy.forEach(h=>{h.name=link.nameHint;h.url=link.url;});
    warnings.push('Името на хотела е подсказано от линка. Потвърдете го спрямо скрийншота.');
  } else {
    const matches=copy.filter(h=>link.nameHint && (key(h.name).includes(key(link.nameHint))||key(link.nameHint).includes(key(h.name))) && key(h.name));
    if(matches.length) matches.forEach(h=>{h.url=link.url;});
    else if(names.length===1 && !link.nameHint) {copy.filter(h=>h.name).forEach(h=>{h.url=link.url;});warnings.push('Проверете дали линкът е към разпознатия хотел.');}
    else warnings.push('Линкът не е свързан еднозначно с хотел. Данните от скрийншотите са запазени.');
  }
  return {records:copy,warnings};
}
module.exports={readHotelImportLink,attachHotelImportLink};
