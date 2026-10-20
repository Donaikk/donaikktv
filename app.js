/* ============ DONAIKK TV · app.js ============ */
const PAGE=24;

/* Fontes de canais e eventos. Podem ser trocadas em sources.json, sem mexer aqui.
   ATENÇÃO: verificar a licença do conteúdo antes de publicar. */
const CFG={
  api:'https://api.reidoscanais.si',
  proxy:'https://api.allorigins.win/raw?url=',
  endpoints:{channels:'/channels',sports:'/sports',search:'/search?q='}
};

/* ============ UTILIDADES ============ */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=u=>/^https?:\/\//i.test(u||'')?u:'';
const bg=u=>safeUrl(u)?`background-image:url('${esc(safeUrl(u))}')`:'';
const ph=(src,cls='ph')=>{
  const u=safeUrl(src);
  return u?`<img class="${cls}" src="${esc(u)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">`:'';
};
const arr=x=>Array.isArray(x)?x:[];
const nowS=()=>Date.now()/1000;
const fmtDate=ts=>ts?new Date(ts*1000).toLocaleString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
const fmtHour=ts=>ts?new Date(ts*1000).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'';
const pct=(a,b)=>Math.min(100,Math.max(0,(nowS()-a)/(b-a)*100));
const cdText=ts=>{
  const m=Math.round((ts-nowS())/60);
  if(m<=0)return 'Começando agora';
  if(m<60)return `Começa em ${m} min`;
  const h=Math.floor(m/60);
  return h<24?`Começa em ${h}h${String(m%60).padStart(2,'0')}`:fmtDate(ts);
};
const store_=(k,v)=>{try{v===undefined?localStorage.removeItem(k):localStorage.setItem(k,v)}catch{}};
const load_=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
const EV=e=>({type:'event',data:e});
const CH=c=>({type:'channel',data:c});
const itemKey=it=>(it.type==='event'?'e:':'c:')+it.data.id;
const itemTitle=it=>it.data.title||it.data.name||'';
const setStatus=t=>{$('#upd').textContent=t};

/* fetch com limite de tempo: sem isso, uma API que não responde deixa a tela carregando para sempre */
async function fetchJson(url,ms=8000,opts={}){
  const c=new AbortController();
  const id=setTimeout(()=>c.abort(),ms);
  try{
    const r=await fetch(url,{...opts,signal:c.signal});
    if(!r.ok)throw new Error('http '+r.status);
    return await r.json();
  }finally{clearTimeout(id)}
}
/* direto; se o navegador bloquear (CORS) ou falhar, usa o proxy */
async function get(ep,param=''){
  const url=CFG.api+CFG.endpoints[ep]+param;
  try{return await fetchJson(url)}
  catch{return await fetchJson(CFG.proxy+encodeURIComponent(url))}
}
async function loadSources(){
  try{
    const s=await fetchJson('sources.json',3000,{cache:'no-store'});
    if(s.api)CFG.api=s.api;
    if(s.proxy)CFG.proxy=s.proxy;
    if(s.endpoints)CFG.endpoints={...CFG.endpoints,...s.endpoints};
  }catch{}
}

/* ============ BANCO DE DADOS (db.json + navegador) ============
   O db.json é a base. O navegador não grava arquivos, então as mudanças
   ficam no navegador. "Baixar db.json" gera a versão nova para substituir
   o arquivo no site. Vale a versão mais recente (updatedAt). */
