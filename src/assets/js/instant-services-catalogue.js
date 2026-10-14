(function () {
  "use strict";

  // Instant Checkout eligibility/purchase UI -- entirely dynamic, driven
  // by the live catalogue (server-authoritative price/eligibility text,
  // never hardcoded here -- see worker/src/routes/checkoutPublic.js).
  // Loaded globally on every page (layouts/base.njk) so any existing
  // service card or service-detail page lights up automatically the
  // moment staff activate a matching catalogue entry, with no new
  // deployment -- this file no-ops immediately on a page with none of
  // its target elements.
  //
  // Three independent jobs, each guarded on its own DOM markers:
  //   1. The dedicated /instant-services/ catalogue page's own card list
  //      ([data-instant-services-list]).
  //   2. Existing Core/Specialised service cards on the homepage and
  //      /services/ (any .card inside a .card-grid--3up/--4up that isn't
  //      job 1's own list) -- injects the availability message + Buy Now
  //      + Send an Enquiry, leaving the existing Learn More link and
  //      everything else about the card untouched.
  //   3. Existing service-detail pages (any page with a .service-lede) --
  //      injects the same message + actions near the top (right after
  //      the lede) and a closing "Ready to proceed?" section right
  //      before the page's own existing enquiry .service-cta block.
  //
  // Internal naming (file name, data attributes, API paths) intentionally
  // keeps the "instant services" identifier throughout -- only
  // customer-facing text says "Instant Checkout" / "Buy Now". No backend
  // change was needed or made for this rename.
  var MESSAGES = {
    en: {
      loading: "Loading current Instant Checkout services...",
      empty: "No services are available for Instant Checkout online right now. Please send us an enquiry instead.",
      error: "We couldn't load Instant Checkout right now. Please try again shortly, or send us an enquiry.",
      from: "From",
      catalogueBadge: "Available for Instant Checkout",
      buyNow: "Buy Now",
      sendEnquiry: "Send an Enquiry",
      availabilityBadge: "This service is available for Instant Checkout.",
      availabilityDescription: "Complete your request and submit payment online without waiting for a quotation.",
      readyHeading: "Ready to proceed?",
      readyDescription: "Purchase this service directly online, or contact our team if you'd like assistance before proceeding.",
    },
    "zh-CN": {
      loading: "正在加载当前支持即时结账的服务……",
      empty: "目前暂无可在线即时结账的服务，请改为向我们发送咨询。",
      error: "暂时无法加载即时结账服务，请稍后重试，或向我们发送咨询。",
      from: "起价",
      catalogueBadge: "支持即时结账",
      buyNow: "立即购买",
      sendEnquiry: "发送咨询",
      availabilityBadge: "该服务支持即时结账。",
      availabilityDescription: "完成您的申请并在线支付，无需等待报价。",
      readyHeading: "准备好继续了吗？",
      readyDescription: "您可以直接在线购买此服务；如需协助，也可以在购买前联系我们的团队。",
    },
    "zh-Hant": {
      loading: "正在載入目前支援即時結帳的服務……",
      empty: "目前暫無可線上即時結帳的服務，請改為向我們傳送查詢。",
      error: "暫時無法載入即時結帳服務，請稍後再試，或向我們傳送查詢。",
      from: "起價",
      catalogueBadge: "支援即時結帳",
      buyNow: "立即購買",
      sendEnquiry: "傳送查詢",
      availabilityBadge: "此服務支援即時結帳。",
      availabilityDescription: "完成您的申請並線上付款，無需等待報價。",
      readyHeading: "準備好繼續了嗎？",
      readyDescription: "您可以直接線上購買此服務；如需協助，也歡迎在購買前聯絡我們的團隊。",
    },
    ko: {
      loading: "즉시 결제를 지원하는 서비스를 불러오는 중입니다...",
      empty: "현재 온라인으로 즉시 결제 가능한 서비스가 없습니다. 대신 문의를 보내주세요.",
      error: "즉시 결제 서비스를 불러오지 못했습니다. 잠시 후 다시 시도하시거나 문의를 보내주세요.",
      from: "최소",
      catalogueBadge: "즉시 결제 이용 가능",
      buyNow: "바로 구매",
      sendEnquiry: "문의하기",
      availabilityBadge: "이 서비스는 즉시 결제를 이용하실 수 있습니다.",
      availabilityDescription: "견적을 기다리지 않고 온라인으로 신청 및 결제를 완료하세요.",
      readyHeading: "진행할 준비가 되셨나요?",
      readyDescription: "이 서비스는 온라인에서 바로 구매하실 수 있습니다. 진행 전에 도움이 필요하시면 저희 팀에 문의해 주세요.",
    },
    ja: {
      loading: "即時決済に対応しているサービスを読み込んでいます...",
      empty: "現在オンラインで即時決済可能なサービスはありません。お問い合わせをお送りください。",
      error: "即時決済サービスを読み込めませんでした。しばらくしてから再度お試しいただくか、お問い合わせをお送りください。",
      from: "から",
      catalogueBadge: "即時決済対応",
      buyNow: "今すぐ購入",
      sendEnquiry: "お問い合わせ",
      availabilityBadge: "このサービスは即時決済をご利用いただけます。",
      availabilityDescription: "お見積もりをお待ちいただくことなく、オンラインでお申し込みとお支払いを完了できます。",
      readyHeading: "お手続きを進めますか？",
      readyDescription: "このサービスはオンラインで直接ご購入いただけます。お手続き前にご不明な点がございましたら、担当チームまでお問い合わせください。",
    },
    vi: {
      loading: "Đang tải các dịch vụ hỗ trợ Thanh Toán Nhanh...",
      empty: "Hiện chưa có dịch vụ nào hỗ trợ Thanh Toán Nhanh trực tuyến. Vui lòng gửi yêu cầu tư vấn cho chúng tôi.",
      error: "Không thể tải dịch vụ Thanh Toán Nhanh lúc này. Vui lòng thử lại sau hoặc gửi yêu cầu tư vấn cho chúng tôi.",
      from: "Từ",
      catalogueBadge: "Hỗ Trợ Thanh Toán Nhanh",
      buyNow: "Mua Ngay",
      sendEnquiry: "Gửi Yêu Cầu Tư Vấn",
      availabilityBadge: "Dịch vụ này hỗ trợ Thanh Toán Nhanh.",
      availabilityDescription: "Hoàn tất yêu cầu và thanh toán trực tuyến ngay mà không cần chờ báo giá.",
      readyHeading: "Sẵn sàng tiến hành?",
      readyDescription: "Mua dịch vụ này trực tuyến ngay, hoặc liên hệ đội ngũ của chúng tôi nếu quý khách cần hỗ trợ trước khi tiến hành.",
    },
  };

  // Maps each service-detail page's URL slug (the path segment under
  // /services/) to the short service_slug the catalogue/enquiry system
  // actually uses (worker/src/routes/enquiries.js SERVICE_SLUGS). Built
  // directly from each page's own existing bottom enquiry link, so this
  // table is the one place that pairing is spelled out for the OTHER
  // reading direction (card -> slug); the detail page itself never needs
  // this table, since it can read its own slug straight from its own DOM.
  var URL_SLUG_TO_SERVICE_SLUG = {
    "acr-i-card-assistance": "acr-icard",
    "airport-vip-meet-and-assist": "airport-vip",
    "complex-and-tailored-immigration-assistance": "complex-tailored",
    "corporate-and-global-mobility": "corporate-mobility",
    "exit-clearance-and-departure": "exit-clearance",
    "extensions-and-compliance": "extensions-compliance",
    "family-and-spousal-visas": "family-spousal",
    "immigration-motions-blacklist-and-derogatory-record-assistance": "motions-blacklist",
    "immigration-status-review-and-regularisation": "status-review",
    "legal-support-for-foreign-nationals": "legal-support",
    "lost-passport-and-travel-document-assistance": "lost-passport",
    "property-transfer-and-documentation-support": "property-transfer",
    "residency-and-long-term-status": "residency-status",
    "visa-and-immigration-applications": "visa-applications",
    "visa-and-immigration-document-verification": "document-verification",
    "work-and-employment-visas": "work-visas",
  };

  var pageLang = document.documentElement.lang || "en";
  var strings = MESSAGES[pageLang] || MESSAGES.en;

  // Fetched once per page load and shared by every job on the page.
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
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function applyUrl(service) {
    return "/instant-services/apply/?service=" + encodeURIComponent(service.id) + "&lang=" + encodeURIComponent(pageLang);
  }

  function enquiryUrl(serviceSlug) {
    return "/contact/?service=" + encodeURIComponent(serviceSlug);
  }

  // ---------------------------------------------------------------------
  // Job 1: the dedicated /instant-services/ catalogue page's own list.
  // ---------------------------------------------------------------------
  function renderCatalogueCard(service) {
    var card = document.createElement("div");
    card.className = "card card--instant-service";
    card.innerHTML =
      '<span class="tag tag--available">' + escapeHtml(strings.catalogueBadge) + "</span>" +
      "<h3>" + escapeHtml(service.title) + "</h3>" +
      "<p>" + escapeHtml(service.shortDescription) + "</p>" +
      '<p class="instant-service-card__eligibility">' + escapeHtml(service.eligibilityText) + "</p>" +
      '<p class="instant-service-card__price">' + escapeHtml(strings.from) + " " + formatPhp(service.totalPhpCentavos) + "</p>" +
      '<a class="btn btn-primary" href="' + applyUrl(service) + '">' + escapeHtml(strings.buyNow) + "</a>";
    return card;
  }

  var catalogueContainers = document.querySelectorAll("[data-instant-services-list]");
  catalogueContainers.forEach(function (container) {
    container.textContent = strings.loading;
    container.setAttribute("aria-live", "polite");

    getCatalogue()
      .then(function (services) {
        if (!services.length) {
          container.textContent = strings.empty;
          return;
        }
        container.textContent = "";
        services.forEach(function (service) {
          container.appendChild(renderCatalogueCard(service));
        });
      })
      .catch(function () {
        // Fails closed and quiet -- an unreachable catalogue never blocks
        // the rest of the page from rendering normally.
        container.textContent = strings.error;
      });
  });

  // ---------------------------------------------------------------------
  // Job 2: existing Core/Specialised service cards (homepage, /services/).
  // Scoped to .card-grid--3up/--4up so this never touches the catalogue
  // page's own [data-instant-services-list] grid (handled by job 1, and
  // in any case empty of .card children at this point in the script).
  // ---------------------------------------------------------------------
  function slugFromLearnMoreHref(href) {
    if (!href) return null;
    var clean = href.replace(/^https?:\/\/[^/]+/, "").replace(/\/+$/, "");
    var segments = clean.split("/").filter(Boolean);
    return segments.length ? segments[segments.length - 1] : null;
  }

  function buildCardEligibilityBlock(service, serviceSlug) {
    var el = document.createElement("div");
    el.className = "card-instant-checkout";
    el.innerHTML =
      '<p class="card-instant-checkout__message"><strong>' + escapeHtml(strings.availabilityBadge) + "</strong> " + escapeHtml(strings.availabilityDescription) + "</p>" +
      '<div class="card-instant-checkout__actions">' +
      '<a class="btn btn-primary btn-sm" href="' + applyUrl(service) + '">' + escapeHtml(strings.buyNow) + "</a>" +
      '<a class="btn btn-secondary btn-sm" href="' + enquiryUrl(serviceSlug) + '">' + escapeHtml(strings.sendEnquiry) + "</a>" +
      "</div>";
    return el;
  }

  var gridCards = document.querySelectorAll(".card-grid--3up .card, .card-grid--4up .card");
  if (gridCards.length) {
    getCatalogue()
      .then(function (services) {
        if (!services.length) return;
        var bySlug = {};
        services.forEach(function (s) {
          bySlug[s.serviceSlug] = s;
        });

        gridCards.forEach(function (card) {
          var link = card.querySelector("a.card__link");
          if (!link) return; // not a service card (shouldn't happen for this selector, but never assume)
          var urlSlug = slugFromLearnMoreHref(link.getAttribute("href"));
          var serviceSlug = urlSlug && URL_SLUG_TO_SERVICE_SLUG[urlSlug];
          var service = serviceSlug && bySlug[serviceSlug];
          if (!service) return; // ineligible/inactive -- card stays exactly as it already is

          card.insertBefore(buildCardEligibilityBlock(service, serviceSlug), link);
        });
      })
      .catch(function () {
        // Fails closed and quiet -- every card simply keeps its existing
        // presentation (Learn More / enquiry path), same as an ineligible
        // service would anyway.
      });
  }

  // ---------------------------------------------------------------------
  // Job 3: existing service-detail pages -- top CTA (after the lede) and
  // bottom "Ready to proceed?" CTA (before the page's own existing
  // enquiry .service-cta block). Both read the page's own slug from that
  // SAME existing enquiry link, so this never depends on the URL-slug
  // map above (that table is only needed for job 2's card->slug lookup).
  // ---------------------------------------------------------------------
  var lede = document.querySelector(".service-lede");
  var existingServiceCta = document.querySelector(".service-cta:not(.service-cta--instant)");
  if (lede && existingServiceCta) {
    var existingEnquiryLink = existingServiceCta.querySelector('a[href*="/contact/?service="]');
    var ownSlugMatch = existingEnquiryLink && existingEnquiryLink.getAttribute("href").match(/[?&]service=([^&]+)/);
    var ownServiceSlug = ownSlugMatch && decodeURIComponent(ownSlugMatch[1]);

    if (ownServiceSlug) {
      getCatalogue()
        .then(function (services) {
          var service = services.filter(function (s) {
            return s.serviceSlug === ownServiceSlug;
          })[0];
          if (!service) return; // not (yet) eligible -- page stays exactly as it already is

          var priceLine = '<p class="instant-service-card__price">' + escapeHtml(strings.from) + " " + formatPhp(service.totalPhpCentavos) + "</p>";
          var actionsHtml =
            '<p class="service-cta__actions">' +
            '<a class="btn btn-primary" href="' + applyUrl(service) + '">' + escapeHtml(strings.buyNow) + "</a>" +
            '<a class="btn btn-secondary" href="' + enquiryUrl(ownServiceSlug) + '">' + escapeHtml(strings.sendEnquiry) + "</a>" +
            "</p>";

          var topCta = document.createElement("div");
          topCta.className = "service-cta service-cta--instant service-cta--top";
          topCta.innerHTML =
            '<p class="instant-checkout-badge"><strong>' + escapeHtml(strings.availabilityBadge) + "</strong> " + escapeHtml(strings.availabilityDescription) + "</p>" +
            priceLine + actionsHtml;
          lede.parentNode.insertBefore(topCta, lede.nextSibling);

          var bottomCta = document.createElement("div");
          bottomCta.className = "service-cta service-cta--instant";
          bottomCta.innerHTML =
            "<h2>" + escapeHtml(strings.readyHeading) + "</h2>" +
            "<p>" + escapeHtml(strings.readyDescription) + "</p>" +
            actionsHtml;
          existingServiceCta.parentNode.insertBefore(bottomCta, existingServiceCta);
        })
        .catch(function () {
          // Fails closed and quiet -- the page keeps its existing
          // enquiry-only presentation, same as an ineligible service.
        });
    }
  }
})();
