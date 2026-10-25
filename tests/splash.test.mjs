import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const source = fs.readFileSync('src/splash.js', 'utf8');
const mounted = fs.readFileSync('src/main.tsx', 'utf8').match(/    startup.__APP_MOUNTED__[\s\S]*?(?=\n  }, \[\]\);)/)[0];

async function setup({ query = '', seen = false, ready = true, reduced = false, denied = false, mode = 'development', imageFailure = false, delayedImages = false, drawing = false, width = 1280, height = 800 } = {}) {
  let now = 100, id = 0, canvasCalls = 0;
  let appRequests = 0;
  let draws = 0;
  let reflections = 0;
  const drawingContext = {
    createRadialGradient(){reflections++;return {addColorStop(){}};},
    setTransform(){},clearRect(){},fillRect(){},beginPath(){},moveTo(){},quadraticCurveTo(){},stroke(){},
    drawImage(image,sx,sy,sw,sh,dx,dy,dw,dh){
      assert.ok([sx,sy,sw,sh,dx,dy,dw,dh].every(Number.isFinite));
      assert.ok(sw>0 && sh>0 && dw>0 && dh>0);
      assert.ok(sx>=0 && sy>=0 && sx+sw<=image.naturalWidth+.001 && sy+sh<=image.naturalHeight+.001);
      draws++;
    }
  };
  const imageDecoders = [];
  const frames = new Map(), timers = new Map(), storage = new Map(seen ? [['aqua-splash-seen-v1', '1']] : []);
  class Element {
    constructor() {
      this.listeners = new Map(); this.children = []; this.dataset = {}; this.textContent = '';
      this.style = { setProperty(k,v) { this[k]=v; }, getPropertyValue(k) { return this[k] || '0'; }, removeProperty(k) { delete this[k]; } };
      const classes = new Set(); this.classList = { add: x=>classes.add(x), remove: x=>classes.delete(x), contains: x=>classes.has(x) };
      this.complete = true; this.naturalWidth = imageFailure ? 0 : 100; this.naturalHeight = 100;
      this.offsetWidth = 100; this.clientWidth = 85;
      if (delayedImages) this.decode = () => new Promise(resolve => imageDecoders.push(resolve));
    }
    addEventListener(k,fn) { this.listeners.set(k,fn); }
    removeEventListener(k) { this.listeners.delete(k); }
    emit(k,e={}) { this.listeners.get(k)?.(e); }
    appendChild(e) { this.children.push(e); }
    prepend(e) { this.children.unshift(e); }
    replaceChildren() { this.children=[]; }
    setAttribute(k,v) { this[k]=v; }
    remove() { this.removed=true; }
    querySelector(k) { return nodes[k]; }
    querySelectorAll(k) { return groups[k] || []; }
    getContext() { canvasCalls++; return drawing ? drawingContext : null; }
  }
  const nodes = Object.fromEntries(['.sc-scene','.sc-moon','.sc-sky','.sc-sea-base','.sc-wave-left','.sc-wave-right','.sc-water','.sc-network','.sc-copy','.sc-loader','.sc-skip','.sc-metrics','img'].map(k=>[k,new Element()]));
  const groups = { '.sc-wave img': [new Element(),new Element()], '.sc-node': Array.from({length:6},()=>{const e=new Element();e.firstElementChild=new Element();return e;}), '.sc-footer span': Array.from({length:5},()=>new Element()) };
  groups['.sc-wave-water'] = drawing ? [new Element(),new Element()] : [];
  const splash = new Element(); splash.dataset.mode=mode;
  const document = new Element(); document.hidden=false; document.documentElement=new Element(); document.body=new Element();
  document.getElementById = k=>k==='splash'?splash:null;
  document.createElement=document.createElementNS=()=>new Element();
  const window = new Element(); Object.assign(window,{innerWidth:width,innerHeight:height,devicePixelRatio:1,__APP_MOUNTED__:ready,matchMedia:()=>({matches:reduced})});
  const context = vm.createContext({window,document,location:{search:query,hash:''},URLSearchParams,performance:{now:()=>now},Image:Element,
    localStorage:{getItem:k=>{if(denied)throw Error('disabled');return storage.get(k);},setItem:(k,v)=>{if(denied)throw Error('disabled');storage.set(k,v);}},
    requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
    clearTimeout:id=>timers.delete(id)});
  window.setTimeout=(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;};
  vm.runInContext(bootstrap.replaceAll('%MODE%',mode),context);
  window.__SPLASH_STATE__.startApp = () => { appRequests++; };
  vm.runInContext(source,context);
  await new Promise(resolve=>setImmediate(resolve));
  function tick(ms) { const end=now+ms; while(now<end) {now=Math.min(end,now+20);const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn(now));for(const [key,t] of timers)if(t.at<=now){timers.delete(key);t.fn();}} }
  return {splash,nodes,groups,window,document,storage,frames,timers,tick,canvasCalls:()=>canvasCalls,appRequests:()=>appRequests,draws:()=>draws,reflections:()=>reflections,
    async decodeImages(){imageDecoders.splice(0).forEach(resolve=>resolve());await new Promise(resolve=>setImmediate(resolve));},
    mount(){ context.startup=window;vm.runInContext(mounted,context); },
    hidden(value){document.hidden=value;document.emit('visibilitychange');},
    clean(){assert.equal(splash.removed,true);assert.equal(document.documentElement.classList.contains('splash-lock'),false);assert.equal(frames.size,0);assert.equal(timers.size,0);assert.equal(window.listeners.size,0);assert.equal(document.listeners.size,0);assert.equal(nodes['.sc-skip'].listeners.size,0);}
  };
}