const DB={
  data:{name:'Donaikk TV',version:1,updatedAt:'',users:{},favorites:{}},
  async init(){
    let seed=null;
    try{seed=await fetchJson('db.json',4000,{cache:'no-store'})}catch{}
    let local=load_('tp_db',null);
    const oldU=load_('tp_users',null);
    let migrated=false;
    if(!local&&oldU){
      local={updatedAt:new Date().toISOString(),users:oldU,favorites:{}};
      for(const u in oldU){const f=load_('tp_fav_'+u,null);if(f)local.favorites[u]=f}
      migrated=true;
    }
    const t=o=>Date.parse(o?.updatedAt||0)||0;
    const base=(local&&(!seed||t(local)>=t(seed)))?local:(seed||local||{});
    this.data={name:'Donaikk TV',version:1,updatedAt:base.updatedAt||'',users:base.users||{},favorites:base.favorites||{}};
    if(migrated){
      for(const u in oldU)store_('tp_fav_'+u);
      store_('tp_users');
      this.save();
    }
  },
  save(){
    this.data.updatedAt=new Date().toISOString();
    store_('tp_db',JSON.stringify(this.data));
  },
  exportFile(){
    const blob=new Blob([JSON.stringify(this.data,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download='db.json';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  }
};

/* ============ AUTENTICAÇÃO (PBKDF2) ============ */
const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function derive(pw,salt){
  const k=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveBits']);
  return b64(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:150000,hash:'SHA-256'},k,256));
}

/* ============ ESTADO ============ */
let me=null,mode='in',started=false,favs=new Set();
let store={channels:[],events:[]},lastSig='';
const items=new Map();
const rowData=new Map();
let timers=[];
let cur={kind:'home'};           // home | grid | search
let sq=0,st=null;
let heroList=[],heroIdx=0,heroSig='',heroT=null,heroPaused=false;
let curEmbeds=[],curIdx=0,playlist=[],playPos=-1,lastFocus=null;
const au=$('#au'),pw=$('#ap'),pwb=$('#pwb'),menuEl=$('#menu');

/* ============ MASCOTE (só olha, sem frases) ============ */
const M=$('#mascot');
let mState='idle',revealed=false,peekT=null;
const GAZE={idle:[0,0],user:[-4,3],cover:[0,0],peek:[0,4],sad:[0,2],happy:[0,0]};
function mood(s){
  clearTimeout(peekT);
  delete M.dataset.p;
  mState=s;M.dataset.s=s;
  const g=GAZE[s];
  if(g){M.style.setProperty('--gx',g[0]+'px');M.style.setProperty('--gy',g[1]+'px')}
  if(s==='cover')glance();
}
/* enquanto a senha está escondida, ele espia de vez em quando */
function glance(){
  clearTimeout(peekT);
  if(mState!=='cover')return;
  peekT=setTimeout(()=>{
    if(mState!=='cover')return;
    M.dataset.p='1';
    peekT=setTimeout(()=>{delete M.dataset.p;glance()},700);
  },2600+Math.random()*2200);
}
function syncMood(){
  if(mState==='sad'||mState==='happy')return;
  const f=document.activeElement;
  if(f===pw||(revealed&&pw.value&&f!==au))mood(revealed?'peek':'cover');
  else if(f===au)mood('user');
  else mood('idle');
}
au.addEventListener('focus',syncMood);
au.addEventListener('blur',()=>setTimeout(syncMood,0));
pw.addEventListener('focus',syncMood);
pw.addEventListener('blur',()=>setTimeout(syncMood,0));
pwb.onmousedown=e=>e.preventDefault();   // mantém o foco no campo de senha
pwb.onclick=()=>{
  revealed=!revealed;
  pw.type=revealed?'text':'password';
  pwb.textContent=revealed?'🙈':'👁';
  pwb.setAttribute('aria-label',revealed?'Ocultar senha':'Mostrar senha');
  syncMood();
};
addEventListener('pointermove',e=>{
  if(mState!=='idle'||$('#auth').hidden)return;
  const r=M.getBoundingClientRect();
  const dx=(e.clientX-(r.left+r.width/2))/r.width,dy=(e.clientY-(r.top+r.height/2))/r.height;
  M.style.setProperty('--gx',(Math.max(-1,Math.min(1,dx*2))*5).toFixed(1)+'px');
  M.style.setProperty('--gy',(Math.max(-1,Math.min(1,dy*2))*3).toFixed(1)+'px');
},{passive:true});

/* ============ LOGIN / CADASTRO ============ */
function setMode(m){
  mode=m;
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));
  $('#lname').hidden=m!=='up';
  $('#asub').textContent=m==='in'?'Entrar':'Criar conta';
  $('#aerr').textContent='';
}
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>setMode(b.dataset.m));

function fail(msg){
  $('#aerr').textContent=msg;
  mood('sad');
  setTimeout(()=>{mState=null;syncMood()},1800);
}

