export function enableMediaLightbox(root = document) {
  const nodes = Array.from(
    root.querySelectorAll(".media-grid .media-card img, .media-grid .media-card video")
  );
  if (!nodes.length) return;

  nodes.forEach(n => {
    if (n.tagName.toLowerCase() === "video") {
      n.removeAttribute("controls");
      n.setAttribute("playsinline", "");
      n.muted = true;
    }
  });

  const cards = Array.from(root.querySelectorAll(".media-grid .media-card"));
  cards.forEach(card => {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      const media = card.querySelector("img, video");
      const i = nodes.indexOf(media);
      if (i >= 0) openAt(i);
    });
  });

  let overlay = document.getElementById("wu-lightbox");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "wu-lightbox";
    overlay.innerHTML = `
      <button class="wu-lb-close" aria-label="Close">×</button>
      <button class="wu-lb-prev" aria-label="Previous">‹</button>
      <div class="wu-lb-content"></div>
      <button class="wu-lb-next" aria-label="Next">›</button>
      <div class="wu-lb-count"></div>
    `;
    document.body.appendChild(overlay);
  }

  const contentEl = overlay.querySelector(".wu-lb-content");
  const countEl   = overlay.querySelector(".wu-lb-count");
  const prevBtn   = overlay.querySelector(".wu-lb-prev");
  const nextBtn   = overlay.querySelector(".wu-lb-next");
  const closeBtn  = overlay.querySelector(".wu-lb-close");

  let idx = 0;

  function render() {
    const node = nodes[idx];
    const src = node?.src || "";
    contentEl.innerHTML = "";

    if (node.tagName.toLowerCase() === "img") {
      const img = document.createElement("img");
      img.className = "wu-lb-img";
      img.src = src;
      contentEl.appendChild(img);
    } else {
      const video = document.createElement("video");
      video.className = "wu-lb-video";
      video.src = src;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      contentEl.appendChild(video);
    }

    countEl.textContent = `${idx + 1} / ${nodes.length}`;
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function hide() { overlay.classList.remove("open"); document.body.style.overflow = ""; contentEl.innerHTML = ""; }
  function openAt(i) { if (i >= 0 && i < nodes.length) { idx = i; render(); } }
  function go(delta) { idx = (idx + delta + nodes.length) % nodes.length; render(); }

  overlay.addEventListener("click", (e) => { if (e.target === overlay) hide(); });
  closeBtn.addEventListener("click", (e) => { e.stopPropagation(); hide(); });
  prevBtn.addEventListener("click", (e) => { e.stopPropagation(); go(-1); });
  nextBtn.addEventListener("click", (e) => { e.stopPropagation(); go(1); });

  window.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("open")) return;
    if (e.key === "Escape") hide();
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  });

  let touchX = 0;
  overlay.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  overlay.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) go(dx > 0 ? -1 : 1);
  }, { passive: true });

  return { openAt };
}
