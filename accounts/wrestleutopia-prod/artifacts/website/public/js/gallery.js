function ensureOverlay() {
  let overlay = document.getElementById("wu-lightbox");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "wu-lightbox";
  overlay.innerHTML = `
    <button class="wu-lb-close" aria-label="Close">×</button>
    <button class="wu-lb-prev"  aria-label="Previous">‹</button>
    <div class="wu-lb-content"></div>
    <button class="wu-lb-next"  aria-label="Next">›</button>
    <div class="wu-lb-count"></div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

export function enableMediaLightbox(root = document) {
  const scope = root;

  const getNodes = () =>
    Array.from(
      scope.querySelectorAll(
        ".media-grid .media-card img, .media-grid .media-card video"
      )
    );

  for (const v of scope.querySelectorAll(".media-grid .media-card video")) {
    v.removeAttribute("controls");
    v.setAttribute("playsinline", "");
    v.muted = true;
    v.preload = "metadata";
  }
  for (const card of scope.querySelectorAll(".media-grid .media-card")) {
    card.style.cursor = "pointer";
  }

  const overlay  = ensureOverlay();
  const content  = overlay.querySelector(".wu-lb-content");
  const counter  = overlay.querySelector(".wu-lb-count");
  const btnPrev  = overlay.querySelector(".wu-lb-prev");
  const btnNext  = overlay.querySelector(".wu-lb-next");
  const btnClose = overlay.querySelector(".wu-lb-close");

  let currentIndex = 0;

  function show(idx) {
    const nodes = getNodes();
    if (!nodes.length) return;

    currentIndex = ((idx % nodes.length) + nodes.length) % nodes.length;

    const node = nodes[currentIndex];
    const src  = node?.currentSrc || node?.src || "";
    content.innerHTML = "";

    if (!src) return;

    if (node.tagName.toLowerCase() === "img") {
      const img = document.createElement("img");
      img.className = "wu-lb-img";
      img.src = src;
      img.alt = "";
      content.appendChild(img);
    } else {
      const video = document.createElement("video");
      video.className = "wu-lb-video";
      video.src = src;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      content.appendChild(video);
    }

    counter.textContent = `${currentIndex + 1} / ${nodes.length}`;
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function hide() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    content.innerHTML = "";
  }

  function step(delta) {
    const nodes = getNodes();
    if (!nodes.length) return;
    show(currentIndex + delta);
  }

  scope.addEventListener("click", (e) => {
    const card = e.target.closest(".media-card");
    if (!card || !scope.contains(card)) return;

    const media = card.querySelector("img, video");
    if (!media) return;

    const nodes = getNodes();
    const idx = nodes.indexOf(media);
    if (idx === -1) return;

    e.preventDefault();
    show(idx);
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) hide();
  });
  btnClose.addEventListener("click", (e) => { e.stopPropagation(); hide(); });
  btnPrev .addEventListener("click", (e) => { e.stopPropagation(); step(-1); });
  btnNext .addEventListener("click", (e) => { e.stopPropagation(); step(1); });

  window.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("open")) return;
    if (e.key === "Escape") hide();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });

  let touchX = 0;
  overlay.addEventListener("touchstart", (e) => {
    if (!overlay.classList.contains("open")) return;
    touchX = e.touches[0].clientX;
  }, { passive: true });
  overlay.addEventListener("touchend", (e) => {
    if (!overlay.classList.contains("open")) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) step(dx > 0 ? -1 : 1);
  }, { passive: true });

  return {
    openAt: (i) => show(i),
    close: hide
  };
}
