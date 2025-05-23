if (document.getElementById('utopium-widget')) {
  console.debug('Utopium widget already initialised; skipping.');
} else {
  (() => {
    /* ──────────────────── Styles ──────────────────── */
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
.ut-bot{background:var(--bg-light);color:var(--text-sub)}
.ut-qr{display:inline-block;background:var(--bg-medium);color:#fff;padding:.3rem .7rem;border-radius:14px;margin:.25rem .2rem;font-size:.85rem;cursor:pointer}
@media (max-width:420px){
  #ut-window{width:92vw;height:78vh}
  #ut-launcher{width:56px;height:56px;font-size:1.5rem}
  .ut-msg{font-size:.9rem}
}`;
    document.head.appendChild(
      Object.assign(document.createElement('style'), { textContent: css })
    );

    /* ─────────────────── Mark-up ─────────────────── */
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div id="utopium-widget">
  <button id="ut-launcher" aria-label="Open chat">
    <img src="/img/utopium.png" alt="Chat icon"
         style="width:66%;height:66%;object-fit:contain;pointer-events:none">
  </button>
  <div id="ut-window" role="dialog" aria-modal="true" aria-label="Utopium Chat">
    <div id="ut-header">Utopium</div>
    <div id="ut-messages"></div>
    <div id="ut-input">
      <input id="ut-text" placeholder="Type here…" autocomplete="off">
      <button id="ut-send">➤</button>
    </div>
  </div>
</div>`
    );

    /* ────────────────── Constants / state ────────────────── */
    const API_ROOT    = 'https://api.feedutopia.com';
    const ACCOUNTS    = ['animeutopia','wrestleutopia','driftutopia','xputopia','critterutopia','cyberutopia'];
    const ARTIFACTS   = ['NEWS','TRAILER','FACT','THROWBACK','VS','Default'];
    const FIELD_STEPS = {account:0,'post type':1,title:2,subtitle:4,'highlight title':5,'highlight subtitle':6,'background type':7};
    const IMG_STEPS   = { prompt:0, askRef:1, file:2, gen:3 };

    let state = {
      /* post flow */
      step:-1,data:{},file:null,
      hasGreeted:false,restartPending:false,awaitYes:false,
      changePending:false,editing:null,skipHLSub:false,
      /* caption flow */
      gptMode:false,gptStep:-1,
      /* image flow */
      imgMode:false,imgStep:-1,imgPrompt:'',refFile:null
    };

    /* ───────── DOM refs ───────── */
    const $widget   = document.getElementById('utopium-widget');
    const $window   = $widget.querySelector('#ut-window');
    const $messages = $widget.querySelector('#ut-messages');
    const $launch   = $widget.querySelector('#ut-launcher');
    const $input    = $widget.querySelector('#ut-text');
    const $send     = $widget.querySelector('#ut-send');

    /* ───────── Persistence ───────── */
    const savedState   = localStorage.getItem('utopium-state');
    const savedHistory = localStorage.getItem('utopium-history');
    if (savedState && savedHistory) {
      try { state = JSON.parse(savedState); } catch {}
      $messages.innerHTML = savedHistory;
    }
    const persist = () => {
      localStorage.setItem('utopium-state', JSON.stringify(state));
      localStorage.setItem('utopium-history', $messages.innerHTML);
    };

    /* ───────── Helpers ───────── */
    const bubble = (html, cls) => {
      const el = Object.assign(document.createElement('div'), {
        className: `ut-msg ${cls}`,
        innerHTML: html
      });
      $messages.appendChild(el);
      $messages.scrollTop = $messages.scrollHeight;
      persist();
      return el;
    };
    const bot  = msg => bubble(msg, 'ut-bot');
    const user = msg => bubble(msg, 'ut-user');
    const quickReplies = opts => {
      const frag = document.createDocumentFragment();
      opts.forEach(o => {
        const span = document.createElement('span');
        span.textContent = o;
        span.className = 'ut-qr';
        span.onclick = () => acceptInput(o);
        frag.appendChild(span);
      });
      bubble('').appendChild(frag);
    };

    /* ─────── Prompts (post flow) ─────── */
    const askAccount   = ()=>{ bot('What account are we posting to?'); quickReplies(ACCOUNTS); };
    const askArtifact  = ()=>{ bot('What type of post is this?'); quickReplies(ARTIFACTS.map(a=>a.toLowerCase())); };
    const askTitle     = ()=> bot('What’s the <em>main title</em>?');
    const askSubtitleYN= ()=>{ bot('Add a subtitle?'); quickReplies(['yes','no']); };
    const askSubtitle  = ()=> bot('What subtitle?');
    const askHLTitle   = ()=> bot('Comma-separated <em>highlight</em> words for title.');
    const askHLSub     = ()=> bot('Highlight words for subtitle');
    const askBgType    = ()=>{ bot('Background: <strong>photo</strong> or <strong>video</strong>?'); quickReplies(['photo','video']); };

    /* ─────── Prompts (image flow) ─────── */
    const askImgPrompt = ()=> bot('What should the image depict?');
    const askRefYN     = ()=>{ bot('Attach a reference image?'); quickReplies(['yes','no']); };
    const askRefFile   = ()=> chooseFile(f=>{ state.refFile = f; afterImgStep(); });

    /* ─────── Drag-&-drop helper ─────── */
    function chooseFile(cb){
      const drop = document.createElement('div');
      Object.assign(drop.style, {
        border:'2px dashed #999', padding:'1.5rem', borderRadius:'12px',
        textAlign:'center', marginTop:'.5rem', cursor:'pointer'
      });
      drop.textContent = 'Drop file here or click to browse';
      const inp = Object.assign(document.createElement('input'), { type:'file', style:'display:none' });
      inp.onchange = ()=>{ if(inp.files.length) cb(inp.files[0]); };
      drop.onclick = ()=> inp.click();
      drop.ondragover = e => { e.preventDefault(); drop.style.borderColor='#ec008c'; drop.style.background='#333'; };
      drop.ondragleave = ()=> { drop.style.borderColor='#999'; drop.style.background=''; };
      drop.ondrop = e => { e.preventDefault(); if(e.dataTransfer.files.length) cb(e.dataTransfer.files[0]); };
      const wrap = bubble('');
      wrap.appendChild(drop);
      wrap.appendChild(inp);
    }

    /* ─────── GPT caption call ─────── */
    const askContext = ()=> bot('Paste your news here for an IG caption');
    async function callGptCaption(){
      bot('Generating caption…');
      try {
        const res = await fetch(`${API_ROOT}/gpt/ig-caption`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({context: state.data.context})
        });
        if(!res.ok) throw new Error(`backend ${res.status}`);
        const {text} = await res.json();
        bot(text.replace(/\n/g,'<br>'));
      } catch(err){
        bot(`<i>Error:</i> ${err.message}`);
      } finally {
        state.gptMode = false;
        bot('Anything else?');
        quickReplies(['create post','create instagram post title & description','create image']);
        persist();
      }
    }

    /* ─────── Image generation call ─────── */
    async function callImageGen(){
      bot('Generating image…');
      try {
        let refId;
        if(state.refFile) {
          // 1) get pre-signed URL
          const presign = await fetch(`${API_ROOT}/upload-url`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ filename: state.refFile.name, purpose:'img-ref' })
          });
          if(!presign.ok) throw new Error(`upload URL ${presign.status}`);
          const { uploadUrl, objectKey } = await presign.json();
          // 2) upload file
          await fetch(uploadUrl, { method:'PUT', body: state.refFile });
          refId = objectKey;
        }

        // choose model & size
        const useRef = Boolean(refId);
        const model  = useRef ? 'gpt-image-1' : 'dall-e-3';
        const size   = useRef ? '1024x1536' : '1024x1792';

        const payload = { prompt: state.imgPrompt, model, size };
        if(refId) payload.refImageId = refId;

        const res = await fetch(`${API_ROOT}/gpt/image-gen`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify(payload)
        });
        if(!res.ok) throw new Error(`backend ${res.status}`);
        const {url} = await res.json();
        bot(`<img src="${url}" style="width:100%;border-radius:12px" alt="Generated image">`);
      } catch(err){
        bot(`<i>Error:</i> ${err.message}`);
      } finally {
        Object.assign(state, {
          imgMode:false, imgStep:-1, imgPrompt:'', refFile:null
        });
        bot('Anything else?');
        quickReplies(['create post','create instagram post title & description','create image']);
        persist();
      }
    }

    /* ─────── File chooser (post background) ─────── */
    const askFile = ()=>{
      bot('Choose or drag your media file.');
      chooseFile(f=>{ state.file = f; afterSingleEdit(); });
    };

    /* ─────── Flow control ─────── */
    const steps   = [askAccount,askArtifact,askTitle,askSubtitleYN,askSubtitle,askHLTitle,askHLSub,askBgType,askFile,confirmAndSend];
    const gptFlow = [askContext,callGptCaption];

    const next           = ()=>{ steps[state.step++](); persist(); };
    const afterSingleEdit= ()=>{ state.editing = null; confirmAndSend(); };
    const startImageFlow = ()=>{ state.imgMode = true; state.imgStep = IMG_STEPS.prompt; askImgPrompt(); };
    const afterImgStep   = ()=>{ state.imgStep = IMG_STEPS.gen; callImageGen(); };

    /* ─────── Input dispatcher ─────── */
    function acceptInput(text){
      const tl = text.toLowerCase();

      // image flow
      if(state.imgMode){
        user(text);
        switch(state.imgStep){
          case IMG_STEPS.prompt:
            state.imgPrompt = text;
            state.imgStep   = IMG_STEPS.askRef;
            askRefYN();
            return;
          case IMG_STEPS.askRef:
            if(tl.startsWith('y')){
              state.imgStep = IMG_STEPS.file;
              askRefFile();
            } else {
              state.refFile = null;
              afterImgStep();
            }
            return;
        }
      }

      // caption flow
      if(state.gptMode){
        user(text);
        if(state.gptStep === 0){
          state.data.context = text;
          state.gptStep      = 1;
          gptFlow[1]();
        }
        return;
      }

      // edit fields, changePending, confirmations, restart… (same as your existing code)

      // initial prompt
      if(state.step === -1){
        user(text);
        if(['create image','make image','generate image'].includes(tl)){
          bot('Sure! Let’s create an image.');
          startImageFlow();
        } else if(['create post','make a post','create a post'].includes(tl)){
          bot('Great! Let’s get started.');
          state.step = 0;
          next();
        } else if(['create instagram post title & description','ig content'].includes(tl)){
          bot('Awesome! Let’s craft a killer caption.');
          state.gptMode  = true;
          state.gptStep  = 0;
          gptFlow[0]();
        } else {
          bot('What can I help you with?');
          quickReplies(['create post','create instagram post title & description','create image']);
        }
        return;
      }

      // main post flow
      user(text);
      switch(state.step - 1){
        case 0: state.data.account   = text; break;
        case 1: state.data.artifact  = text; break;
        case 2: state.data.title     = text; break;
        case 3:
          if(!tl.startsWith('y')){
            state.data.subtitle = 'skip';
            state.skipHLSub     = true;
            state.step++;
          }
          break;
        case 4:
          state.data.subtitle = tl==='skip' ? 'skip' : text;
          if(tl === 'skip') state.skipHLSub = true;
          break;
        case 5:
          state.data.hlTitle = text;
          if(state.skipHLSub){
            state.skipHLSub = false;
            state.step++;
          }
          break;
        case 6:
          state.data.hlSub = text;
          break;
        case 7:
          state.data.bgType = text;
          break;
      }
      next();
    }

    /* ─────── Summary, Publish, Utilities ─────── */
    function confirmAndSend(){
      const subtitle = state.data.subtitle==='skip'||!state.data.subtitle ? '(none)' : state.data.subtitle;
      const hlSub    = state.data.hlSub || '(none)';
      const summary  = `
<strong>Account:</strong> ${state.data.account}<br>
<strong>Post type:</strong> ${state.data.artifact}<br>
<strong>Title:</strong> ${state.data.title}<br>
<strong>Subtitle:</strong> ${subtitle}<br>
<strong>Background type:</strong> ${state.data.bgType}<br>
<strong>Highlight words (title):</strong> ${state.data.hlTitle}<br>
<strong>Highlight words (subtitle):</strong> ${hlSub}<br><br>
Ready to publish?`;
      bot(summary);
      quickReplies(['yes','no']);
      state.awaitYes = true;
      persist();
    }

    async function publish(){
      // your existing publish logic
    }

    function resetChat(){
      $messages.innerHTML = '';
      state = {
        step:-1,data:{},file:null,
        hasGreeted:false,restartPending:false,awaitYes:false,
        changePending:false,editing:null,skipHLSub:false,
        gptMode:false,gptStep:-1,
        imgMode:false,imgStep:-1,imgPrompt:'',refFile:null
      };
    }

    /* ───────── UI wiring ───────── */
    $launch.onclick = ()=>{
      const open = getComputedStyle($window).display !== 'none';
      $window.style.display = open ? 'none' : 'flex';
      if(!open && !state.hasGreeted){
        bot('Hi there! What can I help you with?');
        quickReplies(['create post','create instagram post title & description','create image']);
        state.hasGreeted = true;
        persist();
      }
    };
    $send.onclick = ()=> processText();
    $input.onkeypress = e => { if(e.key === 'Enter') processText(); };
    function processText(){
      const t = $input.value.trim();
      if(!t) return;
      $input.value = '';
      acceptInput(t);
    }
  })();
}
