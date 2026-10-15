(function () {
  "use strict";

  // Order & Book Online -- entirely dynamic, driven by the live catalogue
  // (server-authoritative price/eligibility text, offering type and
  // approval status -- never hardcoded here, see
  // worker/src/routes/checkoutPublic.js and worker/src/lib/checkout.js).
  // Loaded globally on every page (layouts/base.njk) so any existing
  // service card or service-detail page lights up automatically the
  // moment staff activate a matching catalogue entry, with no new
  // deployment -- this file no-ops immediately on a page with none of
  // its target elements.
  //
  // Four independent jobs, each guarded on its own DOM markers:
  //   1. The dedicated /instant-services/ "Order Documents & Book
  //      Services Online" page: search/filter controls plus its two
  //      section lists ([data-catalogue-list="document"|"service"]).
  //   2. Existing Core/Specialised service cards on the homepage and
  //      /services/ (any .card inside a .card-grid--3up/--4up that isn't
  //      job 1's own lists) -- injects the availability message + Order
  //      Now/Book Now + Send an Enquiry, leaving the existing Learn More
  //      link and everything else about the card untouched.
  //   3. Existing service-detail pages (any page with a .service-lede) --
  //      injects the same message + actions near the top (right after
  //      the lede) and ONE closing CTA section right before the page's
  //      own existing enquiry .service-cta block (the October review
  //      flagged two consecutive, near-identical closing panels on some
  //      pages -- this file has only ever injected one of its own, so
  //      that defect was in page-local markup, not here; see the service
  //      page templates for the actual fix).
  //   4. The homepage's Airport VIP feature panel ([data-airport-vip-book-now])
  //      -- a single "Book Now" link added alongside its existing "Send
  //      an Enquiry", never a duplicate section.
  //
  // Internal naming (file name, data attributes, API paths) intentionally
  // keeps the "instant services" identifier throughout -- only
  // customer-facing text says "Order & Book Online" / "Order Now" /
  // "Book Now". No backend change was needed for this rename.
  var MESSAGES = {
    en: {
      loading: "Loading the current catalogue...",
      empty: "Nothing matches your search right now.",
      emptyAll: "No documents or services are available to order or book online right now. Please send us an enquiry instead.",
      error: "We couldn't load the catalogue right now. Please try again shortly, or send us an enquiry.",
      searchPlaceholder: "Search by name or keyword",
      searchLabel: "Search the catalogue",
      typeFilterLabel: "Show",
      typeFilterAll: "Documents & Services",
      typeFilterDocuments: "Documents only",
      typeFilterServices: "Services only",
      categoryFilterLabel: "Category",
      categoryFilterAll: "All categories",
      orderDocumentsHeading: "Order Documents",
      bookServicesHeading: "Book Services",
      priceToBeAnnounced: "Pricing to be announced",
      availableNow: "Available now",
      orderNow: "Order Now",
      bookNow: "Book Now",
      sendEnquiry: "Send an Enquiry",
      availabilityBadge: "This service is available to order online.",
      availabilityBadgeBooking: "This service is available to book online.",
      availabilityDescription: "Complete your requirements and submit payment online, without waiting for a quotation.",
      readyHeading: "Ready to proceed?",
      readyDescription: "Order or book this directly online, or contact our team if you'd like assistance before proceeding.",
    },
    "zh-CN": {
      loading: "正在加载当前目录……",
      empty: "没有符合您搜索条件的结果。",
      emptyAll: "目前暂无可在线订购或预约的文件或服务，请改为向我们发送咨询。",
      error: "暂时无法加载目录，请稍后重试，或向我们发送咨询。",
      searchPlaceholder: "按名称或关键字搜索",
      searchLabel: "搜索目录",
      typeFilterLabel: "显示",
      typeFilterAll: "文件与服务",
      typeFilterDocuments: "仅文件",
      typeFilterServices: "仅服务",
      categoryFilterLabel: "类别",
      categoryFilterAll: "所有类别",
      orderDocumentsHeading: "订购文件",
      bookServicesHeading: "预约服务",
      priceToBeAnnounced: "价格待公布",
      availableNow: "现已提供",
      orderNow: "立即订购",
      bookNow: "立即预约",
      sendEnquiry: "发送咨询",
      availabilityBadge: "该文件支持在线订购。",
      availabilityBadgeBooking: "该服务支持在线预约。",
      availabilityDescription: "完成您的申请并在线支付，无需等待报价。",
      readyHeading: "准备好继续了吗？",
      readyDescription: "您可以直接在线订购或预约；如需协助，也可以在办理前联系我们的团队。",
    },
    "zh-Hant": {
      loading: "正在載入目前的目錄……",
      empty: "沒有符合您搜尋條件的結果。",
      emptyAll: "目前暫無可線上訂購或預約的文件或服務，請改為向我們傳送查詢。",
      error: "暫時無法載入目錄，請稍後再試，或向我們傳送查詢。",
      searchPlaceholder: "依名稱或關鍵字搜尋",
      searchLabel: "搜尋目錄",
      typeFilterLabel: "顯示",
      typeFilterAll: "文件與服務",
      typeFilterDocuments: "僅文件",
      typeFilterServices: "僅服務",
      categoryFilterLabel: "類別",
      categoryFilterAll: "所有類別",
      orderDocumentsHeading: "訂購文件",
      bookServicesHeading: "預約服務",
      priceToBeAnnounced: "價格待公布",
      availableNow: "現已提供",
      orderNow: "立即訂購",
      bookNow: "立即預約",
      sendEnquiry: "傳送查詢",
      availabilityBadge: "此文件支援線上訂購。",
      availabilityBadgeBooking: "此服務支援線上預約。",
      availabilityDescription: "完成您的申請並線上付款，無需等待報價。",
      readyHeading: "準備好繼續了嗎？",
      readyDescription: "您可以直接線上訂購或預約；如需協助，也歡迎在辦理前聯絡我們的團隊。",
    },
    ko: {
      loading: "현재 목록을 불러오는 중입니다...",
      empty: "검색 조건에 맞는 항목이 없습니다.",
      emptyAll: "현재 온라인으로 주문 또는 예약 가능한 문서나 서비스가 없습니다. 대신 문의를 보내주세요.",
      error: "목록을 불러오지 못했습니다. 잠시 후 다시 시도하시거나 문의를 보내주세요.",
      searchPlaceholder: "이름 또는 키워드로 검색",
      searchLabel: "목록 검색",
      typeFilterLabel: "표시",
      typeFilterAll: "문서 및 서비스",
      typeFilterDocuments: "문서만",
      typeFilterServices: "서비스만",
      categoryFilterLabel: "분류",
      categoryFilterAll: "모든 분류",
      orderDocumentsHeading: "문서 주문",
      bookServicesHeading: "서비스 예약",
      priceToBeAnnounced: "가격 추후 공지",
      availableNow: "현재 이용 가능",
      orderNow: "지금 주문",
      bookNow: "지금 예약",
      sendEnquiry: "문의하기",
      availabilityBadge: "이 문서는 온라인으로 주문하실 수 있습니다.",
      availabilityBadgeBooking: "이 서비스는 온라인으로 예약하실 수 있습니다.",
      availabilityDescription: "견적을 기다리지 않고 온라인으로 신청 및 결제를 완료하세요.",
      readyHeading: "진행할 준비가 되셨나요?",
      readyDescription: "온라인에서 바로 주문 또는 예약하실 수 있습니다. 진행 전에 도움이 필요하시면 저희 팀에 문의해 주세요.",
    },
    ja: {
      loading: "現在のカタログを読み込んでいます...",
      empty: "検索条件に一致する項目がありません。",
      emptyAll: "現在オンラインでご注文・ご予約いただける書類やサービスはありません。お問い合わせをお送りください。",
      error: "カタログを読み込めませんでした。しばらくしてから再度お試しいただくか、お問い合わせをお送りください。",
      searchPlaceholder: "名称またはキーワードで検索",
      searchLabel: "カタログを検索",
      typeFilterLabel: "表示",
      typeFilterAll: "書類・サービス",
      typeFilterDocuments: "書類のみ",
      typeFilterServices: "サービスのみ",
      categoryFilterLabel: "カテゴリー",
      categoryFilterAll: "すべてのカテゴリー",
      orderDocumentsHeading: "書類を注文する",
      bookServicesHeading: "サービスを予約する",
      priceToBeAnnounced: "価格は追ってお知らせします",
      availableNow: "現在ご利用いただけます",
      orderNow: "今すぐ注文",
      bookNow: "今すぐ予約",
      sendEnquiry: "お問い合わせ",
      availabilityBadge: "この書類はオンラインでご注文いただけます。",
      availabilityBadgeBooking: "このサービスはオンラインでご予約いただけます。",
      availabilityDescription: "お見積もりをお待ちいただくことなく、オンラインでお申し込みとお支払いを完了できます。",
      readyHeading: "お手続きを進めますか？",
      readyDescription: "オンラインで直接ご注文・ご予約いただけます。お手続き前にご不明な点がございましたら、担当チームまでお問い合わせください。",
    },
    vi: {
      loading: "Đang tải danh mục hiện tại...",
      empty: "Không có mục nào phù hợp với tìm kiếm của quý khách.",
      emptyAll: "Hiện chưa có tài liệu hoặc dịch vụ nào có thể đặt hoặc đặt lịch trực tuyến. Vui lòng gửi yêu cầu tư vấn cho chúng tôi.",
      error: "Không thể tải danh mục lúc này. Vui lòng thử lại sau hoặc gửi yêu cầu tư vấn cho chúng tôi.",
      searchPlaceholder: "Tìm theo tên hoặc từ khóa",
      searchLabel: "Tìm trong danh mục",
      typeFilterLabel: "Hiển thị",
      typeFilterAll: "Tài liệu & Dịch vụ",
      typeFilterDocuments: "Chỉ tài liệu",
      typeFilterServices: "Chỉ dịch vụ",
      categoryFilterLabel: "Danh mục",
      categoryFilterAll: "Tất cả danh mục",
      orderDocumentsHeading: "Đặt Tài Liệu",
      bookServicesHeading: "Đặt Dịch Vụ",
      priceToBeAnnounced: "Giá sẽ được thông báo sau",
      availableNow: "Hiện có sẵn",
      orderNow: "Đặt Ngay",
      bookNow: "Đặt Lịch Ngay",
      sendEnquiry: "Gửi Yêu Cầu Tư Vấn",
      availabilityBadge: "Tài liệu này có thể đặt trực tuyến.",
      availabilityBadgeBooking: "Dịch vụ này có thể đặt lịch trực tuyến.",
      availabilityDescription: "Hoàn tất yêu cầu và thanh toán trực tuyến ngay mà không cần chờ báo giá.",
      readyHeading: "Sẵn sàng tiến hành?",
      readyDescription: "Đặt hoặc đặt lịch dịch vụ này trực tuyến ngay, hoặc liên hệ đội ngũ của chúng tôi nếu quý khách cần hỗ trợ trước khi tiến hành.",
    },
  };

  // Human-readable category labels for each service_slug -- the same
  // sixteen categories already used by /services/'s own cards (and by
  // worker/src/routes/enquiries.js's SERVICE_SLUGS), so the catalogue
  // never invents a parallel taxonomy. "airport-vip" is included here
  // because it is itself a category as well as (today) the only
  // bookable-service offering.
  var CATEGORY_LABELS = {
    en: {
      "visa-applications": "Visa & Immigration Applications",
      "work-visas": "Work & Employment Visas",
      "extensions-compliance": "Extensions & Compliance",
      "residency-status": "Residency & Long-Term Status",
      "family-spousal": "Family & Spousal Visas",
      "corporate-mobility": "Corporate & Global Mobility",
      "status-review": "Immigration Status Review & Regularisation",
      "motions-blacklist": "Immigration Motions, Blacklist & Derogatory Records",
      "legal-support": "Legal Support for Foreign Nationals",
      "airport-vip": "Airport VIP Meet & Assist",
      "lost-passport": "Lost Passport & Travel Documents",
      "acr-icard": "ACR I-Card Assistance",
      "exit-clearance": "Exit Clearance & Departure",
      "document-verification": "Document Verification",
      "complex-tailored": "Complex & Tailored Assistance",
      "property-transfer": "Property Transfer & Documentation",
      other: "Other",
    },
    "zh-CN": {
      "visa-applications": "签证与移民申请", "work-visas": "工作与雇佣签证", "extensions-compliance": "延期与合规",
      "residency-status": "居留与长期身份", "family-spousal": "家庭与配偶签证", "corporate-mobility": "企业与全球调动",
      "status-review": "移民身份审核与规范化", "motions-blacklist": "移民异议、黑名单与不良记录",
      "legal-support": "外国公民法律支持", "airport-vip": "机场贵宾接送服务", "lost-passport": "护照遗失与旅行证件",
      "acr-icard": "ACR I-Card 协助", "exit-clearance": "离境清关", "document-verification": "文件核实",
      "complex-tailored": "复杂及定制协助", "property-transfer": "财产转让与文件", other: "其他",
    },
    "zh-Hant": {
      "visa-applications": "簽證與移民申請", "work-visas": "工作與雇傭簽證", "extensions-compliance": "延期與合規",
      "residency-status": "居留與長期身份", "family-spousal": "家庭與配偶簽證", "corporate-mobility": "企業與全球調動",
      "status-review": "移民身份審核與規範化", "motions-blacklist": "移民異議、黑名單與不良記錄",
      "legal-support": "外國公民法律支援", "airport-vip": "機場貴賓接送服務", "lost-passport": "護照遺失與旅行證件",
      "acr-icard": "ACR I-Card 協助", "exit-clearance": "離境清關", "document-verification": "文件核實",
      "complex-tailored": "複雜及客製協助", "property-transfer": "財產轉讓與文件", other: "其他",
    },
    ko: {
      "visa-applications": "비자 및 이민 신청", "work-visas": "취업 비자", "extensions-compliance": "연장 및 법규 준수",
      "residency-status": "거주 및 장기 체류 신분", "family-spousal": "가족 및 배우자 비자", "corporate-mobility": "기업 및 글로벌 이동",
      "status-review": "이민 신분 검토 및 정규화", "motions-blacklist": "이민 이의신청, 블랙리스트 및 불량 기록",
      "legal-support": "외국인 법률 지원", "airport-vip": "공항 VIP 영접 서비스", "lost-passport": "분실 여권 및 여행 증명서",
      "acr-icard": "ACR I-Card 지원", "exit-clearance": "출국 허가", "document-verification": "문서 확인",
      "complex-tailored": "복합 및 맞춤 지원", "property-transfer": "재산 양도 및 서류", other: "기타",
    },
    ja: {
      "visa-applications": "ビザ・移民申請", "work-visas": "就労ビザ", "extensions-compliance": "延長・コンプライアンス",
      "residency-status": "居住・長期ステータス", "family-spousal": "家族・配偶者ビザ", "corporate-mobility": "企業・グローバル異動",
      "status-review": "移民ステータス審査・正規化", "motions-blacklist": "移民異議・ブラックリスト・不良記録",
      "legal-support": "外国人向け法的支援", "airport-vip": "空港VIP送迎サービス", "lost-passport": "パスポート紛失・旅行書類",
      "acr-icard": "ACR I-Card 支援", "exit-clearance": "出国手続き", "document-verification": "文書確認",
      "complex-tailored": "複雑・個別対応支援", "property-transfer": "不動産譲渡・書類", other: "その他",
    },
    vi: {
      "visa-applications": "Đơn Xin Visa & Di Trú", "work-visas": "Visa Lao Động", "extensions-compliance": "Gia Hạn & Tuân Thủ",
      "residency-status": "Cư Trú & Tình Trạng Dài Hạn", "family-spousal": "Visa Gia Đình & Vợ/Chồng", "corporate-mobility": "Dịch Chuyển Doanh Nghiệp & Toàn Cầu",
      "status-review": "Rà Soát & Hợp Thức Hóa Tình Trạng Di Trú", "motions-blacklist": "Kiến Nghị, Danh Sách Đen & Hồ Sơ Bất Lợi",
      "legal-support": "Hỗ Trợ Pháp Lý Cho Người Nước Ngoài", "airport-vip": "Dịch Vụ Đón Tiếp VIP Tại Sân Bay", "lost-passport": "Mất Hộ Chiếu & Giấy Tờ Du Lịch",
      "acr-icard": "Hỗ Trợ ACR I-Card", "exit-clearance": "Thủ Tục Xuất Cảnh", "document-verification": "Xác Minh Giấy Tờ",
      "complex-tailored": "Hỗ Trợ Phức Tạp & Riêng Biệt", "property-transfer": "Chuyển Nhượng Tài Sản & Giấy Tờ", other: "Khác",
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
  var categoryLabels = CATEGORY_LABELS[pageLang] || CATEGORY_LABELS.en;

  function categoryLabel(serviceSlug) {
    return categoryLabels[serviceSlug] || categoryLabels.other;
  }

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

  // "Bookable" here means the catalogue/presentation sense -- goes in the
  // "Book Services" section, gets "Book Now" instead of "Order Now" --
  // not "has a flight/passenger date-time form" (that distinction is
  // apply.js's own, separate isManual check). A fixed_price_service has
  // no booking date either, but it's a service, not a document, so it
  // belongs in the same bucket as bookable_service here.
  function isBookable(service) {
    return service.offeringType === "bookable_service" || service.offeringType === "fixed_price_service";
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
  // Job 1: the dedicated /instant-services/ "Order Documents & Book
  // Services Online" page -- search/filter controls plus the two
  // section lists. An offering with no approved price yet ("Pricing to
  // be announced") never gets an Order Now/Book Now action -- only Send
  // an Enquiry, per the explicit "do not enable checkout for offerings
  // that lack approved pricing" requirement. In practice this should be
  // rare (setOfferingStatus already refuses to activate a priceless
  // offering), but the card never assumes that invariant holds.
  // ---------------------------------------------------------------------
  function renderCatalogueCard(service) {
    var bookable = isBookable(service);
    var card = document.createElement("div");
    card.className = "card card--instant-service";
    card.setAttribute("data-catalogue-card", "1");
    card.setAttribute("data-card-title", (service.title || "").toLowerCase());
    card.setAttribute("data-card-description", (service.shortDescription || "").toLowerCase());
    card.setAttribute("data-card-category", service.serviceSlug || "");
    card.setAttribute("data-card-type", bookable ? "service" : "document");

    var priceLine = service.hasApprovedPrice
      ? '<p class="instant-service-card__price">' + escapeHtml(service.priceLabel) + ": " + formatPhp(service.totalPhpCentavos) + "</p>"
      : '<p class="instant-service-card__price instant-service-card__price--tba">' + escapeHtml(strings.priceToBeAnnounced) + "</p>";

    var primaryAction = service.hasApprovedPrice
      ? '<a class="btn btn-primary btn-sm" href="' + applyUrl(service) + '">' + escapeHtml(bookable ? strings.bookNow : strings.orderNow) + "</a>"
      : "";

    card.innerHTML =
      '<span class="tag">' + escapeHtml(categoryLabel(service.serviceSlug)) + "</span>" +
      "<h3>" + escapeHtml(service.title) + "</h3>" +
      "<p>" + escapeHtml(service.shortDescription) + "</p>" +
      '<span class="tag tag--available">' + escapeHtml(strings.availableNow) + "</span>" +
      priceLine +
      '<div class="card-instant-checkout__actions">' +
      primaryAction +
      '<a class="btn btn-secondary btn-sm" href="' + enquiryUrl(service.serviceSlug) + '">' + escapeHtml(strings.sendEnquiry) + "</a>" +
      "</div>";
    return card;
  }

  var controls = document.querySelector("[data-catalogue-controls]");
  var documentList = document.querySelector('[data-catalogue-list="document"]');
  var serviceList = document.querySelector('[data-catalogue-list="service"]');

  if (documentList || serviceList) {
    [documentList, serviceList].forEach(function (list) {
      if (list) {
        list.textContent = strings.loading;
        list.setAttribute("aria-live", "polite");
      }
    });

    getCatalogue()
      .then(function (services) {
        if (!services.length) {
          if (documentList) documentList.textContent = strings.emptyAll;
          if (serviceList) serviceList.textContent = "";
          var svcSection = document.getElementById("book-services-section");
          if (svcSection) svcSection.style.display = "none";
          return;
        }

        if (documentList) documentList.textContent = "";
        if (serviceList) serviceList.textContent = "";

        var categoriesSeen = {};
        services.forEach(function (service) {
          var card = renderCatalogueCard(service);
          var target = isBookable(service) ? serviceList : documentList;
          if (target) target.appendChild(card);
          categoriesSeen[service.serviceSlug] = true;
        });

        // Populate the category filter from whatever categories are
        // ACTUALLY present in the live catalogue -- never a hardcoded
        // list that could include a category with nothing purchasable
        // in it, or omit one that does.
        var categorySelect = document.querySelector("[data-catalogue-category-filter]");
        if (categorySelect) {
          Object.keys(categoriesSeen)
            .sort(function (a, b) {
              return categoryLabel(a).localeCompare(categoryLabel(b));
            })
            .forEach(function (slug) {
              var option = document.createElement("option");
              option.value = slug;
              option.textContent = categoryLabel(slug);
              categorySelect.appendChild(option);
            });
        }

        applyFilters();
      })
      .catch(function () {
        // Fails closed and quiet -- an unreachable catalogue never blocks
        // the rest of the page from rendering normally.
        if (documentList) documentList.textContent = strings.error;
        if (serviceList) serviceList.textContent = "";
      });
  }

  // Search/type/category filtering -- pure client-side over the already-
  // rendered cards (the catalogue is small enough today that a second
  // server round-trip per keystroke would be wasted complexity; this
  // scales the same way the rest of the page does as more offerings are
  // added, since it's just re-evaluating a DOM attribute per card).
  function applyFilters() {
    var searchInput = document.querySelector("[data-catalogue-search]");
    var typeSelect = document.querySelector("[data-catalogue-type-filter]");
    var categorySelect = document.querySelector("[data-catalogue-category-filter]");
    var query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    var typeFilter = typeSelect ? typeSelect.value : "all";
    var categoryFilter = categorySelect ? categorySelect.value : "all";

    var sections = [
      { list: documentList, type: "document", heading: document.getElementById("order-documents-section") },
      { list: serviceList, type: "service", heading: document.getElementById("book-services-section") },
    ];

    sections.forEach(function (section) {
      if (!section.list) return;
      var sectionMatches = 0;
      var sectionApplies = typeFilter === "all" || typeFilter === section.type;

      Array.prototype.forEach.call(section.list.querySelectorAll("[data-catalogue-card]"), function (card) {
        var matchesQuery = !query || card.getAttribute("data-card-title").indexOf(query) !== -1 || card.getAttribute("data-card-description").indexOf(query) !== -1;
        var matchesCategory = categoryFilter === "all" || card.getAttribute("data-card-category") === categoryFilter;
        var visible = sectionApplies && matchesQuery && matchesCategory;
        card.style.display = visible ? "" : "none";
        if (visible) sectionMatches++;
      });

      if (section.heading) section.heading.style.display = sectionApplies ? "" : "none";

      var emptyNotice = section.list.querySelector("[data-catalogue-empty-notice]");
      if (!sectionMatches && sectionApplies) {
        if (!emptyNotice) {
          emptyNotice = document.createElement("p");
          emptyNotice.className = "muted";
          emptyNotice.setAttribute("data-catalogue-empty-notice", "1");
          emptyNotice.textContent = strings.empty;
          section.list.appendChild(emptyNotice);
        }
      } else if (emptyNotice) {
        emptyNotice.remove();
      }
    });
  }

  if (controls) {
    ["[data-catalogue-search]", "[data-catalogue-type-filter]", "[data-catalogue-category-filter]"].forEach(function (selector) {
      var el = controls.querySelector(selector);
      if (!el) return;
      el.addEventListener(el.tagName === "SELECT" ? "change" : "input", applyFilters);
    });
  }

  // ---------------------------------------------------------------------
  // Job 2: existing Core/Specialised service cards (homepage, /services/).
  // Scoped to .card-grid--3up/--4up so this never touches the catalogue
  // page's own [data-catalogue-list] grids (handled by job 1).
  // ---------------------------------------------------------------------
  function slugFromLearnMoreHref(href) {
    if (!href) return null;
    var clean = href.replace(/^https?:\/\/[^/]+/, "").replace(/\/+$/, "");
    var segments = clean.split("/").filter(Boolean);
    return segments.length ? segments[segments.length - 1] : null;
  }

  function buildCardEligibilityBlock(service, serviceSlug) {
    var bookable = isBookable(service);
    var el = document.createElement("div");
    el.className = "card-instant-checkout";
    var actionsHtml = service.hasApprovedPrice
      ? '<a class="btn btn-primary btn-sm" href="' + applyUrl(service) + '">' + escapeHtml(bookable ? strings.bookNow : strings.orderNow) + "</a>"
      : "";
    el.innerHTML =
      '<p class="card-instant-checkout__message"><strong>' + escapeHtml(bookable ? strings.availabilityBadgeBooking : strings.availabilityBadge) + "</strong> " + escapeHtml(strings.availabilityDescription) + "</p>" +
      (service.hasApprovedPrice ? "" : '<p class="muted">' + escapeHtml(strings.priceToBeAnnounced) + "</p>") +
      '<div class="card-instant-checkout__actions">' +
      actionsHtml +
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
  // ONE bottom "Ready to proceed?" CTA (before the page's own existing
  // enquiry .service-cta block). Both read the page's own slug from that
  // SAME existing enquiry link, so this never depends on the URL-slug
  // map above (that table is only needed for job 2's card->slug lookup).
  //
  // Skipped entirely on a page that already carries its own hand-written
  // CTA copy (e.g. Airport VIP's "Request Priority Assistance" top block,
  // or a page with its own bottom closing section) -- such a page opts
  // out by marking its own action area(s) with
  // [data-service-action-slot="<serviceSlug>"] instead (handled below),
  // so this generic injector never produces a second, duplicate panel
  // alongside a page's bespoke one (the exact defect the October review
  // flagged on more than one service page).
  // ---------------------------------------------------------------------
  var lede = document.querySelector(".service-lede");
  var existingServiceCta = document.querySelector(".service-cta:not(.service-cta--instant)");
  var pageHandlesOwnCta = !!document.querySelector("[data-service-action-slot]");
  if (lede && existingServiceCta && !pageHandlesOwnCta) {
    var existingEnquiryLink = existingServiceCta.querySelector('a[href*="/contact/?service="]') || existingServiceCta.querySelector('a[href*="/contact?service="]');
    var ownSlugMatch = existingEnquiryLink && existingEnquiryLink.getAttribute("href").match(/[?&]service=([^&]+)/);
    var ownServiceSlug = ownSlugMatch && decodeURIComponent(ownSlugMatch[1]);

    if (ownServiceSlug) {
      getCatalogue()
        .then(function (services) {
          var service = services.filter(function (s) {
            return s.serviceSlug === ownServiceSlug;
          })[0];
          if (!service) return; // not (yet) eligible -- page stays exactly as it already is
          var bookable = isBookable(service);

          var priceLine = service.hasApprovedPrice
            ? '<p class="instant-service-card__price">' + escapeHtml(service.priceLabel) + ": " + formatPhp(service.totalPhpCentavos) + "</p>"
            : '<p class="instant-service-card__price instant-service-card__price--tba">' + escapeHtml(strings.priceToBeAnnounced) + "</p>";
          var primaryAction = service.hasApprovedPrice
            ? '<a class="btn btn-primary" href="' + applyUrl(service) + '">' + escapeHtml(bookable ? strings.bookNow : strings.orderNow) + "</a>"
            : "";
          var actionsHtml =
            '<p class="service-cta__actions">' +
            primaryAction +
            '<a class="btn btn-secondary" href="' + enquiryUrl(ownServiceSlug) + '">' + escapeHtml(strings.sendEnquiry) + "</a>" +
            "</p>";

          var topCta = document.createElement("div");
          topCta.className = "service-cta service-cta--instant service-cta--top";
          topCta.innerHTML =
            '<p class="instant-checkout-badge"><strong>' + escapeHtml(bookable ? strings.availabilityBadgeBooking : strings.availabilityBadge) + "</strong> " + escapeHtml(strings.availabilityDescription) + "</p>" +
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

  // ---------------------------------------------------------------------
  // Job 4: hand-authored pages that want ONE specific, dynamic Order Now/
  // Book Now action inserted into an existing CTA block they otherwise
  // fully control -- the homepage's Airport VIP feature panel, and
  // Airport VIP's own service-detail page (both have bespoke copy this
  // file should never try to generate itself). Each matching element
  // names the service it wants via data-service-action-slot="<slug>";
  // the dynamic action is prepended as the first action in that block,
  // alongside whatever static links (e.g. "Send an Enquiry") the page
  // already wrote. No-ops per-slot if that service doesn't exist, isn't
  // active, or has no approved price yet -- the page's existing static
  // content is always a safe fallback.
  // ---------------------------------------------------------------------
  var actionSlots = document.querySelectorAll("[data-service-action-slot]");
  if (actionSlots.length) {
    getCatalogue()
      .then(function (services) {
        var bySlug = {};
        services.forEach(function (s) {
          bySlug[s.serviceSlug] = s;
        });

        actionSlots.forEach(function (slot) {
          var service = bySlug[slot.getAttribute("data-service-action-slot")];
          if (!service || !service.hasApprovedPrice) return;

          var link = document.createElement("a");
          link.className = slot.getAttribute("data-service-action-class") || "btn btn-primary";
          link.href = applyUrl(service);
          link.textContent = isBookable(service) ? strings.bookNow : strings.orderNow;
          slot.insertBefore(link, slot.firstChild);
        });
      })
      .catch(function () {
        // Fails closed and quiet -- every slot keeps its existing static
        // (enquiry-only) presentation, same as an ineligible service.
      });
  }
})();
