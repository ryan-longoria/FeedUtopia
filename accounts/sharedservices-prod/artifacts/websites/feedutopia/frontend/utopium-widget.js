// Utopium chatbot widget – external script version
// --------------------------------------------------
// • Injects its own <style> tag for widget‑specific CSS (uses site CSS vars)
// • Appends the widget HTML to <body>
// • Runs the same state‑machine logic you already had
// --------------------------------------------------

(function(){
    /* ───── 1. Inject widget styles ─────────────────────────────── */
    const css = `
      #utopium-widget{position:fixed;bottom:16px;right:20px;z-index:9999;font-family:system-ui,sans-serif}
      #ut-launcher{background:var(--accent);color:#fff;border:none;width:64px;height:64px;
          border-radius:50%;box-shadow:0 4px 12px rgba(0,0,0,.4);cursor:pointer;
          display:flex;align-items:center;justify-content:center;font-size:1.75rem}
      #ut-window{display:none;flex-direction:column;width:360px;height:520px;
          background:var(--bg-dark);border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.6)}
      #ut-header{background:var(--accent);border-radius:14px 14px 0 0;
          padding:0.9rem 1.2rem;font-weight:700;color:#fff}
      #ut-messages{flex:1;overflow-y:auto;padding:1rem 1rem .5rem}
      #ut-input{display:flex;padding:.5rem;border-top:1px solid var(--bg-medium)}
      #ut-input input{flex:1;border:none;border-radius:8px 0 0 8px;
          padding:.55rem .8rem;background:var(--bg-medium);color:var(--text-main);font-size:1rem}
      #ut-input button{border:none;border-radius:0 8px 8px 0;
          background:var(--accent-light);font-weight:600;padding:.55rem 1rem;cursor:pointer}
      .ut-msg{max-width:88%;margin:.35rem 0;padding:.55rem .75rem;border-radius:18px;
          font-size:.95rem;line-height:1.35}
      .ut-user{background:#555;color:#fff;margin-left:auto}
      .ut-bot {background:var(--bg-light);color:var(--text-sub)}
      .ut-qr{display:inline-block;background:var(--bg-medium);color:#fff;padding:.3rem .7rem;
             border-radius:14px;margin:.25rem .2rem;font-size:.85rem;cursor:pointer}
      #ut-file{margin-top:.5rem}`;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  
    /* ───── 2. Append widget markup ─────────────────────────────── */
    const widgetHTML = `
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
      </div>`;
    document.body.insertAdjacentHTML('beforeend', widgetHTML);
  
    /* ───── 3. Chatbot logic (same as before) ───────────────────── */
    const API_ROOT = "https://api.feedutopia.com";
    const ACCOUNTS  = ["animeutopia","wrestleutopia","driftutopia","xputopia","critterutopia","cyberutopia"];
    const ARTIFACTS = ["NEWS","TRAILER","FACT","THROWBACK","VS","Default"];
  
    // State machine
    const state = { step: -1, data: {} };
    const steps = [ askAccount, askArtifact, askTitle, askSubtitle, askHLTitle,
                    askHLSub, askBgType, askFile, confirmAndSend ];
  
    // DOM
    const $launch   = document.getElementById('ut-launcher');
    const $window   = document.getElementById('ut-window');
    const $messages = document.getElementById('ut-messages');
    const $input    = document.getElementById('ut-text');
    const $send     = document.getElementById('ut-send');
  
    // Helpers
    const bot  = msg => bubble(msg,'ut-bot');
    const user = msg => bubble(msg,'ut-user');
    function bubble(msg,cls){
      const div = document.createElement('div');
      div.className = `ut-msg ${cls}`;
      div.innerHTML = msg;
      $messages.appendChild(div);
      $messages.scrollTop = $messages.scrollHeight;
      return div;
    }
    function quickReplies(opts){
      const frag=document.createDocumentFragment();
      opts.forEach(o=>{
        const span=document.createElement('span');
        span.textContent=o; span.className='ut-qr';
        span.onclick=()=>acceptInput(o);
        frag.appendChild(span);
      });
      bubble('').appendChild(frag);
    }
  
    /* ─── flow control ─────────────────────────────────────────── */
    function next(){ steps[state.step++](); }
    function acceptInput(text){
      if(state.step===0 && !ACCOUNTS.includes(text)) return; // guard quick‑reply only
      user(text);
      switch(state.step-1){
        case 0: state.data.account=text; break;
        case 1: state.data.artifact=text; break;
        case 2: state.data.title=text; break;
        case 3:
          state.data.subtitle = text;
          if (text.toLowerCase() === 'skip') {
            state.step++;       // Skip askHLSub
            next();             // Manually call next step
            return;             // Exit to avoid calling next() again
          }
          break;
        case 4: state.data.hlTitle=text; break;
        case 5: state.data.hlSub=text; break;
        case 6: state.data.bgType=text; break;
      }
      next();
    }
  
    /* questions */
    function askAccount(){ bot('Hi there! What account are we posting to?'); quickReplies(ACCOUNTS); }
    function askArtifact(){ bot('What type of post is this?'); quickReplies(ARTIFACTS); }
    function askTitle()    { bot('Cool ✨ What’s the <em>main title</em>?'); }
    function askSubtitle() { bot('Optional subtitle (or just type skip).'); }
    function askHLTitle()  { bot('Comma‑separated <em>highlight</em> words for title.'); }
    function askHLSub()    { bot('Highlight words for subtitle (optional).'); }
    function askBgType(){ bot('Is your background a <strong>photo</strong> or <strong>video</strong>?'); quickReplies(['photo','video']); }
    function askFile(){
      bot('Please choose or drag in the media file.');
    
      const dropZone = document.createElement('div');
      dropZone.style.border = '2px dashed #999';
      dropZone.style.padding = '1.5rem';
      dropZone.style.borderRadius = '12px';
      dropZone.style.textAlign = 'center';
      dropZone.style.marginTop = '0.5rem';
      dropZone.textContent = 'Drop file here or click to browse';
      dropZone.style.cursor = 'pointer';
      dropZone.id = 'ut-file-drop';
    
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.style.display = 'none';
    
      // Handle file selection via browse
      fileInput.onchange = () => {
        if (fileInput.files.length > 0) {
          state.file = fileInput.files[0];
          next();
        }
      };
    
      // Handle drag over
      dropZone.ondragover = e => {
        e.preventDefault();
        dropZone.style.borderColor = '#ec008c';
        dropZone.style.background = '#333';
      };
      dropZone.ondragleave = () => {
        dropZone.style.borderColor = '#999';
        dropZone.style.background = '';
      };
    
      // Handle drop
      dropZone.ondrop = e => {
        e.preventDefault();
        dropZone.style.borderColor = '#999';
        dropZone.style.background = '';
        if (e.dataTransfer.files.length > 0) {
          state.file = e.dataTransfer.files[0];
          next();
        }
      };
    
      // Click-to-open file input
      dropZone.onclick = () => fileInput.click();
    
      const wrapper = bubble('');
      wrapper.appendChild(dropZone);
      wrapper.appendChild(fileInput);
    }
    function confirmAndSend(){ bot('Ready to publish? Type <code>yes</code> to go!'); state.awaitYes=true; }
  
    /* network */
    async function publish(){
      try{
        bot('Getting upload URL…');
        let res=await fetch(`${API_ROOT}/upload-url`,{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({mediaType:state.data.bgType})});
        if(!res.ok) throw new Error('upload‑url failed');
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
        const txt=await res.text();
        bot(`<code>${txt}</code>`);
      }catch(err){ bot(`<i>Error:</i> ${err.message}`); }
    }
  
    /* listeners */
    $launch.onclick=()=>{
      const isOpen=$window.style.display==='flex';
      if(isOpen){ $window.style.display='none'; resetChat(); }
      else      { $window.style.display='flex'; bot('👋 Hi there! Type <code>create post</code> to begin.'); }
    };
    function resetChat(){ $messages.innerHTML=''; state.step=-1; state.data={}; state.awaitYes=false; state.file=null; }
    $send.onclick=()=>processText();
    $input.onkeypress=e=>{ if(e.key==='Enter') processText(); };
    function processText(){
      const text=$input.value.trim();
      if(!text) return;
      $input.value='';
      if(state.awaitYes){ if(text.toLowerCase().startsWith('y')){ user(text); state.awaitYes=false; publish(); } else user(text); return; }
      if(state.step===-1){
        user(text);
        const t=text.toLowerCase();
        if(['create post','create a post','make post','make a post'].includes(t)){ bot('Great! Let’s get started.'); state.step=0; next(); }
        else bot('If you want to start a new post, just type <code>create post</code>.');
        return;
      }
      acceptInput(text);
    }
  })();
  