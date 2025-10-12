const run = () => {
  const dlg = document.getElementById("apps-modal");
  const closeBtn = document.getElementById("apps-modal-close");
  if (dlg && closeBtn) {
    closeBtn.addEventListener("click", () => dlg.close());
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run, { once: true });
} else {
  run();
}