$('#af').onsubmit=async e=>{
  e.preventDefault();
  const u=au.value.trim().toLowerCase(),p=pw.value,name=$('#an').value.trim();
  $('#aerr').textContent='';
  if(!/^[a-z0-9_.-]{3,24}$/.test(u))return fail('Usuário: 3 a 24 letras, números, _ . ou -');
  if(p.length<6)return fail('A senha precisa ter pelo menos 6 caracteres');
  if(!crypto.subtle)return fail('Abra o site por https ou localhost para usar o login');
  const btn=$('#asub');btn.disabled=true;
  try{
    if(mode==='up'){
      if(DB.data.users[u])return fail('Esse usuário já existe');
      const salt=crypto.getRandomValues(new Uint8Array(16));
      DB.data.users[u]={name:name||u,salt:b64(salt),hash:await derive(p,salt),created:new Date().toISOString()};
      DB.save();
    }else{
      const rec=DB.data.users[u];
      if(!rec||(await derive(p,unb64(rec.salt)))!==rec.hash)return fail('Usuário ou senha incorretos');
    }
    store_('tp_session',u);
    mood('happy');
    await new Promise(r=>setTimeout(r,800));
    startApp(u);
  }catch{fail('Algo deu errado. Tente de novo.')}
  finally{btn.disabled=false}
};

const favsOf=u=>new Set(DB.data.favorites[u]||[]);
function saveFavs(){if(!me)return;DB.data.favorites[me]=[...favs];DB.save()}

function startApp(u){
  me=u;
  const rec=DB.data.users[u];
  const label=rec?.name||u;
  const ini=label[0].toUpperCase();
  $('#av').textContent=ini;$('#av2').textContent=ini;$('#mname').textContent=label;
  $('#me').hidden=false;
  $('#bottomnav').hidden=false;
  $('#auth').hidden=true;
  mood('idle');
  favs=favsOf(u);
  if(!started){
    started=true;
    cur={kind:'home'};
    $('#rows').innerHTML=skeleton();
    loadSources().then(()=>loadData(true));
    timers.push(setInterval(()=>{if(!$('#modal').classList.contains('on'))loadData(false)},60000));
    timers.push(setInterval(tick,20000));
  }else showHome();
}
function logout(){
  store_('tp_session');
  me=null;favs=new Set();started=false;
  lastSig='';heroSig='';heroList=[];store={channels:[],events:[]};
  timers.forEach(clearInterval);timers=[];clearInterval(heroT);
  closeModal();closeMenu();closeSearch();
  cur={kind:'home'};sq++;
  au.value='';pw.value='';$('#q').value='';
  revealed=false;pw.type='password';pwb.textContent='👁';
  $('#me').hidden=true;
  $('#bottomnav').hidden=true;
  $('#rows').innerHTML='';$('#hero').innerHTML='';$('#chips').innerHTML='';setStatus('');
  $('#auth').hidden=false;setMode('in');mood('idle');
}

/* ============ FAVORITOS ============ */
function toggleFav(key){favs.has(key)?favs.delete(key):favs.add(key);saveFavs();refreshAfterFav()}
function refreshAfterFav(){
  if(cur.kind==='home')renderHome(false);
  else if(cur.kind==='grid'&&cur.v==='favs')applyGrid();
  refreshFavButtons();
}
function refreshFavButtons(){
  document.querySelectorAll('[data-fav]').forEach(b=>{
    const on=favs.has(b.dataset.fav);
    b.classList.toggle('on',on);
    b.textContent=on?'✓ Na minha lista':'＋ Minha lista';
  });
}
function favList(){
  const out=[];
  for(const k of favs){
    if(k[0]==='e'){const x=store.events.find(y=>'e:'+y.id===k);if(x)out.push(EV(x))}
    else if(k[0]==='c'){const x=store.channels.find(y=>'c:'+y.id===k);if(x)out.push(CH(x))}
  }
  return out;
}

/* ============ CONTINUAR ASSISTINDO (guardado por usuário no navegador) ============ */
const recentKey=()=>'tp_recent_'+me;
function rememberWatched(it){
  if(!me)return;
  const key=itemKey(it);
  const list=load_(recentKey(),[]).filter(x=>x.key!==key);
  list.unshift({key,ts:Date.now()});
  store_(recentKey(),JSON.stringify(list.slice(0,12)));
}
function recentItems(){
  if(!me)return [];
  return load_(recentKey(),[]).map(x=>{
    const p=x.key[0],id=x.key.slice(2);
    if(p==='e'){const e=store.events.find(y=>String(y.id)===id);return e?EV(e):null}
    const c=store.channels.find(y=>String(y.id)===id);
    return c?CH(c):null;
  }).filter(Boolean);
}

/* ============ MENU DA CONTA ============ */
function closeMenu(){menuEl.hidden=true}
function toggleMenu(){
  const open=menuEl.hidden;
  closeSearch();
  menuEl.hidden=!open;
  $('#av').setAttribute('aria-expanded',String(open));
}
$('#av').onclick=toggleMenu;
$('#burger').onclick=toggleMenu;
menuEl.addEventListener('click',e=>{
  const a=e.target.closest('[data-act]');
  if(!a)return;
  closeMenu();
  if(a.dataset.act==='export')DB.exportFile();
  if(a.dataset.act==='logout')logout();
});

