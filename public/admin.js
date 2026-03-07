-Encoding UTF8 -Value @'
const adminOffers=document.getElementById(""adminOffers""),adminStats=document.getElementById(""adminStats""),filterIds=[""q"",""status"",""destination"",""from"",""to"",""sort""];
const pad=(n)=>String(n).padStart(2,'0');
const formatDate=(d)=>{
  const x=new Date(d);
  if(isNaN(x)) return '-';
  return pad(x.getDate())+'.'+pad(x.getMonth()+1)+'.'+x.getFullYear()+' '+pad(x.getHours())+':'+pad(x.getMinutes());
};
const badge=(s)=>`<span class=""badge ${s}"">${s}</span>`;
function row(offer){
  const link=`${location.origin}/offer/${offer.id}`;
  return `<div class=""offer-card""><div class=""offer-top""><div>${badge(offer.effectiveStatus)}<h3 class=""offer-title"">${offer.destination}</h3><div class=""offer-sub"">${offer.clientName||"No client"} · ${offer.flightRoute||"No route"} · ${offer.hotel||"No hotel"}</div></div><div class=""status-row""><select data-id=""${offer.id}"" class=""status-select"">${[""draft"",""sent"",""viewed"",""booked"",""cancelled""].map(s=>`<option value=""${s}"" ${offer.status===s?""selected"":""""}>${s}</option>`).join("""")}</select></div></div><div class=""meta-grid""><div class=""meta-box""><div class=""label"">Client Price</div><div class=""value"">${Number(offer.price).toFixed(2)} ${offer.currency}</div></div><div class=""meta-box""><div class=""label"">Base Price</div><div class=""value"">${Number(offer.basePrice).toFixed(2)} ${offer.currency}</div></div><div class=""meta-box""><div class=""label"">Margin</div><div class=""value"">${(Number(offer.price)-Number(offer.basePrice)).toFixed(2)} ${offer.currency}</div></div><div class=""meta-box""><div class=""label"">Markup</div><div class=""value"">${Number(offer.markupPercent).toFixed(2)}%</div></div><div class=""meta-box""><div class=""label"">Created</div><div class=""value"">${formatDate(offer.createdAt)}</div></div><div class=""meta-box""><div class=""label"">Valid Until</div><div class=""value"">${formatDate(offer.validUntil)}</div></div></div><div class=""offer-actions""><a class=""btn secondary"" href=""/offer/${offer.id}"" target=""_blank"">Client Page</a><a class=""btn secondary"" href=""/api/offers/${offer.id}/pdf"" target=""_blank"">PDF</a><button class=""btn secondary copy-link"" data-link=""${link}"">Copy Link</button></div></div>`;
}
async function loadStats(){
  const res=await fetch(""/api/offers/stats"");
  const data=await res.json();
  adminStats.innerHTML=`<div class=""kpi""><div class=""label"">Total Offers</div><div class=""value"">${data.totalOffers}</div></div><div class=""kpi""><div class=""label"">Active Offers</div><div class=""value"">${data.activeOffers}</div></div><div class=""kpi""><div class=""label"">Revenue Potential</div><div class=""value"">${Number(data.totalRevenuePotential).toFixed(2)} EUR</div></div><div class=""kpi""><div class=""label"">Margin Potential</div><div class=""value"">${Number(data.totalMarginPotential).toFixed(2)} EUR</div></div><div class=""kpi""><div class=""label"">Booked</div><div class=""value"">${data.byStatus.booked}</div></div><div class=""kpi""><div class=""label"">Expired</div><div class=""value"">${data.byStatus.expired}</div></div>`;
}
async function loadOffers(){
  const params=new URLSearchParams();
  filterIds.forEach(id=>{const value=document.getElementById(id).value; if(value) params.set(id,value);});
  const res=await fetch(`/api/offers?${params.toString()}`);
  const data=await res.json();
  if(!data.offers.length){
    adminOffers.innerHTML='<div class=""empty"">No matching offers.</div>';
    return;
  }
  adminOffers.innerHTML=data.offers.map(row).join("""");
  document.querySelectorAll("".status-select"").forEach(sel=>sel.addEventListener(""change"",async()=>{
    await fetch(`/api/offers/${sel.dataset.id}/status`,{method:""PATCH"",headers:{""Content-Type"":""application/json""},body:JSON.stringify({status:sel.value})});
    loadOffers();
    loadStats();
  }));
  document.querySelectorAll("".copy-link"").forEach(btn=>btn.addEventListener(""click"",async()=>{
    await navigator.clipboard.writeText(btn.dataset.link);
    btn.textContent=""Copied"";
    setTimeout(()=>btn.textContent=""Copy Link"",1200);
  }));
}
filterIds.forEach(id=>{
  document.getElementById(id).addEventListener(""input"",loadOffers);
  document.getElementById(id).addEventListener(""change"",loadOffers);
});
loadStats();
loadOffers();
'@"