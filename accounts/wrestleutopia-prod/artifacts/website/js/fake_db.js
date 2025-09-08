// In-memory seed data + localStorage persistence for MVP demo
if (window.__wu_db_loaded__) {
  console.debug('fake_db.js already loaded; skipping re-init');
} else {
  window.__wu_db_loaded__ = true;
}
const SEED_TALENT = [
  { id: 't1', name:'Jade Rivera', ring:'Jade Riot', city:'San Antonio, TX', travel:200, height_cm:168, weight_kg:65, styles:['High-flyer','Striker'], reel:'https://example.com/reel/jade', school:'Reality of Wrestling', years:3, verified_school:true, rate_min:150, rate_max:300, avatar:'https://picsum.photos/seed/jade/200/200' },
  { id: 't2', name:'Marcus Hill', ring:'Iron Hill', city:'Houston, TX', travel:150, height_cm:183, weight_kg:92, styles:['Power','Technical'], reel:'https://example.com/reel/marcus', school:'Nightmare Factory', years:4, verified_school:true, rate_min:200, rate_max:400, avatar:'https://picsum.photos/seed/marcus/200/200' },
  { id: 't3', name:'Ava Kim', ring:'Ava Blaze', city:'Dallas, TX', travel:300, height_cm:165, weight_kg:60, styles:['Technical','Lucha'], reel:'https://example.com/reel/ava', school:'Create-A-Pro', years:2, verified_school:false, rate_min:120, rate_max:250, avatar:'https://picsum.photos/seed/avablaze/200/200' },
  { id: 't4', name:'Diego Santos', ring:'El Relámpago', city:'Austin, TX', travel:180, height_cm:172, weight_kg:74, styles:['Lucha','High-flyer'], reel:'https://example.com/reel/diego', school:'ROW', years:5, verified_school:true, rate_min:220, rate_max:450, avatar:'https://picsum.photos/seed/diego/200/200' },
  { id: 't5', name:'Nina Brooks', ring:'Nightfall', city:'San Antonio, TX', travel:120, height_cm:170, weight_kg:68, styles:['Brawler','Striker'], reel:'https://example.com/reel/nina', school:'OVW', years:1, verified_school:false, rate_min:100, rate_max:180, avatar:'https://picsum.photos/seed/night/200/200' },
  { id: 't6', name:'Kenji Sato', ring:'Sato', city:'Fort Worth, TX', travel:250, height_cm:178, weight_kg:80, styles:['Strong Style','Technical'], reel:'https://example.com/reel/sato', school:'DDT Dojo', years:6, verified_school:true, rate_min:250, rate_max:500, avatar:'https://picsum.photos/seed/sato/200/200' },
  { id: 't7', name:'Riley Moore', ring:'Riptide', city:'El Paso, TX', travel:400, height_cm:175, weight_kg:70, styles:['High-flyer','Technical'], reel:'https://example.com/reel/riptide', school:'Santana Bros', years:3, verified_school:false, rate_min:140, rate_max:260, avatar:'https://picsum.photos/seed/riptide/200/200' },
  { id: 't8', name:'Tyrell Jackson', ring:'T-Volt', city:'San Marcos, TX', travel:100, height_cm:188, weight_kg:100, styles:['Power','Brawler'], reel:'https://example.com/reel/tvolt', school:'ROW', years:4, verified_school:true, rate_min:230, rate_max:420, avatar:'https://picsum.photos/seed/tvolt/200/200' }
];
const SEED_TRYOUTS = [
  { id:'y1', org:'Freelance Wrestling', city:'Chicago, IL', date:'2025-09-20', slots:24, requirements:'18+, basic bumps, promo try', contact:'booking@freelance.com', status:'open' },
  { id:'y2', org:'Reality of Wrestling', city:'Houston, TX', date:'2025-10-05', slots:30, requirements:'Ring cardio, chain, promo', contact:'tryouts@row.com', status:'open' },
  { id:'y3', org:'GCW', city:'Dallas, TX', date:'2025-10-18', slots:20, requirements:'2+ yrs experience, insurance proof', contact:'info@gcw.com', status:'open' }
];

function loadDB(){
  const t = JSON.parse(localStorage.getItem('wu_talent')||'null') || SEED_TALENT;
  const y = JSON.parse(localStorage.getItem('wu_tryouts')||'null') || SEED_TRYOUTS;
  const a = JSON.parse(localStorage.getItem('wu_apps')||'null') || [];
  localStorage.setItem('wu_talent', JSON.stringify(t));
  localStorage.setItem('wu_tryouts', JSON.stringify(y));
  localStorage.setItem('wu_apps', JSON.stringify(a));
  return {talent:t, tryouts:y, apps:a};
}

function saveTalent(list){ localStorage.setItem('wu_talent', JSON.stringify(list)); }
function saveTryouts(list){ localStorage.setItem('wu_tryouts', JSON.stringify(list)); }
function saveApps(list){ localStorage.setItem('wu_apps', JSON.stringify(list)); }

function toast(text, type='success'){
  const t=document.querySelector('#toast'); if(!t) return;
  t.textContent=text; t.classList.remove('error'); if(type==='error') t.classList.add('error');
  t.style.display='block'; setTimeout(()=>t.style.display='none', 2600);
}