/* ============ NAVEGAÇÃO ============ */
document.addEventListener('click',e=>{
  const n=e.target.closest('[data-nav]');
  if(n){go(n.dataset.nav);return}
  if(!menuEl.hidden&&!e.target.closest('#menu,#av,#burger'))closeMenu();
  if($('#sb').classList.contains('open')&&!e.target.closest('#sb')&&!$('#q').value.trim())closeSearch();
});
function go(v){
  closeMenu();closeSearch();
  $('#q').value='';
  if(v==='home')return showHome();
  const views={
    live:['Ao vivo agora',()=>store.events.filter(x=>x.status==='live').map(EV),'Ao vivo'],
    next:['Próximos eventos',()=>nextEvents().map(EV),null],
    channels:['Canais',()=>store.channels.map(CH),null],
    favs:['Minha lista',()=>favList(),null]
  };
  const d=views[v];
  if(d)showGrid(d[0],d[1],v,d[2]);
}
function updateNav(){
  const v=cur.kind==='home'?'home':(cur.v||null);
  document.querySelectorAll('.navlink,.bottomnav button').forEach(b=>b.classList.toggle('on',b.dataset.nav===v));
}

/* ============ BUSCA ============ */
$('#sbtn').onclick=()=>{
  if($('#sb').classList.contains('open')&&!$('#q').value.trim()){closeSearch();return}
  closeMenu();
  $('#sb').classList.add('open');
  $('#q').focus();
};
function closeSearch(){$('#sb').classList.remove('open')}
$('#sclose').onclick=()=>{
  $('#q').value='';closeSearch();
  if(cur.kind==='search')showHome();
};
$('#q').oninput=e=>{
  clearTimeout(st);
  const q=e.target.value.trim();
  if(!q){if(cur.kind==='search')showHome();return}
  st=setTimeout(()=>runSearch(q),350);
};
$('#q').onkeydown=e=>{
  if(e.key==='Enter'){const q=e.target.value.trim();if(q){clearTimeout(st);runSearch(q)}}
};
async function runSearch(q){
  const my=++sq;
  cur={kind:'search',title:'',shown:PAGE};
  setMain(false);
  renderChips();updateNav();
  $('#rows').innerHTML='<p class="empty">Buscando…</p>';
  try{
    const r=await get('search',encodeURIComponent(q));
    if(my!==sq)return;
    const list=[...arr(r.data?.events).map(EV),...arr(r.data?.channels).map(CH)];
    renderGridView(`Resultados para “${q}”`,list);
  }catch{
    if(my!==sq)return;
    $('#rows').innerHTML='<p class="err">Não foi possível buscar agora. Tente novamente.</p>';
  }
}

/* ============ VISÕES: início, grade e busca ============ */
const nextEvents=()=>arr(store.events).filter(x=>!['live','finished','ended'].includes(x.status)).sort((a,b)=>(a.start_timestamp||0)-(b.start_timestamp||0));
function setMain(home){
  $('#main').classList.toggle('home',home);
  $('#hero').hidden=!home;
  if(!home)clearInterval(heroT);
}
function scrollTop(){window.scrollTo({top:0,behavior:'smooth'})}

function showHome(){
  sq++;
  cur={kind:'home'};
  setMain(true);
  heroSig='';heroList=[];
  renderChips();
  renderHome(true);
  renderHero();
  updateNav();
  scrollTop();
}
function showGrid(title,build,v,chip){
  sq++;
  cur={kind:'grid',title,build,v:v||null,chip:chip||null,shown:PAGE};
  setMain(false);
  renderChips();
  applyGrid();
  updateNav();
  scrollTop();
}
function applyGrid(){renderGridView(cur.title,cur.build())}