test('every visit plays even when an old saved record exists',async()=>{
  const s=await setup();s.tick(2100);assert.equal(s.nodes['.sc-copy'].style.opacity,1);assert.match(s.nodes['.sc-loader'].textContent,/已就绪/);
  s.tick(7100);s.clean();assert.equal(s.storage.size,0);
  for (const mode of ['development','production']) { const next=await setup({seen:true,mode});assert.notEqual(next.splash.removed,true);assert.equal(next.canvasCalls(),1);assert.equal(next.document.documentElement.classList.contains('splash-seen'),false);next.tick(9200);next.clean(); }
});
test('button, scene click and Escape release resources without saving a playback record',async()=>{
  for(const key of ['click','scene','Escape']) {const s=await setup();if(key==='click')s.nodes['.sc-skip'].emit('click');else if(key==='scene')s.splash.emit('click');else s.window.emit('keydown',{key});s.tick(400);s.clean();assert.equal(s.splash.listeners.size,0);assert.equal(s.storage.size,0);}
});
test('early skip waits for application mount without saving a playback record',async()=>{
  const s=await setup({ready:false});s.nodes['.sc-skip'].emit('click');s.tick(400);assert.equal(s.splash.removed,undefined);assert.equal(s.appRequests(),1);assert.equal(s.storage.size,0);s.mount();s.tick(450);s.clean();assert.equal(s.storage.size,0);
});
test('unready timeout releases the overlay without claiming success',async()=>{
  const s=await setup({ready:false});s.tick(12400);s.clean();assert.match(s.nodes['.sc-loader'].textContent,/正在准备/);assert.equal(s.appRequests(),1);assert.equal(s.storage.size,0);
});
test('background duration pauses animation and does not count toward timeout',async()=>{
  const s=await setup({ready:false});s.tick(7000);s.hidden(true);s.tick(30000);assert.equal(s.splash.removed,undefined);s.hidden(false);s.tick(4980);assert.equal(s.splash.removed,undefined);s.tick(420);s.mount();s.tick(450);s.clean();
  const normal=await setup();normal.tick(2000);normal.hidden(true);normal.tick(20000);normal.hidden(false);normal.tick(6900);assert.equal(normal.splash.removed,undefined);normal.tick(300);normal.clean();
});
test('late readiness releases held animation without exceeding foreground cap',async()=>{
  const s=await setup({ready:false});s.tick(8000);assert.equal(s.splash.dataset.playback,'preparing');s.mount();s.tick(140);assert.equal(s.splash.dataset.playback,'running');s.tick(9100);s.clean();assert.equal(s.storage.size,0);
});
test('system reduced motion finishes quickly; storage errors and image failures remain usable',async()=>{
  for(const options of [{reduced:true},{denied:true},{imageFailure:true}]){const s=await setup(options);s.tick(options.reduced?600:9200);s.clean();}
});
test('development test modes bypass saved visits and never persist',async()=>{
  for(const query of ['?splashTest=slow','?splashTest=timeout','?splashTest=canvasOff','?splashTest=reduced','?splashTest=moonFail']){
    const s=await setup({query,seen:true});assert.notEqual(s.splash.removed,true);s.storage.clear();s.tick(22000);s.clean();assert.equal(s.storage.size,0);
  }
});

