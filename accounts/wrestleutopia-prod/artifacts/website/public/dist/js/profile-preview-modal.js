const run = () => {
  const dlg = document.getElementById('preview-modal');
  const closeBtn = document.getElementById('preview-close');
  if (dlg && closeBtn) {
    closeBtn.addEventListener('click', () => dlg.close());
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', run, { once: true });
} else {
  run();
}