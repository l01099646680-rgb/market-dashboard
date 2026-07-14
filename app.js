const $ = id => document.getElementById(id);

/* ---------- 시계 ---------- */
function tickClock(){
  const now = new Date();
  const p = n => String(n).padStart(2,'0');
  $('clock').textContent = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
  const days = ['일','월','화','수','목','금','토'];
  $('date').textContent = `${now.getFullYear()}. ${now.getMonth()+1}. ${now.getDate()} (${days[now.getDay()]})`;
}
setInterval(tickClock,1000); tickClock();

/* ---------- 포맷 ---------- */
function fmtPrice(n){
  if(n>=1000) return n.toLocaleString('en-US',{maximumFractionDigits:0});
  if(n>=1) return n.toLocaleString('en-US',{maximumFractionDigits:2});
  return n.toLocaleString('en-US',{maximumFractionDigits:6});
}
function chgClass(c){ return c>0?'up':(c<0?'down':'flat'); }
function chgStr(c){ const s=c>0?'+':''; return `${s}${c.toFixed(2)}%`; }
function arrow(c){ return c>0?'▲':(c<0?'▼':'·'); }
function escAttr(v){ return String(v??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escHtml(v){ return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

/* ---------- 트레이딩뷰 차트 링크 ---------- */
function tvUrl(sym){ return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(sym)}`; }
function coinTv(symbol){ return `BINANCE:${symbol.toUpperCase()}USDT`; }

/* ---------- 느린/죽은 프록시 빨리 포기 ---------- */
async function fetchT(url, ms=8000){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(), ms);
  try{ return await fetch(url,{signal:ctrl.signal}); }
  finally{ clearTimeout(t); }
}
function readSaved(name){
  try{
    const local=localStorage.getItem(name);
    if(local) return local;
    const hit=document.cookie.split('; ').find(v=>v.startsWith(name+'='));
    return hit?decodeURIComponent(hit.slice(name.length+1)):'';
  }catch(e){ return ''; }
}
function writeSaved(name,value){
  try{
    if(value){
      localStorage.setItem(name,value);
      document.cookie=`${name}=${encodeURIComponent(value)}; max-age=31536000; path=/; SameSite=Lax`;
    }else{
      localStorage.removeItem(name);
      document.cookie=`${name}=; max-age=0; path=/; SameSite=Lax`;
    }
  }catch(e){}
}
async function fetchJsonFast(url, accept=d=>d!=null){
  const candidates=[url,...PROXIES().map(p=>p(url))];
  const jobs=candidates.map(async candidate=>{
    const r=await fetchT(candidate,6500);
    if(!r.ok) throw new Error('HTTP '+r.status);
    const d=await r.json();
    if(!accept(d)) throw new Error('invalid data');
    return d;
  });
  if(typeof Promise.any==='function') return Promise.any(jobs);
  for(const job of jobs){ try{return await job;}catch(e){} }
  throw new Error('all requests failed');
}
async function fetchProxyFast(target,ms=7000){
  const jobs=PROXIES().map(async p=>{
    const r=await fetchT(p(target),ms);
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r;
  });
  if(typeof Promise.any==='function') return Promise.any(jobs);
  for(const job of jobs){ try{return await job;}catch(e){} }
  throw new Error('all proxies failed');
}
/* ---------- 프록시 목록 (내 전용 프록시를 최우선) ---------- */
function getProxyBase(){ return readSaved('proxyBase').replace(/\/+$/,''); }
function PROXIES(){
  const list=[];
  const my=getProxyBase();
  if(my) list.push(u=>`${my}/?url=${encodeURIComponent(u)}`);
  list.push(u=>`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`);
  list.push(u=>`https://corsproxy.io/?url=${encodeURIComponent(u)}`);
  list.push(u=>`https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`);
  return list;
}

/* ---------- 코인 가격 ---------- */
async function loadCrypto(){
  try{
    const ids='bitcoin,ethereum,solana,ripple,binancecoin';
    const url=`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`;
    const d=await fetchJsonFast(url, v=>Array.isArray(v)&&v.length>0);
    const order={bitcoin:0,ethereum:1,solana:2,ripple:3,binancecoin:4};
    d.sort((a,b)=>order[a.id]-order[b.id]);
    _tickerCrypto=d.map(c=>({name:c.symbol.toUpperCase(), price:'$'+fmtPrice(c.current_price), ch:c.price_change_percentage_24h||0}));
    updateTicker();
    $('crypto').innerHTML = d.map(c=>{
      const ch=c.price_change_percentage_24h||0;
      return `<a class="row tv-link" href="${tvUrl(coinTv(c.symbol))}" target="_blank" rel="noopener">
        <div class="name">${c.symbol.toUpperCase()}<small>${c.name}</small></div>
        <div class="val">
          <div class="price">$${fmtPrice(c.current_price)}</div>
          <div class="chg ${chgClass(ch)}">${arrow(ch)} ${chgStr(ch)}</div>
        </div>
      </a>`;
    }).join('');
  }catch(e){ $('crypto').innerHTML='<div class="err">코인 데이터를 불러오지 못했어요. 잠시 후 새로고침.</div>'; }
}

/* ---------- 급등락 ---------- */
async function loadMovers(){
  try{
    const url='https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&price_change_percentage=24h';
    const d=await fetchJsonFast(url, v=>Array.isArray(v)&&v.length>0);
    const valid=d.filter(c=>typeof c.price_change_percentage_24h==='number');
    const sorted=[...valid].sort((a,b)=>b.price_change_percentage_24h-a.price_change_percentage_24h);
    const gain=sorted.slice(0,10), lose=sorted.slice(-10).reverse();
    const render=arr=>arr.map((c,i)=>{
      const ch=c.price_change_percentage_24h;
      return `<a class="row tv-link" href="${tvUrl(coinTv(c.symbol))}" target="_blank" rel="noopener">
        <div class="name"><span class="rank">${i+1}</span>${c.symbol.toUpperCase()}<small>${c.name}</small></div>
        <div class="val">
          <div class="price">$${fmtPrice(c.current_price)}</div>
          <div class="chg ${chgClass(ch)}">${arrow(ch)} ${chgStr(ch)}</div>
        </div>
      </a>`;
    }).join('');
    $('gainers').innerHTML=render(gain);
    $('losers').innerHTML=render(lose);
    const volatile=valid.map(c=>{
      const low=Number(c.low_24h)||0, high=Number(c.high_24h)||0;
      const range=low>0?((high-low)/low)*100:0;
      const turnover=c.market_cap>0?(Number(c.total_volume)||0)/c.market_cap*100:0;
      const move=Math.abs(c.price_change_percentage_24h||0);
      const score=move*.45+range*.35+Math.min(turnover,25)*.2;
      return {...c,range,turnover,score};
    }).filter(c=>c.range>0).sort((a,b)=>b.score-a.score).slice(0,10);
    $('volatility').innerHTML=volatile.map((c,i)=>`<a class="vol-row tv-link" href="${tvUrl(coinTv(c.symbol))}" target="_blank" rel="noopener">
      <span class="vol-rank">${String(i+1).padStart(2,'0')}</span>
      <span class="vol-name">${c.symbol.toUpperCase()}<small>${c.name}</small></span>
      <span class="vol-metric ${chgClass(c.price_change_percentage_24h)}"><small>24H 등락</small>${chgStr(c.price_change_percentage_24h)}</span>
      <span class="vol-metric"><small>장중 범위</small>${c.range.toFixed(1)}%</span>
      <span class="vol-metric"><small>회전율</small>${c.turnover.toFixed(1)}%</span>
      <span class="vol-score">${c.score.toFixed(1)}</span>
    </a>`).join('');
  }catch(e){
    $('gainers').innerHTML='<div class="err">불러오기 실패</div>';
    $('losers').innerHTML='<div class="err">불러오기 실패</div>';
    $('volatility').innerHTML='<div class="err">변동성 데이터를 불러오지 못했어요.</div>';
  }
}

/* ---------- 공포탐욕지수 ---------- */
function fngColor(v){
  if(v<25) return '#ff4d5e';
  if(v<45) return '#ff8c42';
  if(v<55) return '#ffd23f';
  if(v<75) return '#9be15d';
  return '#1fd17a';
}
function fngKo(label){
  const m={'Extreme Fear':'극단적 공포','Fear':'공포','Neutral':'중립','Greed':'탐욕','Extreme Greed':'극단적 탐욕'};
  return m[label]||label;
}
async function loadFng(){
  try{
    const r=await fetch('https://api.alternative.me/fng/'); const d=await r.json();
    const v=parseInt(d.data[0].value), label=d.data[0].value_classification;
    const col=fngColor(v);
    // 반원 게이지: 0~100을 180도에 매핑
    const ang=Math.PI*(1-v/100); // 왼쪽(180도)=0, 오른쪽(0도)=100
    const cx=90,cy=90,rr=72;
    const nx=cx+rr*Math.cos(ang), ny=cy-rr*Math.sin(ang);
    $('fng').innerHTML=`
      <svg viewBox="0 0 180 100">
        <path d="M18 90 A72 72 0 0 1 162 90" fill="none" stroke="#23272f" stroke-width="12" stroke-linecap="round"/>
        <path d="M18 90 A72 72 0 0 1 162 90" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round"
              stroke-dasharray="${Math.PI*72}" stroke-dashoffset="${Math.PI*72*(1-v/100)}"/>
        <circle cx="${nx}" cy="${ny}" r="6" fill="${col}"/>
      </svg>
      <div class="fng-val" style="color:${col}">${v}</div>
      <div class="fng-label" style="color:${col}">${fngKo(label)}</div>`;
  }catch(e){ $('fng').innerHTML='<div class="err">공포탐욕지수 불러오기 실패</div>'; }
}

/* ---------- 상단 티커 ---------- */
let _tickerCrypto=[];
function updateTicker(){
  const el=$('ticker-track'); if(!el) return;
  const items=[];
  _tickerCrypto.forEach(c=>items.push(c));
  // 주요 지표 몇 개 추가
  const pick=[['^IXIC','나스닥'],['^GSPC','S&P'],['^KS11','코스피'],['DX-Y.NYB','달러인덱스'],['GC=F','금'],['^TNX','미10년']];
  pick.forEach(([sym,name])=>{
    const d=_metricCache&&_metricCache[sym];
    if(d) items.push({name, price:(sym==='^TNX'?d.price.toFixed(2)+'%':d.price.toLocaleString('en-US',{maximumFractionDigits:2})), ch:d.ch});
  });
  if(!items.length) return;
  const one=items.map(it=>{
    const cls=it.ch>0?'up':(it.ch<0?'down':'flat');
    const arr=it.ch>0?'▲':(it.ch<0?'▼':'·');
    const chs=(it.ch>0?'+':'')+it.ch.toFixed(2)+'%';
    return `<span class="tk"><span class="tk-name">${it.name}</span><span class="tk-val">${it.price}</span><span class="tk-chg ${cls}">${arr}${chs}</span></span>`;
  }).join('');
  el.innerHTML=one+one; // 이음새 없는 무한 스크롤용 2배
}

/* ---------- 마켓 지표 (Yahoo via proxy + 크립토 계산) ---------- */
const METRICS=[
  // 지수
  {grp:'index', sym:'^IXIC', name:'나스닥', tv:'NASDAQ:IXIC'},
  {grp:'index', sym:'^GSPC', name:'S&P 500', tv:'SP:SPX'},
  {grp:'index', sym:'^KS11', name:'코스피', tv:'KRX:KOSPI'},
  {grp:'index', sym:'^KQ11', name:'코스닥', tv:'KRX:KOSDAQ'},
  {grp:'index', sym:'^VIX',  name:'VIX', note:'변동성', tv:'TVC:VIX'},
  // 환율·금리
  {grp:'fx', sym:'DX-Y.NYB', name:'달러인덱스', dec:2, tv:'TVC:DXY'},
  {grp:'fx', sym:'KRW=X',    name:'달러/원', unit:'₩', dec:1, tv:'FX_IDC:USDKRW'},
  {grp:'fx', sym:'EURUSD=X', name:'유로/달러', dec:4, tv:'FX_IDC:EURUSD'},
  {grp:'fx', sym:'JPY=X',    name:'달러/엔', dec:2, tv:'FX_IDC:USDJPY'},
  {grp:'fx', sym:'GBPUSD=X', name:'파운드/달러', dec:4, tv:'FX_IDC:GBPUSD'},
  {grp:'fx', sym:'^TNX',     name:'미국 10년물', pct:true, tv:'TVC:US10Y'},
  {grp:'fx', sym:'2YY=F',    name:'미국 2년물', pct:true, tv:'TVC:US02Y'},
  // 원자재
  {grp:'comm', sym:'GC=F', name:'금', unit:'$', tv:'TVC:GOLD'},
  {grp:'comm', sym:'SI=F', name:'은', unit:'$', tv:'TVC:SILVER'},
  {grp:'comm', sym:'CL=F', name:'WTI 원유', unit:'$', tv:'TVC:USOIL'},
];
// 대장주 (Yahoo 묶음 호출에 함께 실어 가져옴)
const US_LEADERS=[
  {sym:'AAPL',  name:'애플'},
  {sym:'MSFT',  name:'마이크로소프트'},
  {sym:'NVDA',  name:'엔비디아'},
  {sym:'GOOGL', name:'알파벳'},
  {sym:'AMZN',  name:'아마존'},
  {sym:'META',  name:'메타'},
  {sym:'TSLA',  name:'테슬라'},
];
const KR_LEADERS=[
  {sym:'005930.KS', code:'005930', name:'삼성전자'},
  {sym:'000660.KS', code:'000660', name:'SK하이닉스'},
  {sym:'373220.KS', code:'373220', name:'LG에너지솔루션'},
  {sym:'207940.KS', code:'207940', name:'삼성바이오로직스'},
  {sym:'005380.KS', code:'005380', name:'현대차'},
  {sym:'035420.KS', code:'035420', name:'NAVER'},
  {sym:'035720.KS', code:'035720', name:'카카오'},
];
let _usdkrw=null;
async function fetchYahoo(sym){
  const target=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}`;
  try{
      const r=await fetchProxyFast(target,7000);
      const d=await r.json();
      const m=d.chart.result[0].meta;
      const price=m.regularMarketPrice;
      const prev=m.chartPreviousClose||m.previousClose;
      const ch=((price-prev)/prev)*100;
      return {price,ch};
    }catch(e){}
  return null;
}
// 여러 심볼을 한 번에 (프록시 요청 11개 → 1개)
async function fetchSpark(symbols){
  const q=symbols.map(encodeURIComponent).join(',');
  const target=`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${q}&range=1d&interval=1d`;
  try{
      const r=await fetchProxyFast(target,7500);
      const d=await r.json();
      const res=d.spark&&d.spark.result;
      if(!res) return null;
      const map={};
      res.forEach(it=>{
        const m=it.response&&it.response[0]&&it.response[0].meta;
        if(m && typeof m.regularMarketPrice==='number'){
          const prev=m.chartPreviousClose||m.previousClose;
          map[it.symbol]={price:m.regularMarketPrice, ch:prev?((m.regularMarketPrice-prev)/prev)*100:0};
        }
      });
      if(Object.keys(map).length) return map;
    }catch(e){}
  return null;
}
function fmtMetricVal(item, price){
  if(item.pct) return price.toFixed(2)+'%';
  if(item.unit==='$') return '$'+price.toLocaleString('en-US',{maximumFractionDigits: price>=100?0:2});
  if(item.unit==='₩') return '₩'+price.toLocaleString('en-US',{maximumFractionDigits: item.dec??0});
  return price.toLocaleString('en-US',{maximumFractionDigits: item.dec??2});
}
function metricRow(name, valStr, ch, note, valCls, tv){
  const chHtml = (typeof ch==='number' && !isNaN(ch))
    ? `<span class="chg ${chgClass(ch)}">${arrow(ch)} ${chgStr(ch)}</span>`
    : `<span class="chg flat"></span>`;
  const inner = `<span class="mname">${name}${note?`<small>${note}</small>`:''}</span>
    <span class="mval ${valCls||''}">${valStr}</span>
    ${chHtml}`;
  return tv
    ? `<a class="mrow tv-link" href="${tvUrl(tv)}" target="_blank" rel="noopener">${inner}</a>`
    : `<div class="mrow">${inner}</div>`;
}
// 동시 호출 수 제한 (프록시 과부하 방지)
async function mapPool(items, worker, poolSize){
  const out=new Array(items.length); let i=0;
  async function run(){ while(i<items.length){ const idx=i++; out[idx]=await worker(items[idx], idx); } }
  await Promise.all(Array.from({length:Math.min(poolSize,items.length)}, run));
  return out;
}
const _metricCache={};
function leaderRows(list, cur){
  return list.map(it=>{
    const market=cur==='₩'?'KR':'US';
    const d=_metricCache[it.sym];
    if(!d) return `<button class="row stock-row" data-market="${market}" data-symbol="${escAttr(it.sym)}" data-code="${escAttr(it.code||'')}" data-name="${escAttr(it.name)}" data-price="" data-change="" onclick="openStockDetailFromRow(this)"><div class="name">${it.name}</div><div class="val"><div class="price flat">—</div></div></button>`;
    const valStr = cur==='₩' ? '₩'+d.price.toLocaleString('en-US',{maximumFractionDigits:0}) : '$'+fmtPrice(d.price);
    return `<button class="row stock-row" data-market="${market}" data-symbol="${escAttr(it.sym)}" data-code="${escAttr(it.code||'')}" data-name="${escAttr(it.name)}" data-price="${escAttr(valStr)}" data-change="${d.ch}" onclick="openStockDetailFromRow(this)">
      <div class="name">${it.name}</div>
      <div class="val"><div class="price">${valStr}</div><div class="chg ${chgClass(d.ch)}">${arrow(d.ch)} ${chgStr(d.ch)}</div></div>
    </button>`;
  }).join('');
}
async function loadMetrics(){
  const ALL=[...METRICS, ...US_LEADERS, ...KR_LEADERS];
  // 1차: 한 번에 묶음 호출 (프록시 1요청)
  const map=await fetchSpark(ALL.map(m=>m.sym));
  if(map){ for(const m of ALL){ if(map[m.sym]) _metricCache[m.sym]=map[m.sym]; } }
  // 2차: 빠진 항목만 개별 호출 (동시 3개)
  const missing=ALL.filter(m=>!_metricCache[m.sym]);
  if(missing.length){
    await mapPool(missing, async m=>{
      const data=await fetchYahoo(m.sym);
      if(data) _metricCache[m.sym]=data;
    }, 3);
  }
  // 렌더 (캐시값 사용 → 이번에 실패해도 마지막 값 유지)
  const groups={index:'',fx:'',comm:''};
  METRICS.forEach(m=>{
    const data=_metricCache[m.sym];
    if(m.sym==='KRW=X' && data) _usdkrw=data.price;
    if(!data){ groups[m.grp]+=metricRow(m.name,'—',NaN,m.note,'',m.tv); return; }
    groups[m.grp]+=metricRow(m.name, fmtMetricVal(m, data.price), data.ch, m.note, '', m.tv);
  });
  $('grp-index').innerHTML=groups.index;
  $('grp-fx').innerHTML=groups.fx;
  $('grp-comm').innerHTML=groups.comm;
  $('us-leaders').innerHTML=leaderRows(US_LEADERS,'$');
  $('kr-leaders').innerHTML=leaderRows(KR_LEADERS,'₩');
  updateTicker();
  loadCryptoMetrics();
}
async function getBtcUsd(){
  try{ const d=await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')).json(); return d.bitcoin.usd; }catch(e){ return null; }
}
async function getUpbitBtc(){
  const u='https://api.upbit.com/v1/ticker?markets=KRW-BTC';
  try{ const r=await fetchT(u,7000); if(r.ok){ const d=await r.json(); return d[0].trade_price; } }catch(e){}
  for(const p of PROXIES()){
    try{ const r=await fetchT(p(u),8000); if(r.ok){ const d=await r.json(); return d[0].trade_price; } }catch(e){}
  }
  return null;
}
async function loadCryptoMetrics(){
  let html='';
  // BTC 도미넌스
  try{
    const g=await (await fetch('https://api.coingecko.com/api/v3/global')).json();
    const dom=g.data.market_cap_percentage.btc;
    html+=metricRow('BTC 도미넌스', dom.toFixed(1)+'%', NaN, '', '', 'CRYPTOCAP:BTC.D');
  }catch(e){ html+=metricRow('BTC 도미넌스','—',NaN,'','','CRYPTOCAP:BTC.D'); }
  // 김치프리미엄
  try{
    const [upbit, btc]=await Promise.all([getUpbitBtc(), getBtcUsd()]);
    if(upbit && btc && _usdkrw){
      const kp=(upbit/(btc*_usdkrw)-1)*100;
      html+=metricRow('김치프리미엄', `${kp>=0?'+':''}${kp.toFixed(2)}%`, NaN, kp<0?'역프':'', kp>=0?'up':'down');
    } else { html+=metricRow('김치프리미엄','—',NaN); }
  }catch(e){ html+=metricRow('김치프리미엄','—',NaN); }
  $('grp-crypto').innerHTML=html;
}

/* ---------- 거시경제 뉴스 (RSS via proxy) ---------- */
const NEWS_FEEDS=[
  {url:'https://www.blockmedia.co.kr/feed',             cat:'코인', src:'블록미디어', tag:'#f7931a'},
  {url:'https://rss.etoday.co.kr/eto/global_news.xml',  cat:'미국', src:'이투데이',   tag:'#e15b64'},
  {url:'https://rss.etoday.co.kr/eto/market_news.xml',  cat:'주식', src:'이투데이',   tag:'#3da9fc'},
  {url:'https://rss.etoday.co.kr/eto/economy_news.xml', cat:'경제', src:'이투데이',   tag:'#1fd17a'},
  {url:'https://www.yna.co.kr/rss/economy.xml',         cat:'경제', src:'연합뉴스',   tag:'#1fd17a'},
];
// 쓸데없는 기사 거르기
const JUNK=['부고','인사','동정','신간','분양','운세','별세','[포토','＜포토','[영상','[카드','협찬','맛집','레시피','패션','뷰티','공연','전시','갤러리','드라마','아이돌','컴백','데뷔','채용공고','오늘의 운세','주간 운세','띠별','신간 안내','신차 출시','맛깔'];
// 미국·시장 핵심 키워드 → 강조
const HOT=['연준','Fed','FOMC','파월','금리','CPI','PCE','고용','실업','인플레','나스닥','뉴욕증시','S&P','다우','비트코인','ETF','관세','트럼프','반도체','엔비디아','국채','달러'];
const hasAny=(t,arr)=>arr.some(k=>t.includes(k));
function relTime(d){
  const s=(Date.now()-d.getTime())/1000;
  if(s<60) return '방금';
  if(s<3600) return `${Math.floor(s/60)}분 전`;
  if(s<86400) return `${Math.floor(s/3600)}시간 전`;
  return `${Math.floor(s/86400)}일 전`;
}
async function fetchFeed(feed){
  try{
      const r=await fetchProxyFast(feed.url,7000);
      const text=await r.text();
      const xml=new DOMParser().parseFromString(text,'text/xml');
      const items=[...xml.querySelectorAll('item')].slice(0,30);
      if(!items.length) return [];
      return items.map(it=>{
        const t=(it.querySelector('title')?.textContent||'').trim();
        const link=(it.querySelector('link')?.textContent||'').trim();
        const pd=it.querySelector('pubDate')?.textContent;
        return {title:t, link, date:pd?new Date(pd):new Date(), cat:feed.cat, src:feed.src, tag:feed.tag};
      }).filter(x=>x.title&&x.link);
    }catch(e){}
  return [];
}
let _allNews=[], _newsFilter='전체', _newsLimit=15;
async function loadNews(){
  try{
    let all=(await mapPool(NEWS_FEEDS, fetchFeed, 2)).flat();
    if(!all.length){ if(!_allNews.length) $('news').innerHTML='<div class="err">뉴스를 불러오지 못했어요. 잠시 후 새로고침.</div>'; return; }
    // 중복 제거
    const seen=new Set();
    all=all.filter(n=>{ const k=n.title.replace(/\s+/g,''); if(!k||seen.has(k))return false; seen.add(k); return true; });
    // 쓸데없는 기사 제거
    all=all.filter(n=>!hasAny(n.title, JUNK));
    // 최신순 정렬 (48시간 제한 제거 → 지나간 뉴스도 보존)
    all.sort((a,b)=>b.date-a.date);
    _allNews=all;
    renderNewsList();
  }catch(e){ if(!_allNews.length) $('news').innerHTML='<div class="err">뉴스 불러오기 실패</div>'; }
}
function setNewsFilter(cat){
  _newsFilter=cat; _newsLimit=15;
  document.querySelectorAll('.nf').forEach(b=>b.classList.toggle('active', b.dataset.cat===cat));
  renderNewsList();
}
function moreNews(){ _newsLimit+=15; renderNewsList(); }
function renderNewsList(){
  const filtered = _newsFilter==='전체' ? _allNews : _allNews.filter(n=>n.cat===_newsFilter);
  if(!filtered.length){ $('news').innerHTML='<div class="loading">해당 카테고리 뉴스가 없어요.</div>'; return; }
  let html=filtered.slice(0,_newsLimit).map(n=>{
    const hot=hasAny(n.title, HOT);
    return `<a class="news-item${hot?' hot':''}" href="${n.link}" target="_blank" rel="noopener">
      <span class="news-src" style="background:${n.tag}">${n.cat}</span>
      <span class="news-title">${n.title}<small style="color:var(--muted);font-weight:400;margin-left:6px;">${n.src}</small></span>
      <span class="news-time">${relTime(n.date)}</span>
    </a>`;
  }).join('');
  if(filtered.length>_newsLimit){
    html+=`<button class="more-btn" onclick="moreNews()">더 보기 (${filtered.length-_newsLimit}개 더)</button>`;
  }
  $('news').innerHTML=html;
}

/* ---------- 미국주식 급등락 (미국 전체 시장, FMP) ---------- */
function getFmpKey(){ return readSaved('fmpKey'); }
function saveFmpKey(){
  const el=document.getElementById('fmpInput'); if(!el) return;
  const v=el.value.trim(); if(!v) return;
  writeSaved('fmpKey',v);
  loadUSStocks();
}
function resetFmpKey(){ writeSaved('fmpKey',''); renderUSKeyPrompt(); }
function renderUSKeyPrompt(){
  $('us-gainers').innerHTML=`<div style="font-size:13px;color:var(--text);line-height:1.7;">
    미국 <b>전체 시장</b> 급등락을 보려면 무료 키가 <b>한 번</b> 필요해요.<br>
    <a href="https://site.financialmodelingprep.com/register" target="_blank" style="color:var(--amber);">① 여기서 무료 가입 (이메일만, 카드 X)</a><br>
    ② 가입 후 나오는 <b>API Key</b> 복사<br>
    ③ 아래에 붙여넣고 저장:
    <div style="display:flex;gap:6px;margin-top:8px;">
      <input id="fmpInput" placeholder="API 키 붙여넣기" style="flex:1;min-width:0;background:var(--panel2);border:1px solid var(--border);color:var(--text);padding:7px 9px;border-radius:6px;font-family:var(--mono);font-size:12px;">
      <button onclick="saveFmpKey()" class="refresh">저장</button>
    </div>
  </div>`;
  $('us-losers').innerHTML='<div style="font-size:12px;color:var(--muted);">키를 저장하면 급등·급락이 함께 표시돼요.</div>';
}
function parsePct(x){ return parseFloat(String(x).replace(/[()%+,\s]/g,'')); }
function trimName(n,sym){ n=(n||sym||'').trim(); return n.length>22? n.slice(0,21)+'…' : n; }
const US_NAME_KO={AAPL:'애플',MSFT:'마이크로소프트',NVDA:'엔비디아',GOOGL:'알파벳',GOOG:'알파벳',AMZN:'아마존',META:'메타',TSLA:'테슬라',VEEE:'트윈 비 파워캣츠'};
const US_WORD_KO=[
  [/Twin Vee Powercats/gi,'트윈 비 파워캣츠'],[/Artificial Intelligence/gi,'인공지능'],[/Electric Vehicle/gi,'전기차'],
  [/Technologies/gi,'테크놀로지스'],[/Technology/gi,'테크놀로지'],[/Therapeutics/gi,'테라퓨틱스'],[/Pharmaceuticals/gi,'파마슈티컬스'],
  [/Communications/gi,'커뮤니케이션스'],[/International/gi,'인터내셔널'],[/Industries/gi,'인더스트리스'],[/Entertainment/gi,'엔터테인먼트'],
  [/Acquisition/gi,'애퀴지션'],[/Holdings/gi,'홀딩스'],[/Financial/gi,'파이낸셜'],[/Robotics/gi,'로보틱스'],[/Solutions/gi,'솔루션스'],
  [/Semiconductor/gi,'세미컨덕터'],[/Biotechnology/gi,'바이오테크놀로지'],[/Medical/gi,'메디컬'],[/Healthcare/gi,'헬스케어'],
  [/Digital/gi,'디지털'],[/Energy/gi,'에너지'],[/Resources/gi,'리소시스'],[/Systems/gi,'시스템스'],[/Software/gi,'소프트웨어'],
  [/Power/gi,'파워'],[/Solar/gi,'솔라'],[/Quantum/gi,'퀀텀'],[/Global/gi,'글로벌'],[/American/gi,'아메리칸'],[/United/gi,'유나이티드'],
  [/Group/gi,'그룹'],[/Motors/gi,'모터스'],[/Networks/gi,'네트웍스'],[/Capital/gi,'캐피털'],[/Health/gi,'헬스'],[/Bio/gi,'바이오'],
  [/Corporation/gi,'코퍼레이션'],[/Corp\.?/gi,'코퍼레이션'],[/Company/gi,'컴퍼니'],[/\bCo\.?\b/gi,'컴퍼니'],[/\bInc\.?\b/gi,''],[/\bLtd\.?\b/gi,'']
];
function koUsName(name,symbol){
  if(US_NAME_KO[symbol]) return US_NAME_KO[symbol];
  let out=String(name||symbol||'');
  for(const [re,ko] of US_WORD_KO) out=out.replace(re,ko);
  out=out.replace(/[,()]/g,' ').replace(/\s+/g,' ').trim();
  return out||symbol;
}
function renderFmpRows(arr){
  return arr.slice(0,10).map((c,i)=>{
    const ch=parsePct(c.changesPercentage);
    const enName=c.name||c.symbol, koName=koUsName(enName,c.symbol);
    return `<button class="row stock-row" data-market="US" data-symbol="${escAttr(c.symbol)}" data-name="${escAttr(koName)}" data-en-name="${escAttr(enName)}" data-price="$${escAttr(fmtPrice(c.price))}" data-change="${ch}" onclick="openStockDetailFromRow(this)">
      <div class="name"><span class="rank">${i+1}</span>${trimName(koName,c.symbol)}<small>${trimName(enName,c.symbol)} · ${c.symbol}</small></div>
      <div class="val">
        <div class="price">$${fmtPrice(c.price)}</div>
        <div class="chg ${chgClass(ch)}">${arrow(ch)} ${chgStr(ch)}</div>
      </div></button>`;
  }).join('');
}
async function loadUSStocks(){
  const key=getFmpKey();
  if(!key){ renderUSKeyPrompt(); return; }
  try{
    const base='https://financialmodelingprep.com/stable';
    const [gR,lR]=await Promise.all([
      fetch(`${base}/biggest-gainers?apikey=${key}`),
      fetch(`${base}/biggest-losers?apikey=${key}`),
    ]);
    const g=await gR.json(), l=await lR.json();
    if(!Array.isArray(g)||!Array.isArray(l)){
      $('us-gainers').innerHTML='<div class="err">키가 올바르지 않거나 하루 한도(250회) 초과예요. <a href="#" onclick="resetFmpKey();return false;" style="color:var(--amber)">키 다시 입력</a></div>';
      $('us-losers').innerHTML='';
      return;
    }
    $('us-gainers').innerHTML=renderFmpRows(g);
    $('us-losers').innerHTML=renderFmpRows(l);
  }catch(e){ $('us-gainers').innerHTML='<div class="err">불러오기 실패 — 새로고침 해보세요</div>'; $('us-losers').innerHTML=''; }
}

/* ---------- 국내주식 급등락 (네이버 증권) ---------- */
async function fetchNaverRank(pageUrl){
  const parse=async r=>{
      const buf=await r.arrayBuffer();
      const html=new TextDecoder('euc-kr').decode(buf); // 네이버는 EUC-KR 인코딩
      const doc=new DOMParser().parseFromString(html,'text/html');
      const out=[];
      for(const tr of doc.querySelectorAll('table.type_2 tr')){
        const a=tr.querySelector('a.tltle');
        if(!a) continue;
        const tds=tr.querySelectorAll('td');
        if(tds.length<5) continue;
        const name=a.textContent.trim();
        const code=(a.getAttribute('href')||'').match(/code=(\d{6})/)?.[1]||'';
        const price=tds[2].textContent.trim();
        const ch=parseFloat(tds[4].textContent.replace(/[\s%+]/g,''));
        if(!name||isNaN(ch)) continue;
        out.push({name, code, price, ch});
      }
      if(!out.length) throw new Error('종목 표를 찾지 못함');
      return out;
  };
  const candidates=[pageUrl,...PROXIES().map(p=>p(pageUrl))];
  const jobs=candidates.map(async url=>{
    const r=await fetchT(url,7000);
    if(!r.ok) throw new Error('HTTP '+r.status);
    return parse(r);
  });
  try{
    if(typeof Promise.any==='function') return await Promise.any(jobs);
    for(const job of jobs){ try{return await job;}catch(e){} }
  }catch(e){}
  return null;
}
function renderKRRows(arr){
  return arr.map((s,i)=>{
    return `<button class="row stock-row" data-market="KR" data-symbol="${escAttr(s.code)}" data-code="${escAttr(s.code)}" data-name="${escAttr(s.name)}" data-price="${escAttr(s.price)}" data-change="${s.ch}" onclick="openStockDetailFromRow(this)">
    <div class="name"><span class="rank">${i+1}</span>${s.name}</div>
    <div class="val">
      <div class="price">${s.price}</div>
      <div class="chg ${chgClass(s.ch)}">${arrow(s.ch)} ${chgStr(s.ch)}</div>
    </div></button>`;
  }).join('');
}

/* ---------- 종목 상세: 클릭할 때만 회사 정보·뉴스 요청 ---------- */
const US_INTRO_KO={
  AAPL:'아이폰, 맥, 아이패드와 서비스 생태계를 운영하는 글로벌 소비자 기술 기업입니다.',
  MSFT:'윈도우, 오피스, 애저 클라우드와 인공지능 서비스를 운영하는 소프트웨어 기업입니다.',
  NVDA:'인공지능 연산과 그래픽 처리에 쓰이는 GPU 및 데이터센터 플랫폼을 설계하는 반도체 기업입니다.',
  GOOGL:'검색, 유튜브, 디지털 광고, 클라우드와 인공지능 서비스를 운영하는 알파벳의 핵심 기업입니다.',
  AMZN:'전자상거래, 물류, 구독 서비스와 AWS 클라우드를 운영하는 글로벌 플랫폼 기업입니다.',
  META:'페이스북, 인스타그램, 왓츠앱과 광고·인공지능 서비스를 운영하는 소셜 플랫폼 기업입니다.',
  TSLA:'전기자동차, 에너지저장장치와 충전 인프라를 개발·판매하는 기업입니다.'
};
const US_META_KO={
  AAPL:{sector:'기술',industry:'소비자 전자제품',exchange:'나스닥',website:'https://www.apple.com/'},
  MSFT:{sector:'기술',industry:'소프트웨어·클라우드',exchange:'나스닥',website:'https://www.microsoft.com/'},
  NVDA:{sector:'기술',industry:'반도체·인공지능',exchange:'나스닥',website:'https://www.nvidia.com/'},
  GOOGL:{sector:'커뮤니케이션',industry:'인터넷·디지털 광고',exchange:'나스닥',website:'https://abc.xyz/'},
  AMZN:{sector:'경기소비재',industry:'전자상거래·클라우드',exchange:'나스닥',website:'https://www.aboutamazon.com/'},
  META:{sector:'커뮤니케이션',industry:'소셜미디어·디지털 광고',exchange:'나스닥',website:'https://about.meta.com/'},
  TSLA:{sector:'경기소비재',industry:'전기자동차·에너지',exchange:'나스닥',website:'https://www.tesla.com/'}
};
const KR_INTRO_KO={
  '005930':'반도체, 스마트폰, 가전제품을 생산하는 대한민국의 대표 전자기업입니다.',
  '000660':'D램과 낸드플래시 등 메모리 반도체를 설계·생산하는 기업입니다.',
  '373220':'전기차와 에너지저장장치용 이차전지를 생산하는 배터리 기업입니다.',
  '207940':'바이오의약품 위탁개발·생산을 주력으로 하는 바이오 기업입니다.',
  '005380':'승용차와 상용차, 친환경차를 개발·생산하는 글로벌 자동차 기업입니다.',
  '035420':'검색, 광고, 커머스, 콘텐츠, 핀테크와 클라우드 서비스를 운영하는 인터넷 플랫폼 기업입니다.',
  '035720':'메신저, 광고, 콘텐츠, 모빌리티와 금융 서비스를 운영하는 플랫폼 기업입니다.'
};
function openStockDetailFromRow(el){
  openStockDetail({market:el.dataset.market,symbol:el.dataset.symbol,code:el.dataset.code||'',name:el.dataset.name,enName:el.dataset.enName||el.dataset.name,price:el.dataset.price||'—',change:parseFloat(el.dataset.change)});
}
function openStockDetail(stock){
  const modal=$('stock-modal');
  modal.dataset.detailKey=`${stock.market}:${stock.code||stock.symbol}`;
  modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open');
  $('stock-detail').innerHTML=`<div class="detail-kicker">${stock.market==='US'?'미국 주식':'국내 주식'}</div><h2 id="stock-detail-title" class="detail-title">${escHtml(stock.name)}</h2><div class="detail-symbol">${escHtml(stock.symbol||stock.code)}</div><div class="loading" style="margin-top:24px;">회사 정보와 관련 뉴스를 불러오는 중…</div>`;
  if(stock.market==='US') loadUsStockDetail(stock); else loadKrStockDetail(stock);
}
function closeStockDetail(){
  const modal=$('stock-modal'); if(!modal) return;
  modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open');
}
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeStockDetail(); });
function detailPriceHtml(stock){
  const ch=Number(stock.change);
  return `<div class="detail-price"><div><small style="color:var(--muted)">현재 표시 가격</small><br><strong>${escHtml(stock.price||'—')}</strong></div><span class="${chgClass(ch)}">${isNaN(ch)?'—':`${arrow(ch)} ${chgStr(ch)}`}</span></div>`;
}
function detailNewsHtml(news){
  if(!news.length) return '<div class="loading">표시할 관련 뉴스가 없어요.</div>';
  return news.slice(0,3).map(n=>`<a class="detail-news" href="${escAttr(n.url)}" target="_blank" rel="noopener"><strong>${escHtml(n.title)}</strong><small>${escHtml(n.site||'관련 뉴스')}${n.date?' · '+escHtml(n.date):''}</small></a>`).join('');
}
async function fetchGoogleStockNews(query){
  try{
    const feed=`https://news.google.com/rss/search?q=${encodeURIComponent(query+' when:14d')}&hl=ko&gl=KR&ceid=KR:ko`;
    const r=await fetchProxyFast(feed,6500), text=await r.text();
    const xml=new DOMParser().parseFromString(text,'text/xml');
    return [...xml.querySelectorAll('item')].slice(0,5).map(it=>({
      title:(it.querySelector('title')?.textContent||'관련 기사').trim(),
      url:(it.querySelector('link')?.textContent||'#').trim(),
      site:(it.querySelector('source')?.textContent||'Google 뉴스').trim(),
      date:(it.querySelector('pubDate')?.textContent||'').slice(0,16)
    }));
  }catch(e){ return []; }
}
function readUsDetailCache(sym){ try{return JSON.parse(localStorage.getItem('usDetail:'+sym)||'null');}catch(e){return null;} }
function writeUsDetailCache(sym,data){ try{localStorage.setItem('usDetail:'+sym,JSON.stringify({...data,savedAt:Date.now()}));}catch(e){} }
function mapFmpNews(items){ return (Array.isArray(items)?items:[]).map(x=>({title:x.title||x.text||'관련 기사',url:x.url||x.link||'#',site:x.site||x.publisher||'',date:(x.publishedDate||x.date||'').slice(0,10)})); }
async function fetchJsonOneFallback(url,accept){
  const proxy=PROXIES()[0], candidates=[url];
  if(proxy) candidates.push(proxy(url));
  for(const candidate of candidates){
    try{const r=await fetchT(candidate,5500); if(!r.ok) continue; const d=await r.json(); if(accept(d)) return d;}catch(e){}
  }
  throw new Error('상세 데이터 없음');
}
function renderUsStockDetail(stock,profile,news){
  const sym=String(stock.symbol||'').replace(/\.(KS|KQ)$/,''), known=US_META_KO[sym]||{};
  const intro=US_INTRO_KO[sym]||(profile?.description?profile.description.slice(0,900):`${stock.name}은(는) 미국 증시에 상장된 기업입니다. 급등락 종목은 정보가 적은 소형주일 수 있으므로 최근 공시·거래량·뉴스를 함께 확인하세요.`);
  const sector=profile?.sector||known.sector||'미국 상장기업', industry=profile?.industry||known.industry||'상세 업종 확인 필요';
  const cap=Number(profile?.marketCap), capText=cap?`$${(cap/1e9).toLocaleString('en-US',{maximumFractionDigits:2})}B`:'Yahoo에서 확인 ↗';
  const exchange=profile?.exchange||profile?.exchangeShortName||known.exchange||'미국 증시';
  const country=profile?.country||'미국', ceo=profile?.ceo||'공시에서 확인';
  const website=profile?.website||known.website||'', ch=Number(stock.change);
  const yahoo=`https://finance.yahoo.com/quote/${encodeURIComponent(sym)}/`, googleNews=`https://news.google.com/search?q=${encodeURIComponent(stock.name+' '+sym+' stock')}&hl=ko&gl=KR&ceid=KR%3Ako`;
  const newsHtml=news?.length?detailNewsHtml(news):`<a class="detail-news" href="${googleNews}" target="_blank" rel="noopener"><strong>Google 뉴스에서 ${escHtml(sym)} 최신 기사 바로 보기 ↗</strong><small>자동 기사 목록이 없어도 검색 결과는 바로 열립니다.</small></a>`;
  const risk=Math.abs(ch)>=20?`<div class="detail-risk"><b>급등락 주의</b> 하루 변동률이 ${escHtml(chgStr(ch))}입니다. 거래정지·증자·합병·저유동성 종목 여부를 공시에서 확인하세요.</div>`:'';
  $('stock-detail').innerHTML=`<div class="detail-kicker">미국 주식</div><h2 id="stock-detail-title" class="detail-title">${escHtml(stock.name)}</h2><div class="detail-symbol">${escHtml(stock.enName||profile?.companyName||'')} · ${escHtml(sym)}</div>${detailPriceHtml(stock)}${risk}<div class="detail-meta"><div><small>섹터</small><strong>${escHtml(sector)}</strong></div><div><small>산업</small><strong>${escHtml(industry)}</strong></div><div><small>시가총액</small><strong><a href="${yahoo}" target="_blank" rel="noopener" style="color:inherit">${escHtml(capText)}</a></strong></div><div><small>거래소</small><strong>${escHtml(exchange)}</strong></div><div><small>소재 국가</small><strong>${escHtml(country)}</strong></div><div><small>대표자</small><strong>${escHtml(ceo)}</strong></div></div><p class="detail-description">${escHtml(intro)}</p><h3 class="detail-section-title">최근 관련 뉴스</h3>${newsHtml}<div class="detail-actions"><a class="detail-action" href="${tvUrl(sym)}" target="_blank" rel="noopener">TradingView 차트 ↗</a><a class="detail-action" href="${yahoo}" target="_blank" rel="noopener">Yahoo 상세정보 ↗</a><a class="detail-action" href="${googleNews}" target="_blank" rel="noopener">최신 뉴스 ↗</a><a class="detail-action" href="https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(sym)}" target="_blank" rel="noopener">SEC 공시 ↗</a>${website?`<a class="detail-action" href="${escAttr(website)}" target="_blank" rel="noopener">회사 홈페이지 ↗</a>`:''}</div>`;
}
async function loadUsStockDetail(stock){
  const apiKey=getFmpKey(), sym=String(stock.symbol||'').replace(/\.(KS|KQ)$/,''), detailKey=`US:${stock.code||stock.symbol}`;
  const cached=readUsDetailCache(sym)||{};
  renderUsStockDetail(stock,cached.profile||null,cached.news||[]);
  if(cached.savedAt&&Date.now()-cached.savedAt<30*60*1000&&(cached.profile||cached.news?.length)) return;
  const googleJob=fetchGoogleStockNews(`${stock.enName||stock.name} ${sym} 주식`);
  let profile=cached.profile||null, news=cached.news||[];
  if(apiKey){
    const profileUrl=`https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(sym)}&apikey=${encodeURIComponent(apiKey)}`;
    const newsUrl=`https://financialmodelingprep.com/stable/news/stock?symbols=${encodeURIComponent(sym)}&page=0&limit=5&apikey=${encodeURIComponent(apiKey)}`;
    const [p,n]=await Promise.allSettled([
      fetchJsonOneFallback(profileUrl,d=>Array.isArray(d)&&d.length>0),
      fetchJsonOneFallback(newsUrl,d=>Array.isArray(d))
    ]);
    if(p.status==='fulfilled') profile=p.value[0]||profile;
    if(n.status==='fulfilled'&&n.value.length) news=mapFmpNews(n.value);
  }
  const googleNews=await googleJob;
  if(!news.length&&googleNews.length) news=googleNews;
  if(profile||news.length) writeUsDetailCache(sym,{profile,news});
  if($('stock-modal').dataset.detailKey!==detailKey) return;
  renderUsStockDetail(stock,profile,news);
}
async function loadKrStockDetail(stock){
  const code=stock.code||stock.symbol, name=stock.name;
  const key=`KR:${code}`;
  const intro=KR_INTRO_KO[code]||`${name}은 국내 증시에 상장된 기업입니다. 네이버 증권의 기업현황과 관련 뉴스를 통해 주요 사업과 최근 이슈를 확인할 수 있습니다.`;
  const naverFinance=`https://finance.naver.com/item/main.naver?code=${encodeURIComponent(code)}`;
  $('stock-detail').innerHTML=`<div class="detail-kicker">국내 주식</div><h2 id="stock-detail-title" class="detail-title">${escHtml(name)}</h2><div class="detail-symbol">${escHtml(code)}</div>${detailPriceHtml(stock)}<div class="detail-meta"><div><small>종목코드</small><strong>${escHtml(code)}</strong></div><div><small>시장</small><strong>한국 증시</strong></div></div><p class="detail-description">${escHtml(intro)}</p><h3 class="detail-section-title">최근 관련 뉴스</h3><div id="detail-news-list"><div class="loading">뉴스만 따로 불러오는 중…</div></div><div class="detail-actions"><a class="detail-action" href="${tvUrl('KRX:'+code)}" target="_blank" rel="noopener">TradingView 차트 ↗</a><a class="detail-action" href="${naverFinance}" target="_blank" rel="noopener">네이버 기업현황 ↗</a><a class="detail-action" href="https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(name)}" target="_blank" rel="noopener">네이버 관련뉴스 ↗</a></div>`;
  const news=await fetchGoogleStockNews(name+' 주식');
  if($('stock-modal').dataset.detailKey!==key) return;
  const target=$('detail-news-list');
  if(target) target.innerHTML=news.length?detailNewsHtml(news):`<a class="detail-news" href="https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(name)}" target="_blank" rel="noopener"><strong>네이버에서 ${escHtml(name)} 최신 뉴스 보기 ↗</strong><small>뉴스 자동 조회가 지연되고 있습니다.</small></a>`;
}
function readKrCache(){ try{return JSON.parse(localStorage.getItem('krRankCache')||'null')||{gain:null,lose:null};}catch(e){return {gain:null,lose:null};} }
let _krCache=readKrCache();
function krRankError(url){ return `<div class="err">네이버 순위 연결이 지연되고 있어요.<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px"><button class="refresh" onclick="loadKRStocks()">다시 시도</button><a class="detail-action" href="${url}" target="_blank" rel="noopener">네이버에서 보기 ↗</a></div></div>`; }
async function loadKRStocks(){
  if(_krCache.gain) $('kr-gainers').innerHTML=renderKRRows(_krCache.gain.slice(0,10));
  if(_krCache.lose) $('kr-losers').innerHTML=renderKRRows(_krCache.lose.slice(0,10));
  try{
    const [rise,fall]=await Promise.all([
      fetchNaverRank('https://finance.naver.com/sise/sise_rise.naver'),
      fetchNaverRank('https://finance.naver.com/sise/sise_fall.naver'),
    ]);
    if(rise&&rise.length) _krCache.gain=rise;
    if(fall&&fall.length) _krCache.lose=fall;
    if(rise||fall){ try{localStorage.setItem('krRankCache',JSON.stringify(_krCache));}catch(e){} }
    $('kr-gainers').innerHTML = _krCache.gain? renderKRRows(_krCache.gain.slice(0,10)) : krRankError('https://finance.naver.com/sise/sise_rise.naver');
    $('kr-losers').innerHTML  = _krCache.lose? renderKRRows(_krCache.lose.slice(0,10)) : krRankError('https://finance.naver.com/sise/sise_fall.naver');
  }catch(e){
    if(!_krCache.gain) $('kr-gainers').innerHTML=krRankError('https://finance.naver.com/sise/sise_rise.naver');
    if(!_krCache.lose) $('kr-losers').innerHTML=krRankError('https://finance.naver.com/sise/sise_fall.naver');
  }
}

