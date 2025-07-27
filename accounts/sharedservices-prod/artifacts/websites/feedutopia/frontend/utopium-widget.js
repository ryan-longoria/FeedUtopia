/* Utopium widget (reel + carousel with per‑slide fields) */
if (document.getElementById('utopium-widget')) {
  console.debug('Utopium widget already initialised; skipping.');
} else {
  (() => {
    /* ─────────────────── Styles ─────────────────── */
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

    /* ─────────────────── Mark‑up ─────────────────── */
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
    const ACCOUNTS    = ['animeutopia','wrestleutopia','driftutopia','xputopia','critterutopia','cyberutopia','flixutopia'];
    const ARTIFACTS   = ['NEWS','TRAILER','FACT','THROWBACK','VS','Default'];
    const IMG_STEPS   = { prompt:0, askRef:1, file:2, gen:3 };
    const MAX_SLIDES  = 20;

    const SLIDE_PHASE = {
      title: 'title',
      subtitleYN: 'subtitleYN',
      subtitle: 'subtitle',
      hlTitle: 'hlTitle',
      hlSub: 'hlSub',
      bgType: 'bgType',
      file: 'file',
      confirmAdd: 'confirmAdd'
    };

    let state = {
      step:-1,
      data:{},
      file:null,
      multiMode:false,

      slides:[],
      slideIndex:0,
      slidePhase:null,
      slideDraft:null,

      awaitYes:false,

      hasGreeted:false,
      restartPending:false,
      changePending:false,
      editing:null,
      skipHLSub:false,

      gptMode:false, gptStep:-1,
      imgMode:false, imgStep:-1, imgPrompt:'', refFile:null
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
      try {
        const tmp = JSON.parse(savedState);
        state = { ...state, ...tmp, file:null, refFile:null, slideDraft:null };
        if (!Array.isArray(state.slides)) state.slides = [];
      } catch {}
      $messages.innerHTML = savedHistory;
    }

    const persist = () => {
      const slidesSafe = (state.slides || []).map(s => {
        const { file, ...rest } = s || {};
        return rest;
      });
      const { file, refFile, slides, slideDraft, ...rest } = state;
      const draftSafe = slideDraft ? (({ file, ...r }) => r)(slideDraft) : null;
      const serializable = { ...rest, slides: slidesSafe, slideDraft: draftSafe };
      localStorage.setItem('utopium-state', JSON.stringify(serializable));
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

    function chooseFile(cb){
      const drop = document.createElement('div');
      Object.assign(drop.style, {
        border:'2px dashed #999', padding:'1.5rem', borderRadius:'12px',
        textAlign:'center', marginTop:'.5rem', cursor:'pointer'
      });
      drop.textContent = 'Drop file here or click to browse';
      const inp = Object.assign(document.createElement('input'), { type:'file', style:'display:none' });
      inp.onchange = () => { if (inp.files.length) cb(inp.files[0]); };
      drop.onclick    = () => inp.click();
      drop.ondragover = e => { e.preventDefault(); drop.style.borderColor='#ec008c'; drop.style.background='#333'; };
      drop.ondragleave= () => { drop.style.borderColor='#999'; drop.style.background=''; };
      drop.ondrop     = e => { e.preventDefault(); if (e.dataTransfer.files.length) cb(e.dataTransfer.files[0]); };
      const wrap = bubble('');
      wrap.appendChild(drop);
      wrap.appendChild(inp);
    }

    /* ─────── Top-level prompts ─────── */
    const askAccount  = () => { bot('What account are we posting to?'); quickReplies(ACCOUNTS); };
    const askFormat   = () => { bot('What format do you want to create?'); quickReplies(['reel','carousel']); };
    const askArtifact = () => { bot('What type of post is this?'); quickReplies(ARTIFACTS.map(a=>a.toLowerCase())); };

    // Reel prompts
    const askTitle      = () => bot('What is the main title?');
    const askSubtitleYN = () => { bot('Add a subtitle?'); quickReplies(['yes','no']); };
    const askSubtitle   = () => bot('What subtitle?');
    const askHLTitle    = () => bot('Comma-separated highlight words for the title.');
    const askHLSub      = () => bot('Highlight words for the subtitle.');
    const askBgType     = () => { bot('Background: photo or video?'); quickReplies(['photo','video']); };
    const askFile       = () => { bot('Choose or drag your media file.'); chooseFile(f=>{ state.file = f; afterSingleEdit(); }); };

    /* ─────── Carousel per-slide prompts ─────── */
    const askSlideTitle    = n => bot(`Slide ${n}: title?`);
    const askSlideSubYN    = () => { bot('Add a subtitle?'); quickReplies(['yes','no']); };
    const askSlideSubtitle = () => bot('Subtitle text?');
    const askSlideHLTitle  = () => bot('Highlight words for the title (comma-separated).');
    const askSlideHLSub    = () => bot('Highlight words for the subtitle.');
    const askSlideBgType   = () => { bot('Background for this slide: photo or video?'); quickReplies(['photo','video']); };
    const askSlideFile     = n => { bot(`Slide ${n}: choose or drag your media file.`); chooseFile(f=>{ state.file = f; afterSlideFilePicked(); }); };
    const askAddAnother    = n => { bot(`Add another slide? You have ${n} so far.`); quickReplies(['yes','no']); };

    function beginSlide(n){
      state.slideIndex = n - 1;
      state.slideDraft = { index:n, title:'', subtitle:'', hlTitle:'', hlSub:'', bgType:'', file:null, s3Key:null };
      state.slidePhase = SLIDE_PHASE.title;
      askSlideTitle(n);
      persist();
    }

    function afterSlideFilePicked(){
      if (!(state.file instanceof File) || state.file.size < 100_000) {
        bot('<i>The selected file is missing or too small. Please choose it again.</i>');
        askSlideFile(state.slideIndex + 1);
        return;
      }
      state.slideDraft.file = state.file;
      state.file = null;
      state.slidePhase = SLIDE_PHASE.confirmAdd;
      askAddAnother(state.slides.length + 1);
      persist();
    }

    function pushSlide(){
      const d = state.slideDraft;
      if (!d || !d.title || !d.bgType || !d.file) {
        bot('<i>Slide is incomplete. Need title, background type, and a media file.</i>');
        if (!d.title) { state.slidePhase = SLIDE_PHASE.title; askSlideTitle(d.index); }
        else if (!d.bgType) { state.slidePhase = SLIDE_PHASE.bgType; askSlideBgType(); }
        else { state.slidePhase = SLIDE_PHASE.file; askSlideFile(d.index); }
        return false;
      }
      state.slides.push({ ...d });
      state.slideDraft = null;
      state.slidePhase = null;
      return true;
    }

    /* ─────── GPT caption & image-gen ─────── */
    const askContext = () => bot('Paste your news here for an IG caption');
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

    async function callImageGen(){
      bot('Generating image…');
      try {
        let refId;
        if(state.refFile) {
          const presign = await fetch(`${API_ROOT}/upload-url`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ filename: state.refFile.name, purpose:'img-ref' })
          });
          if(!presign.ok) throw new Error(`upload URL ${presign.status}`);
          const { url: uploadUrl, objectKey } = await presign.json();
          await fetch(uploadUrl, { method:'PUT', body: state.refFile });
          refId = objectKey;
        }

        const model = 'dall-e-3';
        const size = '1024x1024';
        const payload = { prompt: state.imgPrompt, model, size };
        if (refId) payload.refImageId = refId;

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
        Object.assign(state, { imgMode:false, imgStep:-1, imgPrompt:'', refFile:null });
        bot('Anything else?');
        quickReplies(['create post','create instagram post title & description','create image']);
        persist();
      }
    }

    /* ─────── Flow control ─────── */
    const steps = [askAccount, askFormat, askArtifact, askTitle, askSubtitleYN, askSubtitle, askHLTitle, askHLSub, askBgType, askFile, confirmAndSend];
    const gptFlow = [askContext, callGptCaption];

    const next           = () => { steps[state.step++](); persist(); };
    const afterSingleEdit= () => { state.editing = null; confirmAndSend(); };
    const startImageFlow = () => { state.imgMode = true; state.imgStep = IMG_STEPS.prompt; askImgPrompt(); };
    const afterImgStep   = () => { state.imgStep = IMG_STEPS.gen; callImageGen(); };

    /* ─────── Input dispatcher ─────── */
    function acceptInput(text){
      const tl = text.toLowerCase();

      // Final publish confirmation
      if (state.awaitYes) {
        user(text);
        state.awaitYes = false;
        persist();
        if (tl.startsWith('y')) {
          publish();
        } else {
          state.changePending = true;
          bot('Okay, what would you like to change?');
          quickReplies(['title','subtitle','highlight title','highlight subtitle','background','media file']);
        }
        return;
      }

      // Carousel slide FSM
      if (state.multiMode && state.slidePhase) {
        user(text);
        const d = state.slideDraft || {};
        switch (state.slidePhase) {
          case SLIDE_PHASE.title:
            d.title = text;
            state.slideDraft = d;
            state.slidePhase = SLIDE_PHASE.subtitleYN;
            askSlideSubYN();
            break;

          case SLIDE_PHASE.subtitleYN:
            if (tl.startsWith('y')) {
              state.slidePhase = SLIDE_PHASE.subtitle;
              askSlideSubtitle();
            } else {
              d.subtitle = '';
              state.slideDraft = d;
              state.slidePhase = SLIDE_PHASE.hlTitle;
              askSlideHLTitle();
            }
            break;

          case SLIDE_PHASE.subtitle:
            d.subtitle = text;
            state.slideDraft = d;
            state.slidePhase = SLIDE_PHASE.hlTitle;
            askSlideHLTitle();
            break;

          case SLIDE_PHASE.hlTitle:
            d.hlTitle = text;
            state.slideDraft = d;
            // FIX: if no subtitle, skip subtitle highlight and go to bgType
            if (!d.subtitle) {
              state.slidePhase = SLIDE_PHASE.bgType;
              askSlideBgType();
            } else {
              state.slidePhase = SLIDE_PHASE.hlSub;
              askSlideHLSub();
            }
            break;

          case SLIDE_PHASE.hlSub:
            d.hlSub = text;
            state.slideDraft = d;
            state.slidePhase = SLIDE_PHASE.bgType;
            askSlideBgType();
            break;

          case SLIDE_PHASE.bgType:
            d.bgType = tl;
            state.slideDraft = d;
            state.slidePhase = SLIDE_PHASE.file;
            askSlideFile(state.slideIndex + 1);
            break;

          case SLIDE_PHASE.confirmAdd:
            if (!pushSlide()) return;
            if (tl.startsWith('y')) {
              if (state.slides.length >= MAX_SLIDES) {
                bot(`You already have ${MAX_SLIDES} slides (maximum).`);
                confirmAndSend();
              } else {
                beginSlide(state.slides.length + 1);
              }
            } else {
              confirmAndSend();
            }
            break;

          default:
            if (state.slidePhase === SLIDE_PHASE.file) {
              askSlideFile(state.slideIndex + 1);
            }
        }
        persist();
        return;
      }

      // Image-gen flow
      if (state.imgMode) {
        user(text);
        switch (state.imgStep) {
          case IMG_STEPS.prompt:
            state.imgPrompt = text;
            state.imgStep   = IMG_STEPS.askRef;
            askRefYN();
            return;
          case IMG_STEPS.askRef:
            if (tl.startsWith('y')) {
              state.imgStep = IMG_STEPS.file;
              askRefFile();
            } else {
              state.refFile = null;
              afterImgStep();
            }
            return;
        }
      }

      // GPT caption flow
      if (state.gptMode) {
        user(text);
        if (state.gptStep === 0) {
          state.data.context = text;
          state.gptStep = 1;
          gptFlow[1]();
        }
        return;
      }

      // Initial
      if (state.step === -1) {
        user(text);
        if (['create image','make image','generate image'].includes(tl)) {
          bot('Sure! Let us create an image.');
          startImageFlow();
        } else if (['create post','make a post','create a post'].includes(tl)) {
          bot('Great! Let us get started.');
          state.step = 0;
          next();
        } else if (['create instagram post title & description','ig content'].includes(tl)) {
          bot('Awesome! Let us craft a caption.');
          state.gptMode = true;
          state.gptStep = 0;
          gptFlow[0]();
        } else {
          bot('What can I help you with?');
          quickReplies(['create post','create instagram post title & description','create image']);
        }
        return;
      }

      // Reel main steps
      user(text);
      switch (state.step - 1) {
        case 0: state.data.account = text; break;
        case 1: state.data.format = tl; state.multiMode = (tl === 'carousel'); break;
        case 2:
          state.data.artifact = text;
          if (state.multiMode) { beginSlide(1); return; }
          break;
        case 3: state.data.title = text; break;
        case 4:
          if (!tl.startsWith('y')) {
            state.data.subtitle = 'skip';
            state.skipHLSub = true;
            state.step++;
          }
          break;
        case 5:
          state.data.subtitle = tl === 'skip' ? 'skip' : text;
          if (tl === 'skip') state.skipHLSub = true;
          break;
        case 6:
          state.data.hlTitle = text;
          if (state.skipHLSub) { state.skipHLSub = false; state.step++; }
          break;
        case 7: state.data.hlSub = text; break;
        case 8: state.data.bgType = tl; break;
      }
      next();
    }

    /* ─────── Summary & publish ─────── */
    function confirmAndSend(){
      if (state.multiMode) {
        let summary = `
<strong>Account:</strong> ${state.data.account || ''}<br>
<strong>Format:</strong> carousel<br>
<strong>Post type:</strong> ${state.data.artifact || ''}<br>
<strong>Slides:</strong> ${state.slides.length}<br>`;
        state.slides.forEach((s, i) => {
          summary += `&nbsp;&nbsp;<strong>${i+1}.</strong> ${s.bgType}<br>
&nbsp;&nbsp;&nbsp;&nbsp;Title: ${s.title}<br>
&nbsp;&nbsp;&nbsp;&nbsp;Subtitle: ${s.subtitle || '(none)'}<br>
&nbsp;&nbsp;&nbsp;&nbsp;HL Title: ${s.hlTitle || '(none)'}<br>
&nbsp;&nbsp;&nbsp;&nbsp;HL Subtitle: ${s.hlSub || '(none)'}<br>`;
        });
        summary += '<br>Ready to publish?';
        bot(summary);
        quickReplies(['yes','no']);
        state.awaitYes = true;
        persist();
        return;
      }

      const subtitle = state.data.subtitle === 'skip' || !state.data.subtitle ? '(none)' : state.data.subtitle;
      const hlSub    = state.data.hlSub || '(none)';
      const summary  = `
<strong>Account:</strong> ${state.data.account}<br>
<strong>Format:</strong> reel<br>
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

    async function uploadSlideFile(slide) {
      const res1 = await fetch(`${API_ROOT}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaType: slide.bgType })
      });
      if (!res1.ok) throw new Error(`upload-url failed ${res1.status}`);
      const { url, objectKey } = await res1.json();

      const res2 = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': slide.file.type || 'application/octet-stream' },
        body: slide.file
      });
      if (!res2.ok) throw new Error(`S3 upload failed ${res2.status}`);
      slide.s3Key = objectKey;
    }

    async function publish() {
      try {
        if (state.multiMode) {
          if (!state.slides.length) {
            bot('<i>No slides provided. Please add at least one slide.</i>');
            beginSlide(1);
            return;
          }
          for (const [idx, slide] of state.slides.entries()) {
            if (!(slide.file instanceof File) || slide.file.size < 100_000) {
              bot(`<i>Slide ${idx+1} file is missing or too small. Please re-add it.</i>`);
              state.slideIndex = idx;
              state.slideDraft = { ...slide };
              state.slidePhase = SLIDE_PHASE.file;
              askSlideFile(idx + 1);
              return;
            }
          }

          bot('Uploading slide media to S3…');
          for (const slide of state.slides) await uploadSlideFile(slide);

          const s1 = state.slides[0];
          bot('Calling FeedUtopia backend…');
          const payload = {
            accountName: state.data.account,
            title: s1.title,
            description: s1.subtitle || '',
            highlightWordsTitle: s1.hlTitle || '',
            highlightWordsDescription: s1.hlSub || '',
            backgroundType: 'carousel',
            spinningArtifact: state.data.artifact,
            slides: state.slides.map(s => ({
              backgroundType: s.bgType,
              key: s.s3Key,
              title: s.title,
              description: s.subtitle || '',
              highlightWordsTitle: s.hlTitle || '',
              highlightWordsDescription: s.hlSub || ''
            }))
          };

          const res = await fetch(`${API_ROOT}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          bot(`<code>${await res.text()}</code>`);

          state = {
            ...state,
            step:-1, data:{}, file:null,
            multiMode:false, slides:[], slideIndex:0, slidePhase:null, slideDraft:null,
            awaitYes:false
          };
          persist();

          bot('✅ Carousel created! What else may I help you with?');
          quickReplies(['create post']);
          return;
        }

        // Reel
        if (!(state.file instanceof File) || state.file.size < 100_000) {
          bot('<i>The selected media file is missing or too small. Please reselect it.</i>');
          askFile();
          return;
        }

        bot('Getting upload URL…');
        let res = await fetch(`${API_ROOT}/upload-url`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({mediaType:state.data.bgType})
        });
        if (!res.ok) throw new Error('upload-url failed');
        const { url, objectKey } = await res.json();

        bot('Uploading to S3…');
        res = await fetch(url, {
          method:'PUT',
          headers:{'Content-Type': state.file.type || 'application/octet-stream'},
          body: state.file
        });
        if (!res.ok) throw new Error('S3 upload failed');

        bot('Calling FeedUtopia backend…');
        const payload = {
          accountName: state.data.account,
          title: state.data.title,
          description: state.data.subtitle==='skip' ? '' : state.data.subtitle,
          highlightWordsTitle: state.data.hlTitle,
          highlightWordsDescription: state.data.hlSub,
          backgroundType: state.data.bgType,
          spinningArtifact: state.data.artifact,
          key: objectKey
        };
        res = await fetch(`${API_ROOT}/submit`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload)
        });
        bot(`<code>${await res.text()}</code>`);

        state = { ...state, step:-1, data:{}, file:null, awaitYes:false };
        persist();

        bot('✅ Post created! What else may I help you with?');
        quickReplies(['create post']);
      } catch (err) {
        bot(`<i>Error:</i> ${err.message}`);
      }
    }

    /* ───────── UI wiring ───────── */
    $launch.onclick = () => {
      const open = getComputedStyle($window).display!=='none';
      $window.style.display = open ? 'none' : 'flex';
      if (!open && !state.hasGreeted) {
        bot('Hi there! What can I help you with?');
        quickReplies(['create post','create instagram post title & description','create image']);
        state.hasGreeted = true;
        persist();
      }
    };
    $send.onclick = () => processText();
    $input.onkeypress = e => { if (e.key==='Enter') processText(); };
    function processText() {
      const t = $input.value.trim();
      if (!t) return;
      $input.value = '';
      acceptInput(t);
    }
  })();
}
