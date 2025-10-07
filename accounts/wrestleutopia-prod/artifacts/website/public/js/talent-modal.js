const run = () => {
  const dlg = document.getElementById("wrestler-modal");
  const closeBtn = document.getElementById("wm-close");
  if (dlg && closeBtn) {
    closeBtn.addEventListener("click", () => dlg.close());
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run, { once: true });
} else {
  run();
}
