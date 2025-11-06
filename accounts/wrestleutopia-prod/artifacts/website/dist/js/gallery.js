export function enableMediaLightbox(root = document) {
  const imgs = Array.from(root.querySelectorAll(".media-grid .media-card img"));
  if (!imgs.length) return;

  imgs.forEach((img) => {
    img.style.cursor = "zoom-in";
    img.addEventListener("click", () => openAt(imgs.indexOf(img)));
  });

  let overlay = document.getElementById("wu-lightbox");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "wu-lightbox";
    overlay.innerHTML = `
      <button class="wu-lb-close" aria-label="Close" title="Close">×</button>
      <button class="wu-lb-prev" aria-label="Previous" title="Previous">‹</button>
      <img class="wu-lb-img" alt="">
      <button class="wu-lb-next" aria-label="Next" title="Next">›</button>
      <div class="wu-lb-count"></div>
    `;
    document.body.appendChild(overlay);
  }

  const imgEl   = overlay.querySelector(".wu-lb-img");
  const countEl = overlay.querySelector(".wu-lb-count");
  const prevBtn = overlay.querySelector(".wu-lb-prev");
  const nextBtn = overlay.querySelector(".wu-lb-next");
  const closeBtn= overlay.querySelector(".wu-lb-close");

  let idx = 0;

  function show() {
    const src = imgs[idx]?.src || "";
    imgEl.src = src;
    countEl.textContent = `${idx + 1} / ${imgs.length}`;
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function hide() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }
  function openAt(i) {
    if (i < 0 || i >= imgs.length) return;
    idx = i;
    show();
  }
  function go(delta) {
    idx = (idx + delta + imgs.length) % imgs.length;
    show();
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) hide();
  });
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    hide();
  });
  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    go(-1);
  });
  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    go(1);
  });

  window.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("open")) return;
    if (e.key === "Escape") hide();
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  });

  let touchX = 0;
  overlay.addEventListener("touchstart", (e) => {
    touchX = e.touches[0].clientX;
  }, { passive: true });
  overlay.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) go(dx > 0 ? -1 : 1);
  }, { passive: true });
}