test('critical image decoding and painted warmup precede the animation clock',async()=>{
  const s=await setup({delayedImages:true});s.tick(5000);
  assert.equal(s.splash.dataset.playback,'preparing');assert.equal(s.splash.classList.contains('sc-ready'),false);assert.equal(s.appRequests(),0);
  await s.decodeImages();s.tick(140);
  assert.equal(s.splash.dataset.playback,'running');assert.equal(s.splash.dataset.stage,'1');
  assert.equal(s.nodes['.sc-copy'].style.opacity,1);assert.equal(s.appRequests(),1);
  s.tick(9100);s.clean();
});

test('homepage initialization completes during preparation before the animation clock starts',async()=>{
  const s=await setup({ready:false});s.tick(1000);assert.equal(s.appRequests(),1);assert.equal(s.splash.dataset.playback,'preparing');
  s.tick(1000);assert.equal(s.appRequests(),1);assert.equal(s.splash.dataset.stage,'1');
  s.mount();s.tick(140);assert.equal(s.splash.dataset.playback,'running');s.tick(9100);s.clean();
});

test('skip during image decoding enters the application without showing a blank page',async()=>{
  const s=await setup({ready:false,delayedImages:true});s.nodes['.sc-skip'].emit('click');s.tick(1000);
  assert.equal(s.appRequests(),1);assert.equal(s.splash.removed,undefined);
  s.hidden(true);s.tick(1000);s.mount();s.hidden(false);s.tick(450);s.clean();
  await s.decodeImages();assert.equal(s.frames.size,0);
});
test('production ignores debug parameters; frozen development preview stays open',async()=>{
  const prod=await setup({query:'?splashAt=2100',seen:true,mode:'production'});assert.notEqual(prod.splash.removed,true);prod.tick(9200);prod.clean();
  const frozen=await setup({query:'?splashAt=2100',seen:true});frozen.tick(20000);assert.equal(frozen.splash.removed,undefined);assert.equal(frozen.nodes['.sc-copy'].style.opacity,1);frozen.nodes['.sc-skip'].emit('click');frozen.tick(400);frozen.clean();
});

test('water drawing remains valid across desktop, portrait and short landscape',async()=>{
  for(const [width,height] of [[1440,900],[390,844],[844,390]]) {
    const s=await setup({drawing:true,width,height});s.tick(7600);
    assert.ok(s.draws()>1000);assert.notEqual(s.nodes['.sc-water'].style.visibility,'hidden');
    const before=s.draws();s.tick(1100);assert.ok(s.draws()>before);
    s.tick(500);s.clean();
  }
});
test('crossfade is monotonic and water keeps moving until the final frame',async()=>{
  const s=await setup({drawing:true});s.tick(7640);let opacity=Number(s.splash.style.opacity);
  for(let i=0;i<70;i++) { const draws=s.draws();s.tick(20);const next=Number(s.splash.style.opacity);assert.ok(next<=opacity);assert.ok(opacity-next<.04);assert.ok(s.draws()>draws);opacity=next; }
  s.tick(300);s.clean();
});
test('late mount and application failure cannot extend the foreground timeout',async()=>{
  const late=await setup({ready:false});late.tick(8000);late.mount();late.tick(4400);late.clean();
  const failed=await setup({ready:false});failed.window.__SPLASH_STATE__.appFailed=true;failed.tick(12400);failed.clean();
  const skipped=await setup({ready:false});skipped.nodes['.sc-skip'].emit('click');skipped.hidden(true);skipped.tick(20000);assert.notEqual(skipped.splash.removed,true);skipped.hidden(false);skipped.tick(12400);skipped.clean();
});

