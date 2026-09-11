(function () {
  "use strict";

  var STORAGE_KEY = "fisPreferredLocale";
  var VALID_LOCALES = ["en", "zh-CN", "zh-Hant", "ko", "ja", "vi"];

  function isValidLocale(code) {
    return VALID_LOCALES.indexOf(code) !== -1;
  }

  function safeGetItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSetItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      // Storage unavailable — the gateway/switcher still function for this
      // visit; the gateway may simply reappear on a later visit, which is
      // an acceptable degradation rather than a hard failure.
    }
  }

  // Header language-switcher sync: runs on every page. Purely additive —
  // never touches the link's href or intercepts navigation, only records
  // the visitor's latest deliberate language choice.
  var switcherLinks = document.querySelectorAll(".lang-switcher__list a[hreflang]");
  for (var i = 0; i < switcherLinks.length; i++) {
    switcherLinks[i].addEventListener("click", function () {
      var code = this.getAttribute("hreflang");
      if (isValidLocale(code)) {
        safeSetItem(STORAGE_KEY, code);
      }
    });
  }

  // First-visit language gateway. Its <dialog> markup only exists on the
  // English root homepage (included once, by src/index.njk), so presence
  // in the DOM is itself the primary gate; the pathname and support
  // checks below are defensive, not the sole guard.
  var dialog = document.getElementById("language-gateway");
  if (!dialog) return;
  if (window.location.pathname !== "/") return;
  if (typeof dialog.showModal !== "function") return;
  if (safeGetItem(STORAGE_KEY)) return;

  var lastFocused = document.activeElement;

  function recordAndClose(code) {
    if (isValidLocale(code)) {
      safeSetItem(STORAGE_KEY, code);
    }
    if (dialog.open) {
      dialog.close();
    }
  }

  // Every primary language option and the "Continue in English" action
  // carry data-locale — English stays on this page (it is a <button>),
  // the other five are real <a href> links so navigation still works even
  // if this listener never attaches.
  var options = dialog.querySelectorAll("[data-locale]");
  for (var j = 0; j < options.length; j++) {
    options[j].addEventListener("click", function () {
      var code = this.getAttribute("data-locale");
      if (isValidLocale(code)) {
        safeSetItem(STORAGE_KEY, code);
      }
      if (code === "en" && dialog.open) {
        dialog.close();
      }
    });
  }

  var closeButton = dialog.querySelector(".language-gateway__close");
  if (closeButton) {
    closeButton.addEventListener("click", function () {
      recordAndClose("en");
    });
  }

  // Native <dialog> fires "cancel" (then "close") on Escape.
  dialog.addEventListener("cancel", function () {
    safeSetItem(STORAGE_KEY, "en");
  });

  // Browsers already keep keyboard focus within an open modal <dialog> and
  // make everything outside it inert, but wrapping from the last focusable
  // element back to the first (and vice versa) can briefly land on
  // document.body in some engines. This small supplementary handler closes
  // that one gap without replacing the browser's own trap.
  dialog.addEventListener("keydown", function (event) {
    if (event.key !== "Tab") return;
    var focusable = dialog.querySelectorAll("button, a[href]");
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  });

  dialog.addEventListener("close", function () {
    document.body.classList.remove("language-gateway-open");
    if (lastFocused && typeof lastFocused.focus === "function") {
      try {
        lastFocused.focus();
      } catch (e) {
        // ignore
      }
    }
  });

  function openGateway() {
    document.body.classList.add("language-gateway-open");
    try {
      dialog.showModal();
    } catch (e) {
      document.body.classList.remove("language-gateway-open");
      return;
    }
    window.requestAnimationFrame(function () {
      dialog.classList.add("language-gateway--visible");
    });
  }

  if (document.readyState === "complete") {
    openGateway();
  } else {
    window.addEventListener("load", openGateway);
  }
})();
