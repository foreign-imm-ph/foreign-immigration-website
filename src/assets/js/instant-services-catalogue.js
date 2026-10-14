(function () {
  "use strict";

  // Renders the live Instant Services catalogue into any container with
  // [data-instant-services-list] on the page -- used by both the
  // homepage's compact widget (data-limit="3") and the full catalogue
  // page (no limit). Visible strings only; the catalogue data itself
  // always comes from the Worker (server-authoritative price/eligibility
  // text), never hardcoded here -- see worker/src/routes/checkoutPublic.js.
  var MESSAGES = {
    en: {
      loading: "Loading current Instant Services...",
      empty: "No Instant Services are available online right now. Please send us an enquiry instead.",
      error: "We couldn't load Instant Services right now. Please try again shortly, or send us an enquiry.",
      from: "From",
      badge: "Instant Services Available",
      cta: "Apply & Pay Now",
    },
    "zh-CN": {
      loading: "正在加载当前可办理的即时服务……",
      empty: "目前暂无可在线办理的即时服务，请改为向我们发送咨询。",
      error: "暂时无法加载即时服务，请稍后重试，或向我们发送咨询。",
      from: "起价",
      badge: "可办理即时服务",
      cta: "申请并付款",
    },
    "zh-Hant": {
      loading: "正在載入目前可辦理的即時服務……",
      empty: "目前暫無可線上辦理的即時服務，請改為向我們發送查詢。",
      error: "暫時無法載入即時服務，請稍後再試，或向我們發送查詢。",
      from: "起價",
      badge: "可辦理即時服務",
      cta: "申請並付款",
    },
    ko: {
      loading: "현재 이용 가능한 즉시 서비스를 불러오는 중입니다...",
      empty: "현재 온라인으로 신청 가능한 즉시 서비스가 없습니다. 대신 문의를 보내주세요.",
      error: "즉시 서비스를 불러오지 못했습니다. 잠시 후 다시 시도하시거나 문의를 보내주세요.",
      from: "최소",
      badge: "즉시 서비스 이용 가능",
      cta: "신청 및 결제하기",
    },
    ja: {
      loading: "現在ご利用いただける即時サービスを読み込んでいます...",
      empty: "現在オンラインでご利用いただける即時サービスはありません。お問い合わせをお送りください。",
      error: "即時サービスを読み込めませんでした。しばらくしてから再度お試しいただくか、お問い合わせをお送りください。",
      from: "から",
      badge: "即時サービス利用可能",
      cta: "申請して支払う",
    },
    vi: {
      loading: "Đang tải các Dịch Vụ Nhanh hiện có...",
      empty: "Hiện chưa có Dịch Vụ Nhanh nào khả dụng trực tuyến. Vui lòng gửi yêu cầu tư vấn cho chúng tôi.",
      error: "Không thể tải Dịch Vụ Nhanh lúc này. Vui lòng thử lại sau hoặc gửi yêu cầu tư vấn cho chúng tôi.",
      from: "Từ",
      badge: "Có Dịch Vụ Nhanh",
      cta: "Đăng Ký & Thanh Toán Ngay",
    },
  };

  var containers = document.querySelectorAll("[data-instant-services-list]");
  if (!containers.length) return;

  var pageLang = document.documentElement.lang || "en";
  var strings = MESSAGES[pageLang] || MESSAGES.en;

  function formatPhp(centavos) {
    var pesos = Math.round(Number(centavos) || 0) / 100;
    return "₱" + pesos.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = String(str == null ? "" : str);
    return div.innerHTML;
  }

  function renderCard(service) {
    var card = document.createElement("div");
    card.className = "card card--instant-service";
    card.innerHTML =
      '<span class="tag tag--available">' + escapeHtml(strings.badge) + "</span>" +
      "<h3>" + escapeHtml(service.title) + "</h3>" +
      "<p>" + escapeHtml(service.shortDescription) + "</p>" +
      '<p class="instant-service-card__eligibility">' + escapeHtml(service.eligibilityText) + "</p>" +
      '<p class="instant-service-card__price">' + escapeHtml(strings.from) + " " + formatPhp(service.totalPhpCentavos) + "</p>" +
      '<a class="btn btn-primary" href="/instant-services/apply/?service=' + encodeURIComponent(service.id) + "&lang=" + encodeURIComponent(pageLang) + '">' + escapeHtml(strings.cta) + "</a>";
    return card;
  }

  containers.forEach(function (container) {
    var limit = parseInt(container.getAttribute("data-limit"), 10) || null;
    // The homepage widget hides its whole section if the catalogue is
    // currently empty (nothing worth showing on the homepage); the
    // catalogue page itself shows an explicit "nothing available, send
    // an enquiry instead" message so a visitor who followed a link here
    // isn't left looking at a blank page.
    var hideSectionIfEmpty = container.hasAttribute("data-hide-if-empty");
    var section = container.closest("[data-instant-services-section]");

    container.textContent = strings.loading;
    container.setAttribute("aria-live", "polite");

    window
      .portalFetch("/api/instant-services/catalogue?lang=" + encodeURIComponent(pageLang), { method: "GET" })
      .then(function (resp) {
        if (!resp.ok) return Promise.reject(new Error("request_failed"));
        return resp.json();
      })
      .then(function (data) {
        var services = (data && data.services) || [];
        if (limit) services = services.slice(0, limit);

        if (!services.length) {
          if (hideSectionIfEmpty && section) {
            section.hidden = true;
          } else {
            container.textContent = strings.empty;
          }
          return;
        }

        if (section) section.hidden = false;
        container.textContent = "";
        services.forEach(function (service) {
          container.appendChild(renderCard(service));
        });
      })
      .catch(function () {
        // Fails closed and quiet, not with a broken-looking error block --
        // an unreachable catalogue should never block the rest of the
        // page (homepage or catalogue page alike) from rendering
        // normally for every other visitor action.
        if (hideSectionIfEmpty && section) {
          section.hidden = true;
        } else {
          container.textContent = strings.error;
        }
      });
  });
})();
