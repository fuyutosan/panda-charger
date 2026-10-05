const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.template.html'), 'utf8');
function timers() {
  let clock=0, id=0;
  const jobs=new Map();
  return {
    setTimeout(fn,ms) { const key=++id; jobs.set(key,{fn,at:clock+ms}); return key; },
    clearTimeout(key) { jobs.delete(key); },
    advance(ms) {
      const end=clock+ms;
      while(true) {
        const next=[...jobs.entries()].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
        if(!next) break;
        clock=next[1].at; jobs.delete(next[0]); next[1].fn();
      }
      clock=end;
    }
  };
}
function storage() {
  const values=new Map();
  return { getItem:k=>values.get(k)||null, setItem:(k,v)=>values.set(k,v), removeItem:k=>values.delete(k) };
}
function cloud(fetch) {
  const time=timers(), localStorage=storage();
  const ctx=vm.createContext({window:{},localStorage,fetch,AbortController,TextEncoder,crypto:require('node:crypto').webcrypto,...time});
  vm.runInContext(fs.readFileSync(path.join(root,'cloud-sync.js'),'utf8'),ctx);
  ctx.window.CloudSync.saveCred('test','hash');
  return {sync:ctx.window.CloudSync,time,localStorage};
}
const ok=(data=null)=>({ok:true,text:async()=>JSON.stringify(data)});
test('cloud save rejects HTTP failure without marking it synced',async()=>{
  const {sync}=cloud(async()=>({ok:false,status:503}));
  const data={charges:5};
  await assert.rejects(sync.pushNow(data),/503/);
  assert.equal(data._syncedAt,undefined);
});
test('cloud saves are snapshots and complete in request order',async()=>{
  const requests=[], releases=[];
  const {sync}=cloud((url,options)=>{requests.push(JSON.parse(options.body)); return new Promise(r=>releases.push(r));});
  const data={charges:1,cards:{n01:1}};
  const first=sync.pushNow(data); await new Promise(setImmediate);
  data.charges=2; data.cards.n01=2;
  const second=sync.pushNow(data); await new Promise(setImmediate);
  assert.equal(requests.length,1);
  assert.equal(requests[0].p_data.cards.n01,1);
  releases.shift()(ok()); await first; await new Promise(setImmediate);
  assert.equal(requests.length,2);
  assert.equal(requests[1].p_data.charges,2);
  releases.shift()(ok()); await second;
  assert.equal(typeof data._syncedAt,'string');
});
test('explicit save cancels its pending automatic duplicate',async()=>{
  let calls=0;
  const {sync,time}=cloud(async()=>{calls++;return ok();});
  sync.schedulePush({charges:3}); await sync.pushNow();
  time.advance(2000); await new Promise(setImmediate);
  assert.equal(calls,1);
});
test('restore pause cancels pending writes and blocks new writes until adopt',async()=>{
  let calls=0;
  const {sync,time}=cloud(async()=>{calls++;return ok();});
  sync.schedulePush({charges:1}); await sync.pause();
  sync.schedulePush({charges:2}); time.advance(2000); await new Promise(setImmediate);
  assert.equal(calls,0);
  sync.adopt({charges:10}); await sync.pushNow();
  assert.equal(calls,1);
});
test('failed restore can resume automatic saves',async()=>{
  let calls=0;
  const {sync,time}=cloud(async()=>{calls++;return ok();});
  await sync.pause(); sync.resume({charges:4}); time.advance(1500); await new Promise(setImmediate);
  assert.equal(calls,1);
});
test('stalled requests abort and restore distinguishes network failure from no record',async()=>{
  const {sync,time}=cloud((url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')))));
  const pending=sync.pull('test','hash'); const check=assert.rejects(pending,/aborted/);
  time.advance(12000); await check;
  const empty=cloud(async()=>ok());
  assert.equal(await empty.sync.pull('test','hash'),null);
});
function drawHarness({rarity='UR',height=700,rect={top:50,bottom:388,left:50,right:294,height:338,width:244},reduced=false}={}) {
  const time=timers(), nodes=[], listeners=new Map();
  let focused=null, observers=0, sounds=0;
  class Element {
    constructor() {
      this.children=new Map(); this.events=new Map(); this.connected=true; this.attrs={}; this.style={};
      const classes=new Set();
      this.classList={add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v),toggle:(v,on)=>on?classes.add(v):classes.delete(v)};
    }
    setAttribute(k,v){this.attrs[k]=v;}
    removeAttribute(k){delete this.attrs[k];}
    querySelector(k){if(!this.children.has(k))this.children.set(k,new Element()); return this.children.get(k);}
    addEventListener(k,fn){this.events.set(k,fn);}
    dispatch(k,e={}){this.events.get(k)?.({stopPropagation(){},preventDefault(){},...e});}
    appendChild(v){nodes.push(v);}
    remove(){this.connected=false;}
    focus(){focused=this;}
    get isConnected(){return this.connected;}
    getBoundingClientRect(){return rect;}
    scrollIntoView(){}
    animate(){return {};}
  }
  const card=new Element();
  const document={activeElement:new Element(),body:new Element(),createElement:()=>new Element(),querySelector:()=>new Element()};
  const window={innerHeight:height,innerWidth:320,matchMedia:()=>({matches:reduced}),addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k)};
  const ctx=vm.createContext({document,window,...time,save:{cards:{}},CARD_IMAGES:{},drawCard:card,drawFront:new Element(),drawRarityLabel:new Element(),drawName:new Element(),drawBody:new Element(),drawArt:new Element(),drawNewBadge:new Element(),pandaOutfit:new Element(),motionPreference:{matches:reduced},cancelCardDraw:()=>{},lastDrawnCard:null,duckBgm:()=>{},soundCard:()=>sounds++,vibrate:()=>{},soundGachaRise:()=>{},soundGachaPop:()=>{},IntersectionObserver:class {constructor(fn){this.fn=fn;observers++;}observe(){}disconnect(){observers--;}}});
  const start=html.indexOf('    function playCardDraw(');
  const end=html.indexOf('\n    /* ===',start);
  vm.runInContext(html.slice(start,end),ctx);
  ctx.playCardDraw({id:'test',rarity,name:'Test',body:'Body'},true);
  return {time,card,ctx,listeners,overlay:()=>nodes.findLast(n=>n.connected&&['chargeCelebration','gachaOverlay'].includes(n.id)),focus:()=>focused,sounds:()=>sounds,observers:()=>observers};
}
test('background rapid clicks, Enter, Space and Escape do not skip celebration or rare reveal',()=>{
  const h=drawHarness(), first=h.overlay();
  assert.equal(h.focus(),first);
  for(let i=0;i<20;i++)first.dispatch('click');
  for(const key of ['Enter',' ','Escape'])first.dispatch('keydown',{key});
  assert.equal(h.overlay(),first);
  h.time.advance(1100); const rare=h.overlay(); assert.equal(rare.id,'gachaOverlay');
  rare.dispatch('click'); rare.dispatch('keydown',{key:'Escape'});
  assert.equal(h.overlay(),rare);
  assert.equal(h.card.classList.contains('flipped'),false);
  h.time.advance(3000);
  assert.equal(h.card.classList.contains('flipped'),true);
  assert.equal(h.sounds(),1);
});
test('only explicit skip controls advance, including keyboard Tab selection',()=>{
  const h=drawHarness(), first=h.overlay();
  first.dispatch('keydown',{key:'Tab'}); assert.equal(h.focus(),first.querySelector('button'));
  first.querySelector('button').dispatch('click');
  const rare=h.overlay(); assert.equal(rare.id,'gachaOverlay');
  rare.querySelector('button').dispatch('click');
  assert.equal(h.card.classList.contains('flipped'),true);
  h.time.advance(10000); assert.equal(h.sounds(),1);
});
test('cancelled draw leaves no overlay or delayed reveal',()=>{
  const h=drawHarness(); h.ctx.cancelCardDraw(); h.time.advance(10000);
  assert.equal(h.overlay(),undefined); assert.equal(h.card.classList.contains('flipped'),false);
});
test('landscape viewport smaller than a card still reveals it',()=>{
  const h=drawHarness({height:250,rect:{top:-44,bottom:294,height:338,left:50,right:294,width:244}});
  h.time.advance(4100); assert.equal(h.card.classList.contains('flipped'),true);
});
test('resize can finish a reveal and cleans up observers and listeners',()=>{
  const rect={top:800,bottom:1138,height:338,left:50,right:294,width:244};
  const h=drawHarness({rect}); h.time.advance(4100);
  assert.equal(h.observers(),1); assert.equal(h.card.classList.contains('flipped'),false);
  Object.assign(rect,{top:50,bottom:388}); h.listeners.get('resize')();
  assert.equal(h.card.classList.contains('flipped'),true); assert.equal(h.observers(),0); assert.equal(h.listeners.size,0);
});
test('reduced motion uses the automatic reward path without rare animation',()=>{
  const h=drawHarness({reduced:true}); h.time.advance(1000);
  assert.equal(h.overlay(),undefined); assert.equal(h.card.classList.contains('flipped'),true);
});
test('rapid charge lasts 24 taps and can unlock combo20 with automatic fever',()=>{
  let percent=0,fever=false,taps=0;
  const gainExpression=html.match(/let gain = (.*);/)[1];
  for(let combo=1;combo<=50;combo++){
    let gain=vm.runInNewContext(gainExpression,{combo});
    if(fever)gain*=2;
    percent=Math.min(100,percent+gain); taps++;
    if(combo===15)fever=true;
    if(percent>=100)break;
  }
  assert.equal(taps,24); assert.equal(percent,100);
});
test('both HTML variants have matching scripts and parse without errors',()=>{
  const release=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const inline=s=>[...s.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
  const expected=inline(html), actual=inline(release);
  // Image placeholders are substituted when producing the release page.
  const normalize=s=>s.replace(/const CARD_IMAGES = .*;/,'const CARD_IMAGES = IMAGES;').replace(/data:image\/[^'"\s]+/g,'IMAGE');
  assert.deepEqual(actual.map(normalize),expected.map(normalize));
  for(const script of actual)new vm.Script(script);
});
test('manual save reports failure and restores previous account credentials',async()=>{
  let cred={nickname:'previous',secretHash:'old'}, message='';
  const sync={enabled:()=>true,hashSecret:async()=> 'new',getCred:()=>cred,saveCred:(nickname,secretHash)=>{cred={nickname,secretHash};},clearCred:()=>{cred=null;},pushNow:async()=>{throw new Error('offline');}};
  const ctx=vm.createContext({window:{CloudSync:sync},CloudSync:sync,save:{charges:1}});
  const start=html.indexOf('    async function cloudDoSave('),end=html.indexOf('\n    // 別のスマホ',start);
  vm.runInContext(html.slice(start,end),ctx);
  assert.equal(await ctx.cloudDoSave('next','secret',t=>message=t),false);
  assert.deepEqual(cred,{nickname:'previous',secretHash:'old'});
  assert.match(message,/保存できなかった/);
});
test('late startup cloud response cannot replace progress made while waiting',async()=>{
  let resolve, writes=0;
  const sync={enabled:()=>true,getCred:()=>({nickname:'test',secretHash:'hash'}),pull:()=>new Promise(r=>resolve=r)};
  const ctx=vm.createContext({window:{CloudSync:sync},CloudSync:sync,save:{charges:1,_syncedAt:'2026-10-01'},localStorage:{setItem:()=>writes++}});
  const start=html.indexOf('    async function maybeSyncFromCloud()'),end=html.indexOf('\n    /* ===',start);
  vm.runInContext(html.slice(start,end),ctx);
  const pending=ctx.maybeSyncFromCloud();
  ctx.save.charges=2;
  resolve({charges:10,_syncedAt:'2026-10-02'}); await pending;
  assert.equal(ctx.save.charges,2); assert.equal(writes,0);
});