/* ---------- 경제 지표 캘린더 (ForexFactory: 일정·예상·이전, 클릭 시 실제결과) ---------- */
const EV_KO=[
  ['Core CPI','근원 CPI'],['CPI','소비자물가 CPI'],['Core PCE','근원 PCE'],['PCE','PCE 물가'],
  ['Non-Farm Employment','비농업 고용'],['Nonfarm','비농업 고용'],['ADP','ADP 민간고용'],
  ['Unemployment Rate','실업률'],['Unemployment Claims','실업수당청구'],['Average Hourly','시간당 평균임금'],
  ['Federal Funds Rate','FOMC 금리결정'],['FOMC Statement','FOMC 성명'],
  ['FOMC Economic Projections','FOMC 경제전망'],['FOMC Meeting Minutes','FOMC 의사록'],
  ['FOMC Press Conference','FOMC 기자회견'],['FOMC Member','연준 위원 연설'],['FOMC','FOMC'],
  ['Main Refinancing Rate','ECB 기준금리'],['ECB Press Conference','ECB 기자회견'],['Monetary Policy','통화정책'],
  ['Advance GDP','속보치 GDP'],['Prelim GDP','잠정 GDP'],['GDP','GDP'],
  ['Retail Sales','소매판매'],['Core PPI','근원 PPI'],['PPI','생산자물가 PPI'],
  ['ISM Manufacturing','ISM 제조업'],['ISM Services','ISM 서비스업'],
  ['CB Consumer Confidence','소비자신뢰지수'],['Consumer Confidence','소비자신뢰지수'],
  ['UoM','미시간 소비심리'],['JOLTS','구인건수(JOLTS)'],['Building Permits','건축허가'],
  ['Durable Goods','내구재주문'],['Powell','파월 연설'],['Industrial Production','산업생산'],
  ['Trade Balance','무역수지'],['Housing Starts','주택착공'],['Flash Manufacturing PMI','제조업 PMI(속보)'],
  ['Flash Services PMI','서비스 PMI(속보)'],
];
function evKo(name){ if(!name) return ''; for(const [en,ko] of EV_KO){ if(name.includes(en)) return ko; } return name; }
let _calCache=null;
async function loadCalendar(){
  const srcs=[
    'https://cdn-nfs.faireconomy.media/ff_calendar_thisweek.json',
    'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  ];
  let data=null;
  for(const src of srcs){
      try{
        const r=await fetchProxyFast(src,7000);
        const txt=await r.text();
        if(txt.trim().charAt(0)!=='[') continue; // 차단/HTML 응답 거르기
        const d=JSON.parse(txt);
        if(Array.isArray(d) && d.length){ data=d; break; }
      }catch(e){}
  }
  if(data) _calCache=data;
  if(!_calCache){ $('calendar').innerHTML='<div class="loading">불러오는 중… (자동 재시도) — 계속 안 뜨면 알려줘요</div>'; return; }
  renderCalendar(_calCache);
}
function renderCalendar(src){
  const nowMs=Date.now();
  const CUR={USD:'미국',EUR:'유럽',KRW:'한국',GBP:'영국',JPY:'일본'};
  const ev=src.filter(e=>{
    if(!['USD','EUR','KRW'].includes(e.country)) return false;
    const high=String(e.impact||'').toLowerCase()==='high';
    const wl=EV_KO.some(([en])=>e.title&&e.title.includes(en));
    return high||wl;
  }).map(e=>({...e, ts:new Date(e.date).getTime()}))
    .filter(e=> !isNaN(e.ts) && e.ts > nowMs-18*36e5)
    .sort((a,b)=>a.ts-b.ts);
  const seen=new Set();
  const dedup=ev.filter(e=>{ const k=e.ts+'|'+e.country+'|'+evKo(e.title); if(seen.has(k)) return false; seen.add(k); return true; }).slice(0,24);
  if(!dedup.length){ $('calendar').innerHTML='<div class="loading">예정된 주요 지표가 없어요.</div>'; return; }
  const p=n=>String(n).padStart(2,'0');
  $('calendar').innerHTML=dedup.map(e=>{
    const dt=new Date(e.ts);
    const when=`${p(dt.getMonth()+1)}/${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
    const has=v=>v!=null&&v!=='';
    const past=e.ts<=nowMs;
    const released=past&&has(e.actual);
    const state=released?'released':past?'awaiting':'upcoming';
    const status=released?'발표 완료':past?'결과 확인 중':'발표 예정';
    const impact=String(e.impact||'low').toLowerCase();
    const starCount=impact==='high'?3:impact==='medium'?2:1;
    const stars='★'.repeat(starCount)+'☆'.repeat(3-starCount);
    const extra=[];
    if(released) extra.push(`<span class="cal-actual">실제 ${escHtml(e.actual)}</span>`);
    else if(past) extra.push('<span class="cal-wait">결과 확인 중</span>');
    if(has(e.forecast)) extra.push(`<span class="cal-forecast">예상 ${escHtml(e.forecast)}</span>`);
    if(has(e.previous)) extra.push(`<span class="cal-previous">이전 ${escHtml(e.previous)}</span>`);
    const vals=extra.length?extra.join(' · '):'<span class="cal-forecast">예정</span>';
    return `<a class="cal-row ${state}" href="https://www.forexfactory.com/calendar" target="_blank" rel="noopener">
      <span class="cal-date">${when}</span>
      <span class="cal-ctry">${CUR[e.country]||e.country}</span>
      <span class="cal-impact ${impact}" title="중요도 ${starCount}/3">${stars}</span>
      <span class="cal-event">${evKo(e.title)} <span class="cal-status">${status} ↗</span></span>
      <span class="cal-vals">${vals}</span>
    </a>`;
  }).join('');
}

/* ---------- 전체 로드 ---------- */
async function loadAll(){
  $('updated').textContent='갱신 중…';
  await Promise.all([loadCrypto(),loadMovers(),loadFng()]);
  const now=new Date();
  const p=n=>String(n).padStart(2,'0');
  $('updated').textContent=`갱신: ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
}
function manualRefresh(){ loadAll(); loadMetrics(); loadKRStocks(); loadNews(); loadUSStocks(); loadCalendar(); }

/* ---------- 내 프록시 설정 ---------- */
function saveProxy(){
  const el=document.getElementById('proxyInput'); if(!el) return;
  let v=el.value.trim().replace(/\/+$/,'');
  writeSaved('proxyBase',v);
  updateProxyStatus();
  manualRefresh();
}
function updateProxyStatus(){
  const my=getProxyBase();
  const el=document.getElementById('proxy-status');
  const inp=document.getElementById('proxyInput');
  if(el){ el.textContent = my?'✓ 내 프록시 사용 중':'공용 프록시 사용 중'; el.style.color = my?'var(--up)':'var(--muted)'; }
  if(inp && my && !inp.value) inp.value=my;
}
updateProxyStatus();

// 첫 로드 (프록시 요청을 시간차로 분산 → 동시 과부하 방지)
loadAll();                       // 코인·공포탐욕
loadUSStocks();                  // 미국주식 (FMP 직접)
setTimeout(loadCalendar, 800);   // 경제 캘린더
setTimeout(loadCalendar, 20000); // 캘린더 재시도
setTimeout(loadCalendar, 45000); // 캘린더 재시도
setTimeout(loadMetrics,   150);  // 지표 (묶음 1요청)
setTimeout(loadNews,      700);  // 뉴스
setTimeout(loadKRStocks, 1200);  // 국내주식
// 워밍업 — 빈칸 빨리 채우기
setTimeout(loadMetrics,  25000);
setTimeout(loadNews,     32000);
setTimeout(loadKRStocks, 38000);

// 갱신 주기 (프록시 부담 분산)
setInterval(loadAll,     60000);   // 코인·공포탐욕: 1분
setInterval(loadMetrics, 120000);  // 지수·환율·원자재·크립토지표: 2분
setInterval(loadKRStocks,90000);   // 국내주식: 1.5분
setInterval(loadNews,    180000);  // 뉴스: 3분
setInterval(loadUSStocks,600000);  // 미국주식: 10분 (무료 한도 절약)
setInterval(loadCalendar,600000);  // 경제 캘린더: 10분 (발표값 갱신)
