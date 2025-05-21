// utopium-widget.js  –  single‑instance, persistent

// 0. Skip if already injected
if (document.getElementById('utopium-widget')) {
  console.debug('Utopium widget already initialised; skipping.');
} else {

/* ─────────────────────────────────────────────────────────
   Everything is wrapped in an IIFE so we don’t leak globals
   ───────────────────────────────────────────────────────── */
(function(){

/* ───── 1. Styles ─────────────────────────────────────── */
const css = `
  #utopium-widget{position:fixed;bottom:clamp(12px,4vw,20px);right:clamp(12px,4vw,20px);z-index:9999;font-family:system-ui,sans-serif}
  #ut-launcher{background:var(--accent);color:#fff;border:none;width:clamp(48px,14vw,64px);height:clamp(48px,14vw,64px);border-radius:50%;box-shadow:0 4px 12px rgba(0,0,0,.4);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.75rem}
  #ut-window{display:none;flex-direction:column;width:min(90vw,360px);height:min(80vh,520px);background:var(--bg-dark);border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.6)}
  #ut-header{background:var(--accent);border-radius:14px 14px 0 0;padding:.9rem 1.2rem;font-weight:700;color:#fff}
  #ut-messages{flex:1;overflow-y:auto;padding:1rem 1rem .5rem}
  #ut-input{display:flex;padding:.5rem;border-top:1px solid var(--bg-medium)}
  #ut-input input{flex:1;border:none;border-radius:8px 0 0 8px;padding:.55rem .8rem;background:var(--bg-medium);color:var(--text-main);font-size:1rem}
  #ut-input button{border:none;border-radius:0 8px 8px 0;background:var(--accent-light);font-weight:600;padding:.55rem 1rem;cursor:pointer}
  .ut-msg{max-width:88%;margin:.35rem 0;padding:.55rem .75rem;border-radius:18px;font-size:.95rem;line-height:1.35}
  .ut-user{background:#555;color:#fff;margin-left:auto}
  .ut-bot {background:var(--bg-light);color:var(--text-sub)}
  .ut-qr{display:inline-block;background:var(--bg-medium);color:#fff;padding:.3rem .7rem;border-radius:14px;margin:.25rem .2rem;font-size:.85rem;cursor:pointer}
  @media(max-width:420px){
    #ut-window{width:92vw;height:78vh}
    #ut-launcher{width:56px;height:56px;font-size:1.5rem}
    .ut-msg{font-size:.9rem}
  }
`;
document.head.appendChild(Object.assign(document.createElement('style'),{textContent:css}));

/* ───── 2. Mark‑up ────────────────────────────────────── */
document.body.insertAdjacentHTML('beforeend',`
  <div id="utopium-widget">
    <button id="ut-launcher" aria-label="Open chat">
      <img src="/img/utopium.png" alt="Chat icon"
           style="width:66%;height:66%;object-fit:contain;pointer-events:none;">
    </button>
    <div id="ut-window" role="dialog" aria-modal="true" aria-label="Utopium Chat">
      <div id="ut-header">Utopium</div>
      <div id="ut-messages"></div>
      <div id="ut-input">
        <input id="ut-text" placeholder="Type here…" autocomplete="off">
        <button id="ut-send">➤</button>
      </div>
    </div>
  </div>`);

/* ───── 3. Constants & state ─────────────────────────── */
const API_ROOT  = "https://api.feedutopia.com";
const ACCOUNTS  = ["animeutopia","wrestleutopia","driftutopia","xputopia","critterutopia","cyberutopia"];
const ARTIFACTS = ["NEWS","TRAILER","FACT","THROWBACK","VS","Default"];

const FIELD_STEPS = {
  account:               0,
  type:                  1,
  title:                 2,
  subtitle:              3,
  "highlight title":     4,
  "highlight subtitle":  5,
  "background type":     6
};

let state = {
  step: -1,
  data: {},
  hasGreeted: false,
  restartPending: false,
  awaitYes: false,
  changePending: false,
  editing: null,          // ← NEW: which single field is being edited?
  file: null
};

/* ───── 4. DOM refs ──────────────────────────────────── */
const $widget   = document.getElementById('utopium-widget');
const $window   = $widget.querySelector('#ut-window');
const $messages = $widget.querySelector('#ut-messages');
const $launch   = $widget.querySelector('#ut-launcher');
const $input    = $widget.querySelector('#ut-text');
const $send     = $widget.querySelector('#ut-send');

/* ───── 5. Persistence helpers ───────────────────────── */
const savedState   = localStorage.getItem('utopium-state');
const savedHistory = localStorage.getItem('utopium-history');
if (savedState && savedHistory) {
  try { state = JSON.parse(savedState); } catch {}
  $messages.innerHTML = savedHistory;
}
const persist = () => {
  localStorage.setItem('utopium-state',   JSON.stringify(state));
  localStorage.setItem('utopium-history', $messages.innerHTML);
};

window.addEventListener('beforeunload', () => {
  localStorage.removeItem('utopium-state');
  localStorage.removeItem('utopium-history');
});

/* ───── 6. Message helpers ───────────────────────────── */
const bubble = (html, cls) => {
  const d = Object.assign(document.createElement('div'), {className:`ut-msg ${cls}`, innerHTML:html});
  $messages.appendChild(d);
  $messages.scrollTop = $messages.scrollHeight;
  persist();
  return d;
};
const bot  = msg => bubble(msg,'ut-bot');
const user = msg => bubble(msg,'ut-user');
const quickReplies = opts => {
  const frag=document.createDocumentFragment();
  opts.forEach(o=>{
    const span=document.createElement('span');
    span.textContent=o; span.className='ut-qr'; span.onclick=()=>acceptInput(o);
    frag.appendChild(span);
  });
  bubble('').appendChild(frag);
};

/* ───── 7. Question functions ───────────────────────── */
function askAccount()   { bot('Hi there! What account are we posting to?');           quickReplies(ACCOUNTS); }
function askArtifact()  { bot('What type of post is this?');                          quickReplies(ARTIFACTS.map(a=>a.toLowerCase())); }
function askTitle()     { bot('Cool ✨ What’s the <em>main title</em>?'); }
function askSubtitle()  { bot('Optional subtitle (or just type skip).'); }
function askHLTitle()   { bot('Comma‑separated <em>highlight</em> words for title.'); }
function askHLSub()     { bot('Highlight words for subtitle (optional).'); }
function askBgType()    { bot('Is your background a <strong>photo</strong> or <strong>video</strong>?'); quickReplies(['photo','video']); }

function askFile(){
  bot('Please choose or drag in the media file.');
  const drop=document.createElement('div');
  Object.assign(drop.style,{border:'2px dashed #999',padding:'1.5rem',borderRadius:'12px',textAlign:'center',marginTop:'.5rem',cursor:'pointer'});
  drop.textContent='Drop file here or click to browse';
  const inp=Object.assign(document.createElement('input'),{type:'file',style:'display:none'});
  inp.onchange=()=>{ if(inp.files.length){ state.file=inp.files[0]; afterSingleEdit(); } };

  drop.onclick   =()=>inp.click();
  drop.ondragover=e=>{ e.preventDefault(); drop.style.borderColor='#ec008c'; drop.style.background='#333'; };
  drop.ondragleave=()=>{ drop.style.borderColor='#999'; drop.style.background=''; };
  drop.ondrop    =e=>{ e.preventDefault(); if(e.dataTransfer.files.length){ state.file=e.dataTransfer.files[0]; afterSingleEdit(); } };

  const wrap=bubble('');
  wrap.appendChild(drop);
  wrap.appendChild(inp);
}

/* ───── 8. Flow helpers ─────────────────────────────── */
const steps=[askAccount,askArtifact,askTitle,askSubtitle,askHLTitle,askHLSub,askBgType,askFile,confirmAndSend];
const next=()=>{ steps[state.step++](); persist(); };
const jumpTo=idx=>{ state.step=idx; next(); };

/* ─── helper: after editing ONE field, go back to summary ── */
function afterSingleEdit(){
  state.editing=null;
  confirmAndSend();
}

/* ───── 9. Main acceptInput dispatcher ───────────────── */
function acceptInput(text){
  const tl=text.toLowerCase();

  /* If we're currently editing a single field */
  if(state.editing){
    user(text);
    switch(state.editing){
      case 'account':              state.data.account  = text; afterSingleEdit(); return;
      case 'type':                 state.data.artifact = text; afterSingleEdit(); return;
      case 'title':                state.data.title    = text; afterSingleEdit(); return;
      case 'subtitle':             state.data.subtitle = text; afterSingleEdit(); return;
      case 'highlight title':      state.data.hlTitle  = text; afterSingleEdit(); return;
      case 'highlight subtitle':   state.data.hlSub    = text; afterSingleEdit(); return;
      case 'background type':
        state.data.bgType=text;    askFile();                 return;            // after file selection we call afterSingleEdit()
    }
  }

  /* change‑pending (“What would you like to change?”) */
  if(state.changePending){
    user(text);
    state.changePending=false;

    if(tl==='restart'){
      resetChat(); state.hasGreeted=true;
      bot('What can I help you with?'); quickReplies(['create post']);
      return;
    }
    const idxName = Object.keys(FIELD_STEPS).find(k=>k===tl);
    if(!idxName){
      bot('Sorry, I didn’t catch that. Which part should I change?');
      quickReplies([...Object.keys(FIELD_STEPS),'restart']);
      state.changePending=true; return;
    }

    /* Set editing mode & re‑ask only that question */
    state.editing=idxName;
    switch(idxName){
      case 'account':             askAccount();  break;
      case 'type':                askArtifact(); break;
      case 'title':               askTitle();    break;
      case 'subtitle':            askSubtitle(); break;
      case 'highlight title':     askHLTitle();  break;
      case 'highlight subtitle':  askHLSub();    break;
      case 'background type':     askBgType();   break;
    }
    return;
  }

  /* Await Yes/No on publish */
  if(state.awaitYes){
    user(text);
    state.awaitYes=false;
    if(tl.startsWith('y')){ publish(); }
    else{
      bot('No problem! What would you like to change?');
      quickReplies([...Object.keys(FIELD_STEPS),'restart']);
      state.changePending=true; persist();
    }
    return;
  }

  /* Restart confirmation */
  if(state.restartPending){
    user(text);
    if(tl==='yes'){ resetChat(); state.hasGreeted=true; bot('What can I help you with?'); quickReplies(['create post']); }
    else{ state.restartPending=false; (state.step>0?steps[state.step-1]:bot('What can I help you with?')); if(state.step<=0)quickReplies(['create post']); }
    return;
  }

  /* Manual “restart” */
  if(tl==='restart'){
    user(text);
    bot('Are you sure you want to restart the conversation?'); quickReplies(['yes','no']);
    state.restartPending=true; persist(); return;
  }

  /* Flow not started */
  if(state.step===-1){
    user(text);
    if(['create post','create a post','make post','make a post'].includes(tl)){
      bot('Great! Let’s get started.'); state.step=0; next();
    }else{ bot('What can I help you with?'); quickReplies(['create post']); }
    return;
  }

  /* Normal flow */
  user(text);
  switch(state.step-1){
    case 0: state.data.account  = text; break;
    case 1: state.data.artifact = text; break;
    case 2: state.data.title    = text; break;
    case 3:
      state.data.subtitle=text;
      if(tl==='skip'){ state.step++; next(); return; }
      break;
    case 4: state.data.hlTitle  = text; break;
    case 5: state.data.hlSub    = text; break;
    case 6: state.data.bgType   = text; break;
  }
  next();
}

/* ───── 10. Ready‑to‑publish summary ─────────────────── */
function confirmAndSend(){
  const subtitle=(state.data.subtitle==='skip'||!state.data.subtitle)?'(none)':state.data.subtitle;
  const hlSub   =state.data.hlSub||'(none)';
  const summary =`
    <strong>Account:</strong> ${state.data.account}<br>
    <strong>Post type:</strong> ${state.data.artifact}<br>
    <strong>Title:</strong> ${state.data.title}<br>
    <strong>Subtitle:</strong> ${subtitle}<br>
    <strong>Background type:</strong> ${state.data.bgType}<br>
    <strong>Highlight&nbsp;words&nbsp;(title):</strong> ${state.data.hlTitle}<br>
    <strong>Highlight&nbsp;words&nbsp;(subtitle):</strong> ${hlSub}<br><br>
    Ready to publish?`;
  bot(summary); quickReplies(['yes','no']);
  state.awaitYes=true; persist();
}

/* ───── 11. Publish logic (unchanged) ───────────────── */
async function publish(){
  try{
    bot('Getting upload URL…');
    let res=await fetch(`${API_ROOT}/upload-url`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mediaType:state.data.bgType})});
    if(!res.ok) throw new Error('upload-url failed');
    const {url,key}=await res.json();

    bot('Uploading to S3…');
    res=await fetch(url,{method:'PUT',body:state.file});
    if(!res.ok) throw new Error('S3 upload failed');

    bot('Calling FeedUtopia backend…');
    const payload={
      accountName:state.data.account,
      title:state.data.title,
      description:state.data.subtitle==='skip'?'':state.data.subtitle,
      highlightWordsTitle:state.data.hlTitle,
      highlightWordsDescription:state.data.hlSub,
      backgroundType:state.data.bgType,
      spinningArtifact:state.data.artifact,
      key
    };
    res=await fetch(`${API_ROOT}/submit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    bot(`<code>${await res.text()}</code>`);

    state.step=-1; state.data={}; state.file=null; persist();
    bot('✅ Post created! What else may I help you with?'); quickReplies(['create post']);
  }catch(err){ bot(`<i>Error:</i> ${err.message}`); }
}

/* ───── 12. Reset helper ─────────────────────────────── */
function resetChat(){
  $messages.innerHTML=''; state.step=-1; state.data={};
  state.awaitYes=false; state.changePending=false;
  state.editing=null; state.file=null; state.restartPending=false;
}

/* ───── 13. UI wiring ───────────────────────────────── */
$launch.onclick=()=>{
  const open=getComputedStyle($window).display!=='none';
  $window.style.display=open?'none':'flex';
  if(!open&&!state.hasGreeted){
    bot('👋 Hi there! What can I help you with?'); quickReplies(['create post']);
    state.hasGreeted=true; persist();
  }
};
$send.onclick=()=>processText();
$input.onkeypress=e=>{ if(e.key==='Enter')processText(); };
const processText=()=>{ const t=$input.value.trim(); if(t){ $input.value=''; acceptInput(t); } };

})(); // IIFE end

} // single‑instance guard end