const SORTS=[['padrao','Padrão'],['nome','Nome (A-Z)'],['horario','Horário'],['popular','Destaques primeiro']];
function sortList(list,mode){
  const name=it=>itemTitle(it.data).toLowerCase();
  const t=it=>it.data.start_timestamp||Number.MAX_SAFE_INTEGER;
  const a=[...list];
  if(mode==='nome')return a.sort((x,y)=>name(x).localeCompare(name(y),'pt-BR'));
  if(mode==='horario')return a.sort((x,y)=>t(x)-t(y));
  if(mode==='popular')return a.sort((x,y)=>(y.data.popular?1:0)-(x.data.popular?1:0));
  return a;
}
function renderGridView(title,list){
  cur.title=title;cur.list=list;
  items.clear();
  const sorted=sortList(list,cur.sort||'padrao');
  cur.sorted=sorted;
  const shown=sorted.slice(0,cur.shown||PAGE);
  const more=sorted.length>shown.length?`<button class="more" id="more">Carregar mais · ${sorted.length-shown.length} restantes</button>`:'';
  const sortBox=list.length>1?`<label class="sortlab">Ordenar
      <select class="sort" id="sort">${SORTS.map(([v,t])=>`<option value="${v}"${v===(cur.sort||'padrao')?' selected':''}>${t}</option>`).join('')}</select>
    </label>`:'';
  $('#rows').innerHTML=`<div class="grid-head">
      <div><h2>${esc(title)}</h2><small>${list.length} ${list.length===1?'item':'itens'}</small></div>
      <div class="gh-actions">${sortBox}<button class="back" data-nav="home">‹ Início</button></div>
    </div>`+
    (list.length?`<div class="grid">${shown.map(cardFor).join('')}</div>${more}`:'<p class="empty">Nada por aqui por enquanto.</p>');
  refreshFavButtons();
}
function renderChips(){
  const all=[...arr(store.events),...arr(store.channels)];
  const cats=[...new Set(all.map(x=>x.category).filter(Boolean))];
  const liveN=arr(store.events).filter(x=>x.status==='live').length;
  const countOf=c=>all.filter(x=>x.category===c).length;
  const active=cur.kind==='home'?'Tudo':(cur.kind==='grid'?cur.chip:null);
  const chips=[['Tudo',null],['Ao vivo',liveN],...cats.map(c=>[c,countOf(c)])];
  $('#chips').innerHTML=chips.map(([c,n])=>`<button class="${c===active?'on':''}" data-f="${esc(c)}">${esc(c)}${n!=null?`<small>${n}</small>`:''}</button>`).join('');
}
$('#chips').onclick=e=>{
  const b=e.target.closest('button');if(!b)return;
  const f=b.dataset.f;
  $('#q').value='';closeSearch();
  if(f==='Tudo')return showHome();
  if(f==='Ao vivo')return showGrid('Ao vivo',()=>arr(store.events).filter(x=>x.status==='live').map(EV),'live','Ao vivo');
  showGrid(f,()=>[
    ...arr(store.events).filter(x=>x.category===f).map(EV),
    ...arr(store.channels).filter(x=>x.category===f).map(CH)
  ],null,f);
};
$('#rows').addEventListener('change',e=>{
  if(e.target.id==='sort'){cur.sort=e.target.value;renderGridView(cur.title,cur.list)}
});

/* ============ CARDS E LINHAS ============ */
function eventCard(e){
  const key='e:'+e.id;items.set(key,{type:'event',data:e});
  const live=e.status==='live',h=e.teams?.home,a=e.teams?.away;
  const media=safeUrl(e.poster)?ph(e.poster):(h&&a?`<div class="vs">${ph(h.logo,'vs-logo')}<i>x</i>${ph(a.logo,'vs-logo')}</div>`:'');
  const sub=live?`<span>${esc(e.competition||e.category||'')}</span>`:`<span class="cd" data-ts="${+e.start_timestamp||0}">${esc(cdText(+e.start_timestamp||0))}</span>`;
  return `<button class="card" data-k="${esc(key)}">${media}${live?'<span class="live">AO VIVO</span>':''}<div class="info"><b>${esc(e.title)}</b>${sub}</div></button>`;
}
function channelCard(c){
  const key='c:'+c.id;items.set(key,{type:'channel',data:c});
  const cur_=c.epg?.current;
  const bar=cur_?.start_time&&cur_?.end_time?`<div class="bar"><i style="width:${pct(cur_.start_time,cur_.end_time)}%"></i></div>`:'';
  return `<button class="card logo-c" data-k="${esc(key)}">${ph(c.logo_url)}<div class="info"><b>${esc(c.name)}</b><span>${esc(cur_?.title?'Agora: '+cur_.title:c.category||'')}</span></div>${bar}</button>`;
}
const cardFor=it=>it.type==='event'?eventCard(it.data):channelCard(it.data);
function row(title,list){
  if(!list.length)return '';
  rowData.set(title,{title,list});
  return `<section class="row" data-title="${esc(title)}">
    <div class="row-h"><h2>${esc(title)}</h2><button class="seeall" data-all="${esc(title)}">Ver tudo ›</button></div>
    <div class="wrap"><button class="arr l" data-d="-1" aria-label="Voltar">‹</button><div class="track">${list.map(cardFor).join('')}</div><button class="arr r" data-d="1" aria-label="Avançar">›</button></div>
  </section>`;
}
const skeleton=()=>[1,2].map(()=>`<section class="row in"><div class="row-h"><h2>Carregando</h2></div><div class="track">${'<div class="card sk"></div>'.repeat(7)}</div></section>`).join('');

