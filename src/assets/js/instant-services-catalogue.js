(function () {
  "use strict";

  // Renders the live Instant Services catalogue in two places on this
  // site: (1) any container with [data-instant-services-list] (the
  // homepage's compact widget and the full /instant-services/ catalogue
  // page), and (2) a single-service CTA block on a service-detail page
  // via [data-instant-service-cta="<serviceSlug>"] -- e.g. the motions/
  // blacklist page showing its own eligibility/price/CTA inline, while
  // leaving that page's existing "Send an Enquiry" path untouched for
  // any visitor whose situation isn't the fixed/fast-path one. Visible
  // strings only; the catalogue data itself always comes from the Worker
  // (server-authoritative price/eligibility text), never hardcoded here
  // -- see worker/src/routes/checkoutPublic.js.
  var MESSAGES = {
    en: {
      loading: "Loading current Instant Services...",
      empty: "No Instant Services are available online right now. Please send us an enquiry instead.",
      error: "We couldn't load Instant Services right now. Please try again shortly, or send us an enquiry.",
      from: "From",
      badge: "Instant Services Available",
      cta: "Apply & Pay Now",
      detailHeading: "Need This Done Today?",
    },
    "zh-CN": {
      loading: "正在加载当前可办理的即时服务……",
      empty: "目前暂无可在线办理的即时服务，请改为向我们发送咨询。",
      error: "暂时无法加载即时服务，请稍后重试，或向我们发送咨询。",
      from: "起价",
      badge: "可办理即时服务",
      cta: "申请并付款",
      detailHeading: "需要今天就办理吗？",
    },
    "zh-Hant": {
      loading: "正在載入目前可辦理的即時服務……",
      empty: "目前暫無可線上辦理的即時服務，請改為向我們發送查詢。",
      error: "暫時無法載入即時服務，請稍後再試，或向我們發送查詢。",
      from: "起價",
      badge: "可辦理即時服務",
      cta: "申請並付款",
      detailHeading: "需要今天就辦理嗎？",
    },
    ko: {
      loading: "현재 이용 가능한 즉시 서비스를 불러오는 중입니다...",
      empty: "현재 온라인으로 신청 가능한 즉시 서비스가 없습니다. 대신 문의를 보내주세요.",
      error: "즉시 서비스를 불러오지 못했습니다. 잠시 후 다시 시도하시거나 문의를 보내주세요.",
      from: "최소",
      badge: "즉시 서비스 이용 가능",
      cta: "신청 및 결제하기",
      detailHeading: "오늘 바로 처리하고 싶으신가요?",
    },
    ja: {
      loading: "現在ご利用いただける即時サービスを読み込んでいます...",
      empty: "現在オンラインでご利用いただける即時サービスはありません。お問い合わせをお送りください。",
      error: "即時サービスを読み込めませんでした。しばらくしてから再度お試しいただくか、お問い合わせをお送りください。",
      from: "から",
      badge: "即時サービス利用可能",
      cta: "申請して支払う",
      detailHeading: "今すぐ手続きを進めたい方へ",
    },
    vi: {
      loading: "Đang tải các Dịch Vụ Nhanh hiện có...",
      empty: "Hiện chưa có Dịch Vụ Nhanh nào khả dụng trực tuyến. Vui lòng gửi yêu cầu tư vấn cho chúng tôi.",
      error: "Không thể tải Dịch Vụ Nhanh lúc này. Vui lòng thử lại sau hoặc gửi yêu cầu tư vấn cho chúng tôi.",
      from: "Từ",
      badge: "Có Dịch Vụ Nhanh",
      cta: "Đăng Ký & Thanh Toán Ngay",
      detailHeading: "Cần hoàn tất ngay hôm nay?",
    },
  };

  var containers = document.querySelectorAll("[data-instant-services-list]");
  var detailBlocks = document.querySelectorAll("[data-instant-service-cta]");
  if (!containers.length && !detailBlocks.length) return;

  var pageLang = document.documentElement.lang || "en";
  var strings = MESSAGES[pageLang] || MESSAGES.en;

  // Fetched once per page load and shared by every container/detail block
  // on the page -- a service-detail page only ever has one such block,
  // but this avoids a second identical request if that ever changes.
  var catalogueRequest = null;
  function getCatalogue() {
    if (!catalogueRequest) {
      catalogueRequest = window
        .portalFetch("/api/instant-services/catalogue?lang=" + encodeURIComponent(pageLang), { method: "GET" })
        .then(function (resp) {
          if (!resp.ok) return Promise.reject(new Error("request_failed"));
          return resp.json();
        })
        .then(function (data) {
          return (data && data.services) || [];
        });
    }
    return catalogueRequest;
  }

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

    getCatalogue()
      .then(function (services) {
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

  // Service-detail CTA: stays hidden (its markup's own default) unless
  // the live catalogue has an ACTIVE entry for this exact service slug --
  // a service not yet onboarded/approved never shows a price or CTA, and
  // the page's existing enquiry path underneath is untouched either way.
  detailBlocks.forEach(function (block) {
    var slug = block.getAttribute("data-instant-service-cta");

    getCatalogue()
      .then(function (services) {
        var service = services.filter(function (s) {
          return s.serviceSlug === slug;
        })[0];
        if (!service) return;

        block.querySelector("[data-instant-service-cta-heading]").textContent = strings.detailHeading;
        block.querySelector("[data-instant-service-cta-title]").textContent = service.title;
        block.querySelector("[data-instant-service-cta-description]").textContent = service.shortDescription;
        block.querySelector("[data-instant-service-cta-eligibility]").textContent = service.eligibilityText;
        block.querySelector("[data-instant-service-cta-price]").textContent = strings.from + " " + formatPhp(service.totalPhpCentavos);
        var link = block.querySelector("[data-instant-service-cta-link]");
        link.href = "/instant-services/apply/?service=" + encodeURIComponent(service.id) + "&lang=" + encodeURIComponent(pageLang);
        link.textContent = strings.cta;
        var badge = block.querySelector("[data-instant-service-cta-badge]");
        if (badge) badge.textContent = strings.badge;

        block.hidden = false;
      })
      .catch(function () {
        // Stays hidden -- same fail-closed, fail-quiet posture as the
        // catalogue list above.
      });
  });
})();
