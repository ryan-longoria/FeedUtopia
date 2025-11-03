(() => {
  const init = () => {
    const dlgEl = document.getElementById("wrestler-modal");
    const closeBtn = document.getElementById("wm-close");

    if (!dlgEl || !closeBtn) return;

    const dlg = dlgEl instanceof HTMLDialogElement ? dlgEl : null;
    if (!dlg) return;

    if (dlg.dataset.initialized === "1") return;
    dlg.dataset.initialized = "1";

    const hasDialog = "HTMLDialogElement" in window && typeof dlg.showModal === "function";

    const ctrl = new AbortController();
    const { signal } = ctrl;

    let opener = null;

    const safeClose = () => {
      try {
        if (dlg.open) dlg.close();
      } catch {}
    };

    closeBtn.addEventListener("click", safeClose, { passive: true, signal });

    dlg.addEventListener("cancel", (e) => {
      e.preventDefault();
      safeClose();
    }, { signal });

    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) safeClose();
    }, { passive: true, signal });

    dlg.addEventListener("close", () => {
      if (opener && document.contains(opener)) {
        try { opener.focus({ preventScroll: true }); } catch {}
      }
    }, { signal });

    dlg.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const focusables = dlg.querySelectorAll(
        "[autofocus], a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      const list = Array.from(focusables).filter(el => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"));
      if (list.length === 0) return;

      const first = list[0];
      const last = list[list.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        last.focus({ preventScroll: true });
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus({ preventScroll: true });
        e.preventDefault();
      }
    }, { signal });

    function openFrom(el) {
      opener = el instanceof HTMLElement ? el : null;
      if (hasDialog) {
        if (!dlg.open) dlg.showModal();
      } else {
        dlg.setAttribute("open", "");
      }
      const first = dlg.querySelector(
        "[autofocus], button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      (first || dlg).focus({ preventScroll: true });
    }

    window.wuOpenTalentModal = openFrom;
    window.wuDestroyTalentModal = () => {
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