const io='IntersectionObserver'in window?new IntersectionObserver(es=>es.forEach(x=>{if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target)}}),{threshold:.08}):null;
function renderHome(animate){
  const sc=[...document.querySelectorAll('.track')].map(t=>t.scrollLeft);
  items.clear();rowData.clear();
  const ev=arr(store.events),ch=arr(store.channels);
  const html=[
    row('Continuar assistindo',recentItems()),
    row('Minha lista',favList()),
    row('Ao vivo agora',ev.filter(x=>x.status==='live').map(EV)),
    row('Próximos eventos',nextEvents().map(EV)),
    row('Em destaque',ev.filter(x=>x.popular).map(EV)),
    row('Canais',ch.map(CH))
  ].join('');
  $('#rows').innerHTML=html||'<p class="empty">Nenhum conteúdo disponível no momento.</p>';
  if(!animate)document.querySelectorAll('.track').forEach((t,i)=>t.scrollLeft=sc[i]||0);
  document.querySelectorAll('.row').forEach(r=>{
    if(!io||!animate){r.classList.add('in');return}
    r.classList.remove('in');io.observe(r);
  });
  refreshFavButtons();
}

/* ============ DESTAQUE (só na tela inicial) ============ */
function pickHero(){
  let l=arr(store.events).filter(e=>e.status==='live');
  if(!l.length)l=arr(store.events).filter(e=>e.popular);
  if(!l.length)l=arr(store.events);
  const isEv=l.length>0;
  return (isEv?l:arr(store.channels)).slice(0,5).map(d=>({type:isEv?'event':'channel',data:d}));
}
function startHeroTimer(){
  clearInterval(heroT);
  if(heroList.length>1)heroT=setInterval(()=>{if(!heroPaused)setHero((heroIdx+1)%heroList.length)},9000);
}
function renderHero(){
  const list=pickHero();
  const sig=list.map(x=>x.type+x.data.id).join();
  if(sig===heroSig&&heroList.length)return;
  heroSig=sig;heroList=list;
  setHero(0);
  startHeroTimer();
}
function setHero(i){
  heroIdx=i;
  const it=heroList[i],hero=$('#hero');
  if(!it){
    hero.innerHTML='<div class="hero-main"><div class="hc"><h1>Donaikk TV</h1><p>Sem programação no momento. Volte em instantes.</p></div></div>';
    return;
  }
  const d=it.data,ev=it.type==='event',key=itemKey(it),title=itemTitle(it);
  const img=safeUrl(ev?d.poster:(d.epg?.current?.image||d.logo_url));
  const isLive=ev?d.status==='live':true;
  const cur_=d.epg?.current;
  const desc=ev?(d.description||d.competition||''):(cur_?cur_.title+(cur_.description?' — '+cur_.description:''):d.description||'');
  const poster=img?`<div class="poster"><img src="${esc(img)}" alt="${esc(title)}"></div>`:`<div class="poster none"></div>`;
  hero.innerHTML=`<div class="hero-bg" style="${bg(img)}"></div>
  <div class="hero-main"><div class="hc">
    ${isLive?'<span class="badge live">AO VIVO</span>':`<span class="badge soft">${esc(fmtDate(d.start_timestamp))}</span>`}
    <h1>${esc(title)}</h1>
    <p>${esc(desc).slice(0,220)}</p>
    <div class="btns">
      <button class="btn w" id="hp">▶ Assistir</button>
      <button class="btn g" data-fav="${esc(key)}"></button>
    </div>
  </div>${poster}</div>
  ${heroList.length>1?`<div class="dots">${heroList.map((_,j)=>`<button data-j="${j}" class="${j===i?'on':''}" aria-label="Destaque ${j+1}"></button>`).join('')}</div>`:''}`;
  $('#hp').onclick=()=>openModal(it,heroList);
  refreshFavButtons();
}
$('#hero').addEventListener('mouseenter',()=>heroPaused=true);
$('#hero').addEventListener('mouseleave',()=>heroPaused=false);
$('#hero').onclick=e=>{
  const b=e.target.closest('.dots button');
  if(b){setHero(+b.dataset.j);return}
  const f=e.target.closest('[data-fav]');if(f)toggleFav(f.dataset.fav);
};

