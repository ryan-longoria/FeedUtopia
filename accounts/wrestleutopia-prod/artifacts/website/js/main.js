
document.addEventListener('DOMContentLoaded', () => {
  const {talent, tryouts} = loadDB();

  // Nav highlighting
  const path = location.pathname.split('/').pop();
  document.querySelectorAll('.nav-links a').forEach(a=>{
    if(a.getAttribute('href') === path || (path==='' && a.getAttribute('href')==='index.html')){
      a.classList.add('active');
    }
  });

  // Home: Tryouts preview
  const tryoutList = document.querySelector('#home-tryouts');
  if(tryoutList){
    tryouts.slice(0,6).forEach(t=>{
      const el = document.createElement('div');
      el.className='card';
      el.innerHTML = `<div class="badge">${t.status.toUpperCase()}</div>
        <h3 style="margin:6px 0 2px">${t.org}</h3>
        <div class="muted">${t.city} • ${new Date(t.date).toLocaleDateString()}</div>
        <p class="mt-3">${t.requirements}</p>
        <a class="btn small mt-3" href="tryouts.html#${t.id}">View</a>`;
      tryoutList.appendChild(el);
    });
  }

  // Home: Talent spotlight
  const spot = document.querySelector('#home-talent');
  if(spot){
    talent.slice(0,8).forEach(p=>{
      const el = document.createElement('div');
      el.className='card';
      el.innerHTML = `<div class="profile">
        <img src="${p.avatar}" alt="${p.ring} profile" />
        <div class="info">
          <div><strong>${p.ring}</strong> <span class="muted">(${p.name})</span></div>
          <div class="mt-2">${p.city} • ${p.years} yrs • ${p.styles.join(', ')}</div>
          <div class="mt-2">${p.verified_school?'<span class="badge">Verified school</span>':''}</div>
          <a class="btn small mt-3" href="talent.html#search">View profile</a>
        </div>
      </div>`;
      spot.appendChild(el);
    });
  }
});