test('backgrounding during skip fade preserves opacity until the tab returns',async()=>{
  const s=await setup();s.tick(1000);s.nodes['.sc-skip'].emit('click');s.tick(100);
  const opacity=s.splash.style.opacity;s.hidden(true);s.tick(20000);
  assert.equal(s.splash.style.opacity,opacity);assert.notEqual(s.splash.removed,true);
  s.hidden(false);s.tick(200);assert.notEqual(s.splash.removed,true);s.tick(100);s.clean();
});

test('central waves widen and rise from fixed feet, then fall back without sliding offscreen',async()=>{
  const s=await setup();s.tick(5500);
  assert.equal(Number(s.nodes['.sc-wave-left'].style.opacity),0);
  const samples=[];
  for(let i=0;i<175;i++) {
    s.tick(20);
    const values=s.nodes['.sc-wave-left'].style.transform.match(/-?\d+\.?\d*/g).map(Number);
    // translate3d contributes its own digit before x, y, z, skew and scale.
    samples.push({x:values[1],y:values[2],scaleX:values[5],scaleY:values[6]});
    assert.ok(values.every(Number.isFinite));
  }
  for(let i=1;i<samples.length;i++) {
    assert.ok(Math.abs(samples[i].x-samples[i-1].x)<2.1);
    assert.ok(Math.abs(samples[i].y-samples[i-1].y)<1.1);
  }
  assert.ok(samples.every(p=>p.y===0 && Math.abs(p.x)<=38));
  assert.ok(samples.some((p,i)=>i>0 && p.scaleX>samples[i-1].scaleX && p.scaleY>samples[i-1].scaleY));
  const peak=Math.max(...samples.map(p=>p.scaleY));
  assert.ok(peak>.95);assert.ok(samples.at(-1).scaleY<.15);
  for(let i=1;i<samples.length;i++) assert.ok(Math.abs(samples[i].scaleY-samples[i-1].scaleY)<.03);
  assert.notEqual(s.nodes['.sc-wave-left'].style.transform,s.nodes['.sc-wave-right'].style.transform);
  s.tick(300);s.clean();
  const reduced=await setup({reduced:true});reduced.tick(200);assert.equal(Number(reduced.nodes['.sc-wave-left'].style.opacity),0);reduced.tick(500);reduced.clean();
});

test('wave textures animate, pause in the background, and retain image fallback without Canvas',async()=>{
  const s=await setup({drawing:true});s.tick(7300);
  assert.match(s.nodes['.sc-wave-left'].style.transform,/,1\.00000\)$/);
  assert.ok(s.reflections()>0);
  for(const surface of s.groups['.sc-wave-water']) assert.equal(surface.style.visibility,'visible');
  for(const image of s.groups['.sc-wave img']) assert.equal(image.style.visibility,'hidden');
  const painted=s.draws();s.hidden(true);s.tick(20000);assert.equal(s.draws(),painted);
  s.hidden(false);s.tick(100);assert.ok(s.draws()>painted);s.tick(2000);s.clean();
  const fallback=await setup({drawing:true,query:'?splashTest=canvasOff'});fallback.tick(7300);
  for(const image of fallback.groups['.sc-wave img']) assert.notEqual(image.style.visibility,'hidden');
  for(const surface of fallback.groups['.sc-wave-water']) assert.notEqual(surface.style.visibility,'visible');
  fallback.tick(2000);fallback.clean();
});