/* ============ CLIQUES NA LISTA ============ */
$('#rows').onclick=e=>{
  if(e.target.closest('#more')){cur.shown=(cur.shown||PAGE)+PAGE;renderGridView(cur.title,cur.list);return}
  if(e.target.closest('[data-retry]')){loadData(true);return}
  const all=e.target.closest('.seeall');
  if(all){const d=rowData.get(all.dataset.all);if(d)showGrid(d.title,()=>d.list,null,null);return}
  const a=e.target.closest('.arr');
  if(a){const t=a.parentElement.querySelector('.track');t.scrollBy({left:a.dataset.d*t.clientWidth*.8,behavior:'smooth'});return}
  const b=e.target.closest('.card');
  if(b){
    const it=items.get(b.dataset.k);if(!it)return;
    const rowEl=b.closest('.row');
    const list=rowEl?(rowData.get(rowEl.dataset.title)?.list||[it]):(cur.sorted||[it]);
    openModal(it,list);
  }
};

/* ============ PLAYER ============ */
function openModal(it,list){
  if(!it)return;
  closeMenu();closeSearch();
  lastFocus=document.activeElement;
  playlist=list&&list.length?list:[it];
  playPos=playlist.findIndex(x=>x.type===it.type&&x.data.id===it.data.id);
  if(playPos<0){playlist=[it];playPos=0}
  showItem(playlist[playPos]);
  $('#modal').classList.add('on');
  document.body.style.overflow='hidden';
  $('#close').focus();
}
function showItem(it){
  const d=it.data,ev=it.type==='event',key=itemKey(it),title=itemTitle(it);
  const sub=ev?[d.competition,d.status==='live'?'Ao vivo':fmtDate(d.start_timestamp)].filter(Boolean).join(' • '):(d.category||'');
  let epg='';
  if(!ev){
    const c=d.epg?.current,n=d.epg?.next;
    if(c)epg+=`<div>Agora: <b>${esc(c.title)}</b> ${c.start_time?`(${fmtHour(c.start_time)}–${fmtHour(c.end_time)})`:''}</div>${c.start_time&&c.end_time?`<div class="bar" style="position:static"><i style="width:${pct(c.start_time,c.end_time)}%"></i></div>`:''}`;
    if(n)epg+=`<div>A seguir: <b>${esc(n.title)}</b> ${n.start_time?`(${fmtHour(n.start_time)})`:''}</div>`;
  }
  const hint=playlist.length>1?`<p class="note">← → trocam de ${ev?'evento':'canal'} (${playPos+1} de ${playlist.length}) · F tela cheia · Esc fecha</p>`:'';
  $('#det').innerHTML=`<h3>${esc(title)}</h3><div class="sub">${esc(sub)}</div>
    ${d.description?`<p>${esc(d.description)}</p>`:''}
    <div class="srv" id="srv"></div>
    <div class="actions">
      <button class="pill" id="fs">⛶ Tela cheia</button>
      <button class="pill" id="rl">↻ Recarregar</button>
      <button class="pill" data-fav="${esc(key)}"></button>
      <a class="pill" id="op" target="_blank" rel="noopener noreferrer">↗ Nova aba</a>
    </div>
    ${epg?`<div class="epg">${epg}</div>`:''}
    ${hint}
    <p class="note">Se um servidor não abrir ou travar, troque por outro da lista.</p>`;
  $('#fs').onclick=fullscreen;
  $('#rl').onclick=()=>play(curEmbeds,curIdx);
  curEmbeds=d.embeds||[];
  refreshFavButtons();
  renderServers(curEmbeds);
  rememberWatched(it);
}
function renderServers(embeds){
  if(!embeds.length){
    $('#player').innerHTML='<div class="nosrv">Nenhum servidor disponível para este conteúdo agora.</div>';
    $('#srv').innerHTML='';
    $('#op').hidden=true;
  }else{
    $('#srv').innerHTML=embeds.map((m,i)=>`<button data-i="${i}">${esc(m.provider||'Servidor '+(i+1))}${m.quality?' • '+esc(m.quality):''}</button>`).join('');
    $('#srv').onclick=e=>{const b=e.target.closest('button');if(b)play(curEmbeds,+b.dataset.i)};
    play(embeds,0);
  }
}
function play(embeds,i){
  curIdx=i;
  const u=safeUrl(embeds[i]?.embed_url||embeds[i]?.url);
  const player=$('#player');
  player.innerHTML='';
  if(u){
    const f=document.createElement('iframe');
    f.src=u;
    f.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen=true;
    f.referrerPolicy='no-referrer';
    f.title='Player';
    player.appendChild(f);
    $('#op').href=u;$('#op').hidden=false;
  }else{
    player.innerHTML='<div class="nosrv">Link indisponível.</div>';
    $('#op').hidden=true;
  }
  [...$('#srv').children].forEach((b,j)=>b.classList.toggle('on',j===i));
}
function fullscreen(){
  const p=$('#player');
  (p.requestFullscreen||p.webkitRequestFullscreen||(()=>{})).call(p);
}
function stepPlayer(delta){
  if(!$('#modal').classList.contains('on')||playlist.length<2)return;
  playPos=(playPos+delta+playlist.length)%playlist.length;
  showItem(playlist[playPos]);
}
function closeModal(){
  if(!$('#modal').classList.contains('on'))return;
  $('#modal').classList.remove('on');
  $('#player').innerHTML='';
  document.body.style.overflow='';
  playlist=[];playPos=-1;
  if(lastFocus&&document.contains(lastFocus))lastFocus.focus();
}
$('#close').onclick=closeModal;
$('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};

/* foco preso dentro do player aberto (Tab / Shift+Tab) */
function trapFocus(e){
  const f=[...$('#modal').querySelectorAll('button,a[href],select')].filter(el=>el.offsetParent!==null);
  if(!f.length)return;
  const first=f[0],last=f[f.length-1];
  if(e.shiftKey&&(document.activeElement===first||!$('#modal').contains(document.activeElement))){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
}

/* atalhos: Esc fecha tudo, setas trocam de canal/evento, F tela cheia */
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeModal();closeMenu();closeSearch();return}
  if(!$('#modal').classList.contains('on'))return;
  if(e.key==='Tab'){trapFocus(e);return}
  if(e.target.matches&&e.target.matches('input,select,textarea'))return;
  if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();stepPlayer(1)}
  else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();stepPlayer(-1)}
  else if(e.key==='f'||e.key==='F'){fullscreen()}
});

