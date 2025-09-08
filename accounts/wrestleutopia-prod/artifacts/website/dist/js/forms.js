
// Handle forms and filtering

function serializeForm(form){
  const data = new FormData(form);
  const obj = {};
  for(const [k,v] of data.entries()){
    if(obj[k]){
      if(Array.isArray(obj[k])) obj[k].push(v);
      else obj[k] = [obj[k], v];
    } else {
      obj[k]=v;
    }
  }
  return obj;
}

// Talent submission
document.addEventListener('DOMContentLoaded', () => {
  const db = loadDB();

  const talentForm = document.querySelector('#talent-form');
  if(talentForm){
    talentForm.addEventListener('submit', (e)=>{
      e.preventDefault();
      const o = serializeForm(talentForm);
      const id = 't' + (Date.now());
      const rec = {
        id, name:o.name, ring:o.ring, city:o.city, travel:parseInt(o.travel||'100'),
        height_cm:parseInt(o.height_cm||'0'), weight_kg:parseInt(o.weight_kg||'0'),
        styles:(Array.isArray(o.styles)?o.styles:[o.styles]).filter(Boolean),
        reel:o.reel, school:o.school, years:parseInt(o.years||'0'), verified_school:false,
        rate_min:parseInt(o.rate_min||'0'), rate_max:parseInt(o.rate_max||'0'),
        avatar:'https://picsum.photos/seed/' + encodeURIComponent(o.ring||o.name) + '/200/200'
      };
      db.talent.unshift(rec); saveTalent(db.talent);
      toast('Talent profile created!');
      talentForm.reset();
      renderTalent(db.talent);
    });
  }

  // Tryout post
  const tryoutForm = document.querySelector('#tryout-form');
  if(tryoutForm){
    tryoutForm.addEventListener('submit', (e)=>{
      e.preventDefault();
      const o = serializeForm(tryoutForm);
      const id = 'y' + (Date.now());
      const rec = {id, org:o.org, city:o.city, date:o.date, slots:parseInt(o.slots||'0'), requirements:o.requirements, contact:o.contact, status:'open'};
      db.tryouts.unshift(rec); saveTryouts(db.tryouts);
      toast('Tryout posted!');
      tryoutForm.reset();
      renderTryouts(db.tryouts);
    });
  }

  // Applications handler (from tryouts page)
  const appForm = document.querySelector('#apply-form');
  if(appForm){
    appForm.addEventListener('submit', (e)=>{
      e.preventDefault();
      const o = serializeForm(appForm);
      const id = 'a' + (Date.now());
      const rec = { id, tryout_id:o.tryout_id, ring:o.ring, name:o.name, reel:o.reel, notes:o.notes||'', created_at:new Date().toISOString() };
      db.apps.unshift(rec); saveApps(db.apps);
      toast('Application sent to promoter!');
      appForm.reset();
      const modal = document.querySelector('#apply-modal'); if(modal) modal.close();
      renderApps && renderApps(db.apps);
    });
  }

  // Talent filtering/search
  const searchForm = document.querySelector('#talent-search');
  if(searchForm){
    const onFilter = ()=>{
      const o = serializeForm(searchForm);
      let list = [...db.talent];
      if(o.q){
        const q = o.q.toLowerCase();
        list = list.filter(x => (x.ring + ' ' + x.name + ' ' + x.city + ' ' + x.styles.join(' ')).toLowerCase().includes(q));
      }
      if(o.style && o.style!=='any') list = list.filter(x => x.styles.includes(o.style));
      if(o.city) list = list.filter(x => x.city.toLowerCase().includes(o.city.toLowerCase()));
      if(o.verified==='true') list = list.filter(x => x.verified_school);
      renderTalent(list);
    };
    ['input','change'].forEach(evt=>searchForm.addEventListener(evt, onFilter));
    onFilter();
  }

  // Tryouts listing
  if(document.querySelector('#tryout-list')){
    renderTryouts(db.tryouts);
    // Deep link
    if(location.hash){
      const id = location.hash.substring(1);
      const el = document.querySelector(`[data-tryout-id="${id}"]`);
      if(el) el.scrollIntoView({behavior:'smooth'});
    }
  }

  // Applications list (if present)
  if(document.querySelector('#app-list')){
    renderApps(db.apps);
  }
});

function renderTalent(list){
  const target = document.querySelector('#talent-list');
  if(!target) return;
  target.innerHTML = '';
  list.forEach(p=>{
    const el = document.createElement('div');
    el.className='card';
    el.innerHTML = `<div class="profile">
      <img src="${p.avatar}" alt="${p.ring} profile"/>
      <div class="info">
        <div><strong>${p.ring}</strong> <span class="muted">(${p.name})</span></div>
        <div class="mt-2">${p.city} • ${p.years} yrs • ${p.styles.join(', ')}</div>
        <div class="mt-2">${p.verified_school?'<span class="badge">Verified school</span>':''}</div>
        <div class="mt-2 muted">Rate: $${p.rate_min}-${p.rate_max}</div>
        <a class="btn small mt-3" href="${p.reel}" target="_blank" rel="noopener">View Reel</a>
      </div>
    </div>`;
    target.appendChild(el);
  });
}

function renderTryouts(list){
  const target = document.querySelector('#tryout-list');
  if(!target) return;
  target.innerHTML='';
  list.forEach(t=>{
    const el = document.createElement('div');
    el.className='card';
    el.dataset.tryoutId = t.id;
    el.innerHTML = `<div class="badge">${t.status.toUpperCase()}</div>
      <h3 style="margin:6px 0 2px">${t.org}</h3>
      <div class="muted">${t.city} • ${new Date(t.date).toLocaleDateString()}</div>
      <p class="mt-3">${t.requirements}</p>
      <div class="mt-3">
        <button class="btn small" onclick="openApply('${t.id}','${t.org}')">Apply</button>
        <span class="muted" style="margin-left:10px">Slots: ${t.slots}</span>
      </div>`;
    target.appendChild(el);
  });
}

function renderApps(list){
  const target = document.querySelector('#app-list');
  if(!target) return;
  target.innerHTML='';
  list.forEach(a=>{
    const el = document.createElement('div');
    el.className='card';
    el.innerHTML = `<div><strong>${a.ring}</strong> <span class="muted">(${a.name})</span></div>
      <div class="mt-2"><a href="${a.reel}" target="_blank" rel="noopener">Reel</a> • <span class="muted">${new Date(a.created_at).toLocaleString()}</span></div>
      <div class="mt-2">${a.notes?a.notes:''}</div>`;
    target.appendChild(el);
  });
}

function openApply(id, org){
  const f = document.querySelector('#apply-form');
  f.tryout_id.value=id;
  const title = document.querySelector('#apply-title');
  if(title) title.textContent = 'Apply to ' + org;
  const modal=document.querySelector('#apply-modal'); modal.showModal();
}
