'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aya-flight-url-http-')),secret=crypto.randomBytes(32).toString('hex');
Object.assign(process.env,{DATA_DIR:temp,DB_FILE:temp+'/db.json',AIRPORT_CONFIG_FILE:temp+'/airports.json',OCR_PATTERN_CONFIG_FILE:temp+'/ocr.json',REGRESSION_LIBRARY_DIR:temp+'/library',AUTH_SECRET:secret,BETA_AUTH_BYPASS:'false',SERPAPI_KEY:''});
fs.writeFileSync(process.env.DB_FILE,JSON.stringify({offers:[],users:[{id:'QA',name:'QA',agencyId:'AGY-AYA',role:'admin',email:'qa@example.test'},{id:'NOIMPORT',name:'QA viewer',agencyId:'AGY-AYA',role:'viewer',email:'viewer@example.test'}],activities:[]}));
const filename=path.resolve(__dirname,'../server.js'),h=new Module(filename,module);h.filename=filename;h.paths=Module._nodeModulePaths(path.dirname(filename));
// Replace external providers only inside the test module. Real route/auth/multipart,
// response builder and UI execute unchanged. No paid calls or external fetching.
h._compile(fs.readFileSync(filename,'utf8')+`
 classifySmartImportSource=async(file,index)=>({sourceType:file.originalname.includes('hotel')?'hotel':'flight',confidence:1,index});
 extractFlightWithAiVision=async()=>({flight:{airline:'Turkish Airlines',route:'SOF → AUH',price:7173.89,outboundSegments:[{from:'SOF',to:'AUH',departure:'2099-11-21T21:45',arrival:'2099-11-22T06:45'}]},canonical:{}});
 extractHotelHintWithSerpApi=async(files,options)=>{const linked=require('./server/hotel-import-link').attachHotelImportLinks([{name:'qa hotel',price:100,room:'QA ROOM'}],options.hotelLinks);return {hotel:linked.records[0],hotelOptions:linked.records,hotelLinks:linked.links};};
 archiveUniversalSourceEvidenceSafe=({sources})=>({sources});
 module.exports.flightUrlApp=app;`,filename);
const cookie=id=>{const data=Buffer.from(JSON.stringify({userId:id,exp:Date.now()+3600000})).toString('base64url');return 'aya_session='+data+'.'+crypto.createHmac('sha256',secret).update(data).digest('base64url');};
let server,browser;const rows=[];
(async()=>{try{
 server=h.exports.flightUrlApp.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 async function request(url='',auth='QA',hotel=false){const body=new FormData();body.append('image',new Blob(['synthetic screenshot'],{type:'image/png'}),hotel?'hotel.png':'flight.png');body.append('flightSourceUrl',url);if(hotel)body.append('hotelLinks',JSON.stringify(['https://www.booking.com/hotel/bg/qa-hotel.html?token=HOTELSECRET']));const r=await fetch(base+'/api/smart-import',{method:'POST',headers:auth?{cookie:cookie(auth)}:{},body});return {status:r.status,data:await r.json()};}
 const cases=[['screenshots-only',''],['valid','https://www.turkishairlines.com/?from=SOF&to=AUH&session=URLSECRET'],['conflict','https://example.com/?from=SOF&to=LHR&session=URLSECRET'],['invalid','javascript:URLSECRET'],['unreachable','https://does-not-exist.invalid/?from=SOF&to=AUH'],['ambiguous','https://example.com/?from=SOF&from=LHR&to=AUH']];
 for(const[name,url]of cases){const r=await request(url);assert.equal(r.status,200,name);assert.equal(r.data.offerFlight.price,7173.89);assert(!JSON.stringify(r.data).includes('URLSECRET'));if(name==='conflict')assert(r.data.flightSourceReview.comparisons.some(c=>c.status==='CONFLICT'));rows.push({name,status:r.status,result:'PASS'});}
 const denied=await request('','');assert([401,403].includes(denied.status));const viewer=await request('','NOIMPORT');assert.equal(viewer.status,403);rows.push({name:'authentication/authorization',status:[denied.status,viewer.status],result:'PASS'});
 const hotel=await request('https://example.com/?from=SOF&to=AUH','QA',true);assert.equal(hotel.status,200);assert.equal(hotel.data.offerHotelOptions[0].price,100);assert.equal(hotel.data.hotelLinks[0],'https://www.booking.com/hotel/bg/qa-hotel.html');assert.equal(hotel.data.offerHotelOptions[0].room,'QA ROOM');rows.push({name:'hotel-links-unchanged',status:200,result:'PASS'});
 const puppeteer=require('puppeteer');browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();await page.setCookie({name:'aya_session',value:cookie('QA').split('=')[1],url:base});await page.goto(base+'/admin',{waitUntil:'networkidle0'});
 await page.$eval('#smartImportFlightUrl',input=>input.value='https://example.com/?from=SOF&to=LHR&session=URLSECRET');await page.$eval('#smartImportImage',input=>{const transfer=new DataTransfer();transfer.items.add(new File(['synthetic screenshot'],'flight.png',{type:'image/png'}));input.files=transfer.files;});
 await page.evaluate(()=>uploadSmartImport());await page.waitForSelector('[data-flight-source-review]');const text=await page.$eval('[data-flight-source-review]',node=>node.textContent);assert(text.includes('CONFLICT'));assert(text.includes('SOF → LHR'));assert(text.includes('SOF → AUH'));assert(!text.includes('URLSECRET'));assert.equal(await page.$eval('#universalFlightRoute',n=>n.value),'SOF → AUH');rows.push({name:'real-browser-upload-review',status:200,result:'PASS',screenshotNotOverwritten:true});
 const db=JSON.parse(fs.readFileSync(process.env.DB_FILE,'utf8'));assert.equal(db.offers.length,0);assert(!JSON.stringify(db).includes('URLSECRET'));
 console.log(JSON.stringify({result:'PASS',rows,noOfferWrites:true,providers:'isolated fixtures, no live AI'},null,2));
 }catch(e){console.error(e);process.exitCode=1;}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}})();
