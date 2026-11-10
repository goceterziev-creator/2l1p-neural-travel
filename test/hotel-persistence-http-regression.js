"use strict";
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto"),assert=require("node:assert/strict"),{spawn}=require("node:child_process");
const root=path.resolve(__dirname,".."),dir=fs.mkdtempSync(path.join(os.tmpdir(),"aya-persistence-http-")),port=3981,base=`http://127.0.0.1:${port}`;
const password=crypto.randomBytes(20).toString("hex"),salt=crypto.randomBytes(16).toString("hex"),hash=salt+":"+crypto.scryptSync(password,salt,64).toString("hex");
const dbfile=path.join(dir,"db.json");
fs.writeFileSync(dbfile,JSON.stringify({offers:[],users:[['A','AGY-AYA','admin'],['B','B','admin'],['V','AGY-AYA','viewer']].map(([id,agencyId,role])=>({id,agencyId,role,name:id,email:id+'@example.test',passwordHash:hash}))}));
const jpg=awaitableImage();
function awaitableImage(){return require('sharp')({create:{width:20,height:20,channels:3,background:'#336699'}}).jpeg().toBuffer();}
const rows=[];function log(check,status,detail){rows.push({check,status,detail});console.log(JSON.stringify(rows.at(-1)));}
let child,cookie='';const read=()=>JSON.parse(fs.readFileSync(dbfile)),snapshot=()=>fs.readFileSync(dbfile,'utf8');
async function request(url,method='GET',body,auth=cookie){const r=await fetch(base+url,{method,headers:{...(auth?{Cookie:auth}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
(async()=>{try{
 const bytes=await jpg;
 fs.writeFileSync(path.join(dir,'preload.cjs'),`const original=global.fetch;global.fetch=async(url,...args)=>{if(String(url).startsWith('https://photos.example.test/')){await new Promise(r=>setTimeout(r,400));return new Response(Buffer.from('${bytes.toString('base64')}','base64'),{status:String(url).includes('invalid')?404:200,headers:{'content-type':'image/jpeg'}})}return original(url,...args)};`);
 const env={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test',PORT:String(port),DATA_DIR:dir,DB_FILE:dbfile,REGRESSION_LIBRARY_DIR:dir+'/library',AUTH_SECRET:crypto.randomBytes(32).toString('hex'),ADMIN_EMAIL:'A@example.test',ADMIN_PASSWORD:password,BETA_AUTH_BYPASS:'false',LIVE_BASE_URL:base,GT63_PRINT_IMAGE_DNS_FIXTURES:JSON.stringify({'photos.example.test':['8.8.8.8']})};
 child=spawn(process.execPath,['--require',dir+'/preload.cjs',root+'/server.js'],{cwd:dir,env,stdio:['ignore','ignore','ignore']});
 for(let i=0;i<100;i++){try{const r=await request('/api/auth/login','POST',{email:'A@example.test',password},'');if(r.status===200){cookie=r.cookie;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(cookie,'server startup/login');
 const b=(await request('/api/auth/login','POST',{email:'B@example.test',password},'')).cookie,v=(await request('/api/auth/login','POST',{email:'V@example.test',password},'')).cookie;
 const payload={destination:'Рим',status:'draft',notes:'unchanged',markupPercent:5,guests:'2 adults',flights:[{route:'SOF -> CIA / CIA -> SOF',price:200}],validationWarnings:['Operator evidence'],hotels:['Same name','Same name','Similar name'].map((name,i)=>({id:i===2?'existing-id':'',name,selected:i===0,images:[],price:100+i,occupancy:{adults:2,children:0,rooms:1,confirmed:true}}))};
 const created=await request('/api/offers','POST',payload);assert.equal(created.status,200);const id=created.data.offer.id,url='/api/offers/'+id;
 const other=await request('/api/offers','POST',{...payload,destination:'Other'});const otherBefore=read().offers.find(o=>o.id===other.data.offer.id);
 let get=(await request(url)).data;
 const identity={offerId:id,expectedVersion:get.offerVersion,operationId:'identity-operation-0001',confirmedHotelIdentity:true};
 async function denied(label,endpoint,body,auth,status){const before=snapshot();const r=await request(endpoint,'POST',body,auth);assert.equal(r.status,status);if(status===409)assert.equal(r.data.details.code,'OFFER_VERSION_CONFLICT');assert.equal(snapshot(),before);log(label,'PASS',{http:r.status,noDBMutation:true});}
 await denied('authentication',url+'/hotel-persistence/identity',identity,'',401);
 await denied('agency',url+'/hotel-persistence/identity',identity,b,403);
 await denied('capability',url+'/hotel-persistence/identity',identity,v,403);
 await denied('explicit confirmation',url+'/hotel-persistence/identity',{...identity,confirmedHotelIdentity:false},cookie,422);
 await denied('exact offer ID',url+'/hotel-persistence/identity',{...identity,offerId:'wrong'},cookie,422);
 const baseline=get.offer,rawBaseline=read().offers.find(o=>o.id===id);const first=await request(url+'/hotel-persistence/identity','POST',identity);assert.equal(first.status,200);assert.equal(first.data.changed,true);assert.equal(first.data.offer.hotels[2].id,'existing-id');assert.equal(new Set(first.data.offer.hotels.map(h=>h.id)).size,3);
 const expected=structuredClone(rawBaseline);expected.hotels=first.data.offer.hotels;expected.editorialRevision=first.data.offer.editorialRevision;expected.updatedAt=first.data.offer.updatedAt;assert.deepEqual(first.data.offer,expected);
 let receipts=read().activities.filter(e=>e.type==='hotel_persistence_applied');assert.equal(receipts.length,1);log('identity assignment and unrelated fields','PASS',{http:200,auditCount:1});
 let before=snapshot();let r=await request(url+'/hotel-persistence/identity','POST',identity);assert.equal(r.status,200);assert.equal(r.data.changed,false);assert.equal(snapshot(),before);log('proven identity replay','PASS',{http:200,noDBWrite:true,noAudit:true});
 const staleUpdate=await request(url,'PUT',{...baseline,expectedVersion:identity.expectedVersion});assert.equal(staleUpdate.status,409);assert.equal(snapshot(),before);log('stale Update Offer cannot erase IDs','PASS',{http:409});
 const hotelId=first.data.offer.hotels[0].id;
 let image={offerId:id,expectedVersion:first.data.offerVersion,operationId:'images-operation-000001',confirmedHotelIdentity:true,hotelId,candidates:[{hotelId,url:'https://photos.example.test/synthetic.jpg',source:'hotel-lookup'}]};
 await denied('wrong hotel ID',url+'/hotel-persistence/images',{...image,hotelId:'wrong'},cookie,409);
 await denied('fallback rejected',url+'/hotel-persistence/images',{...image,candidates:[{...image.candidates[0],source:'pdf-fallback'}]},cookie,422);
 await denied('invalid image bytes/status',url+'/hotel-persistence/images',{...image,candidates:[{...image.candidates[0],url:'https://photos.example.test/invalid.jpg'}]},cookie,422);
 const withImage=await request(url+'/hotel-persistence/images','POST',image);assert.equal(withImage.status,200);assert.deepEqual(withImage.data.offer.hotels[0].images,[image.candidates[0].url]);assert.deepEqual(withImage.data.offer.hotels.slice(1),first.data.offer.hotels.slice(1));
 const preserved=structuredClone(first.data.offer);preserved.hotels[0].images=[image.candidates[0].url];preserved.editorialRevision=withImage.data.offer.editorialRevision;preserved.updatedAt=withImage.data.offer.updatedAt;assert.deepEqual(withImage.data.offer,preserved);
 assert.equal(read().activities.filter(e=>e.type==='hotel_persistence_applied').length,2);log('validated exact-ID image write','PASS',{http:200,auditCount:2,otherFieldsPreserved:true});
 before=snapshot();r=await request(url+'/hotel-persistence/images','POST',image);assert.equal(r.status,200);assert.equal(r.data.changed,false);assert.equal(snapshot(),before);log('proven image replay','PASS',{http:200,noDBWrite:true,noAudit:true});
 await denied('operation ID reused with changed candidate',url+'/hotel-persistence/images',{...image,candidates:[{...image.candidates[0],url:'https://photos.example.test/different.jpg'}]},cookie,409);
 const staleImagesSnapshot=snapshot();const staleImages=await request(url,'PUT',{...first.data.offer,expectedVersion:first.data.offerVersion});assert.equal(staleImages.status,409);assert.equal(snapshot(),staleImagesSnapshot);log('stale PUT after image persistence','PASS',{http:409,noDBMutation:true});
 await denied('operation ID reused with different request',url+'/hotel-persistence/images',{...image,confirmedHotelIdentity:false},cookie,422);
 await denied('identity replay after subsequent image edit',url+'/hotel-persistence/identity',identity,cookie,409);
 await request(url+'/click','POST',{});r=await request(url+'/hotel-persistence/images','POST',image);assert.equal(r.status,200);assert.equal(r.data.changed,false);assert.equal(r.data.offer.clicks,1);log('telemetry-safe replay','PASS',{http:200});
 get=(await request(url)).data;const oldNotes=get.offer.notes;await request(url,'PUT',{...get.offer,notes:'temporary edit',expectedVersion:get.offerVersion});get=(await request(url)).data;await request(url,'PUT',{...get.offer,notes:oldNotes,expectedVersion:get.offerVersion});
 await denied('retry after edit-and-revert',url+'/hotel-persistence/images',image,cookie,409);
 get=(await request(url)).data;const pending={...image,operationId:'concurrent-image-00001',expectedVersion:get.offerVersion,candidates:[{hotelId,url:'https://photos.example.test/new-synthetic.jpg',source:'hotel-lookup'}]};
 const operation=request(url+'/hotel-persistence/images','POST',pending);await new Promise(r=>setTimeout(r,100));const edit=await request(url,'PUT',{...get.offer,notes:'Concurrent winner',expectedVersion:get.offerVersion});assert.equal(edit.status,200);before=snapshot();r=await operation;assert.equal(r.status,409);assert.equal(r.data.details.code,'OFFER_VERSION_CONFLICT');assert.equal(snapshot(),before);log('concurrent edit during image validation','PASS',{http:409,noAuditOrOfferMutation:true});
 assert.deepEqual(read().offers.find(o=>o.id===other.data.offer.id),otherBefore);assert.equal(read().activities.filter(e=>e.type==='hotel_persistence_applied').length,2);log('other offer untouched; final audit count','PASS',{auditCount:2});
 }catch(e){log('execution','FAIL',e.stack);process.exitCode=1;}finally{if(child&&child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}fs.rmSync(dir,{recursive:true,force:true});if(process.env.AYA_HTTP_REPORT)fs.writeFileSync(process.env.AYA_HTTP_REPORT,JSON.stringify(rows,null,2));}})();
