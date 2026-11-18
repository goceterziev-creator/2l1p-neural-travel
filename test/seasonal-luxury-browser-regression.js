'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),puppeteer=require('puppeteer');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'aya-seasonal-browser-'));
for(const[k,v]of Object.entries({DATA_DIR:tmp,DB_FILE:tmp+'/db.json',AIRPORT_CONFIG_FILE:tmp+'/airports.json',OCR_PATTERN_CONFIG_FILE:tmp+'/ocr.json',REGRESSION_LIBRARY_DIR:tmp+'/library',SERPAPI_KEY:''}))process.env[k]=v;
const file=path.join(root,'server.js'),app=new Module(file,module);app.filename=file;app.paths=Module._nodeModulePaths(root);app._compile(fs.readFileSync(file,'utf8')+'\nmodule.exports.seasonalTest={renderGt63PrintOfferHtml};',file);
const render=app.exports.seasonalTest.renderGt63PrintOfferHtml;
const luminance=rgb=>rgb.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
const contrast=(color,bg)=>{const a=luminance(color.match(/\d+/g).map(Number)),b=luminance(bg.match(/\d+/g).map(Number));return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
(async()=>{let browser;try{browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const p=await browser.newPage();await p.setRequestInterception(true);p.on('request',r=>r.url().startsWith('data:')?r.continue():r.abort());const rows=[];
for(const[month,expected,soft]of [['04','spring','#edf3e9'],['07','summer','#eaf3f5'],['10','autumn','#f8eddf'],['01','winter','#eef0f7'],['','neutral','#f5f1e8']]){
const offer={id:'SYNTHETIC-SEASONAL',destination:'Рим',clientName:'LOCAL QA',travelDates:month?`10.${month}.2099 - 20.${month}.2099`:'',guests:'2 възрастни',status:'draft',currency:'EUR',markupPercent:0,finalPrice:100,hotels:[{id:'a',name:'SYNTHETIC QA HOTEL',room:'QA ROOM',meal:'Закуска',price:100,selected:true,occupancy:{adults:2,children:0,rooms:1,confirmed:false}}],validationWarnings:['[WARNING] Условията не са потвърдени.']};
const {rawNotices,MATERIAL}=require('../server/offer-notices');
const [notice]=rawNotices(offer);
offer.noticeDecisions={[notice.id]:{classification:MATERIAL,clientText:'[WARNING] Условията не са потвърдени.',actorId:'QA',decidedAt:'2026-11-18T00:00:00Z'}};
const before=JSON.stringify(offer);
await p.goto('about:blank');await p.setContent(render(offer,{mode:'selected',selectedHotelId:'a'}),{waitUntil:'load'});
const styles=await p.evaluate(()=>({theme:document.querySelector('.gt63-print-proposal').dataset.seasonalTheme,soft:getComputedStyle(document.querySelector('.gt63-print-proposal')).getPropertyValue('--seasonal-soft').trim(),cards:[...document.querySelectorAll('.gt63-print-selected-details .gt63-print-fact')].map(x=>({background:getComputedStyle(x).backgroundColor,text:getComputedStyle(x.querySelector('dd')).color})),warning:getComputedStyle(document.querySelector('.gt63-print-notices li')).color,decorations:document.querySelectorAll('.gt63-seasonal-hotel-background').length,text:document.body.textContent}));
assert.equal(styles.theme,expected);assert.equal(styles.soft,soft);assert.equal(styles.decorations,0);const ratios=styles.cards.map(x=>contrast(x.text,x.background));assert(ratios.every(x=>x>=4.5));assert(contrast(styles.warning,'rgb(251,250,247)')>=4.5);assert(styles.text.includes('Важно: Условията не са потвърдени.'));assert(styles.text.includes('непотвърдена заетост'));
const pdf=Buffer.from(await p.pdf({preferCSSPageSize:true,printBackground:true})),pages=(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;assert(pages<=5,'compact missing-image fixture must not gain pages');assert.equal(JSON.stringify(offer),before);rows.push({theme:expected,pages,minCardContrast:Math.min(...ratios)});
}
console.log(JSON.stringify({result:'PASS',rows}));
}finally{if(browser)await browser.close();fs.rmSync(tmp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