/* ============ DADOS E ATUALIZAÇÃO ============ */
function paint(first){
  renderChips();
  if(cur.kind==='home'){renderHome(first);renderHero()}
  else if(cur.kind==='grid')applyGrid();
  // na busca não recarrega sozinho, para não atrapalhar o que o usuário está vendo
}
async function loadData(first){
  if(!me||(cur.kind==='search'&&!first))return;
  const [ch,sp]=await Promise.allSettled([get('channels'),get('sports')]);
  const okCh=ch.status==='fulfilled',okSp=sp.status==='fulfilled';
  if(!okCh&&!okSp){
    if(first){
      const c=load_('tp_cache',null);
      if(c){store=c;lastSig=JSON.stringify(c);paint(true);setStatus('Sem conexão com a API, mostrando dados salvos');return}
      $('#rows').innerHTML='<div class="err" style="margin-top:80px">Não foi possível carregar a programação.<br><button class="retry" data-retry>Tentar de novo</button></div>';
    }else setStatus('Falha ao atualizar, nova tentativa em 1 minuto');
    return;
  }
  const data={channels:arr(ch.value?.data),events:arr(sp.value?.data)};
  const sig=JSON.stringify(data);
  const full=okCh&&okSp;
  if(full)store_('tp_cache',sig);
  setStatus((full?'Atualizado às ':'Atualizado parcialmente às ')+fmtHour(nowS()));
  if(sig===lastSig)return;
  lastSig=sig;store=data;paint(first);
}
$('#refresh').onclick=()=>{setStatus('Atualizando…');loadData(false)};
function tick(){document.querySelectorAll('.cd').forEach(el=>{el.textContent=cdText(+el.dataset.ts)})}
addEventListener('scroll',()=>$('#hd').classList.toggle('solid',scrollY>40),{passive:true});

/* ============ INÍCIO ============ */
(async function boot(){
  await DB.init();
  const saved=localStorage.getItem('tp_session');
  if(saved&&DB.data.users[saved])startApp(saved);
  else{$('#auth').hidden=false;setMode('in')}
})();
