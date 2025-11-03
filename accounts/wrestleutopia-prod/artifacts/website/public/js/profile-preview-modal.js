(() => {
  const init = () => {
    const dlgEl = document.getElementById("preview-modal");
    const closeBtn = document.getElementById("preview-close");

    if (!dlgEl || !closeBtn) return;

    const dlg = dlgEl instanceof HTMLDialogElement ? dlgEl : null;
    if (!dlg) return;

    if (dlg.dataset.initialized === "1") return;
    dlg.dataset.initialized = "1";

    const hasDialog = "HTMLDialogElement" in window && typeof dlg.showModal === "function";

    const ctrl = new AbortController();
    const { signal } = ctrl;

    let opener = null;

    function safeClose() {
      try {
        if (dlg.open) dlg.close();
      } catch {
      }
    }

    closeBtn.addEventListener("click", safeClose, { passive: true, signal });

    dlg.addEventListener(
      "cancel",
      (e) => {
        e.preventDefault();
        safeClose();
      },
      { signal },
    );

    dlg.addEventListener(
      "click",
      (e) => {
        if (e.target === dlg) safeClose();
      },
      { passive: true, signal },
    );

    dlg.addEventListener(
      "close",
      () => {
        if (opener && document.contains(opener)) {
          try {
            opener.focus({ preventScroll: true });
          } catch {
          }
        }
      },
      { signal },
    );

    function openFrom(el) {
      opener = el instanceof HTMLElement ? el : null;
      if (hasDialog) {
        if (!dlg.open) dlg.showModal();
      } else {
        dlg.setAttribute("open", "");
      }

      const first = dlg.querySelector(
        "[autofocus], button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      (first || dlg).focus({ preventScroll: true });
    }

    window.wuOpenProfilePreview = openFrom;

    window.wuDestroyProfilePreview = () => {
      ctrl.abort();
      delete dlg.dataset.initialized;
    };
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
