(function () {
  "use strict";

  // Customer-facing transaction record (Part VII §17 of the Order & Book
  // Online directive). Read-only: every field comes straight from
  // GET /api/instant-services/orders/:id/receipt (worker/src/routes/
  // checkoutCustomer.js handleGetOrderReceipt), which already strips any
  // itemized fee breakdown and translates raw payment/refund status into
  // receipt-safe wording (never "paid" before staff actually verify it).
  // "Downloadable or printable" is the browser's own Print/Save-as-PDF,
  // reusing this page rather than a second rendering pipeline -- see the
  // @media print rule in style.css that hides nav/footer/chrome here.
  var CANONICAL_LANGUAGES = ["en", "zh-CN", "zh-Hant", "ko", "ja", "vi"];

  var STRINGS = {
    en: {
      loading: "Loading your receipt...", errorGeneric: "This receipt could not be loaded. Please try again, or contact us directly.",
      heading: "Receipt", referenceLabel: "Reference", dateLabel: "Date", customerLabel: "Customer",
      itemLabel: "Item", totalLabel: "Total", paymentStatusLabel: "Payment Status",
      deliveryLabel: "Delivery Charge", deliveryStatusLabel: "Delivery Payment Status",
      bookingHeading: "Booking Details", bookingFlightLabel: "Flight", bookingStatusLabel: "Booking Status",
      refundStatusLabel: "Refund Status", refundAmountLabel: "Refund Amount",
      allInclusiveNotice: "Listed prices include applicable government fees. Delivery charges, where applicable, are quoted separately.",
      printButton: "Print / Save as PDF",
    },
    "zh-CN": {
      loading: "正在加载您的收据...", errorGeneric: "无法加载此收据，请重试或直接与我们联系。",
      heading: "收据", referenceLabel: "参考编号", dateLabel: "日期", customerLabel: "客户",
      itemLabel: "项目", totalLabel: "总计", paymentStatusLabel: "付款状态",
      deliveryLabel: "邮寄费用", deliveryStatusLabel: "邮寄费用付款状态",
      bookingHeading: "预约详情", bookingFlightLabel: "航班", bookingStatusLabel: "预约状态",
      refundStatusLabel: "退款状态", refundAmountLabel: "退款金额",
      allInclusiveNotice: "所列价格已包含适用的政府费用。如需邮寄，邮寄费用将另行报价。",
      printButton: "打印/另存为 PDF",
    },
    "zh-Hant": {
      loading: "正在載入您的收據...", errorGeneric: "無法載入此收據，請重試或直接與我們聯絡。",
      heading: "收據", referenceLabel: "參考編號", dateLabel: "日期", customerLabel: "客戶",
      itemLabel: "項目", totalLabel: "總計", paymentStatusLabel: "付款狀態",
      deliveryLabel: "郵寄費用", deliveryStatusLabel: "郵寄費用付款狀態",
      bookingHeading: "預約詳情", bookingFlightLabel: "航班", bookingStatusLabel: "預約狀態",
      refundStatusLabel: "退款狀態", refundAmountLabel: "退款金額",
      allInclusiveNotice: "所列價格已包含適用的政府費用。如需郵寄，郵寄費用將另行報價。",
      printButton: "列印/另存為 PDF",
    },
    ko: {
      loading: "영수증을 불러오는 중입니다...", errorGeneric: "영수증을 불러올 수 없습니다. 다시 시도하시거나 저희에게 직접 문의해 주십시오.",
      heading: "영수증", referenceLabel: "참조번호", dateLabel: "날짜", customerLabel: "고객",
      itemLabel: "항목", totalLabel: "합계", paymentStatusLabel: "결제 상태",
      deliveryLabel: "배송비", deliveryStatusLabel: "배송비 결제 상태",
      bookingHeading: "예약 상세정보", bookingFlightLabel: "항공편", bookingStatusLabel: "예약 상태",
      refundStatusLabel: "환불 상태", refundAmountLabel: "환불 금액",
      allInclusiveNotice: "표시된 가격에는 해당 정부 수수료가 포함되어 있습니다. 배송이 필요한 경우 배송비는 별도로 안내됩니다.",
      printButton: "인쇄/PDF로 저장",
    },
    ja: {
      loading: "領収書を読み込んでいます...", errorGeneric: "領収書を読み込めませんでした。もう一度お試しいただくか、直接お問い合わせください。",
      heading: "領収書", referenceLabel: "参照番号", dateLabel: "日付", customerLabel: "お客様",
      itemLabel: "項目", totalLabel: "合計", paymentStatusLabel: "お支払い状況",
      deliveryLabel: "配送料", deliveryStatusLabel: "配送料のお支払い状況",
      bookingHeading: "予約詳細", bookingFlightLabel: "便名", bookingStatusLabel: "予約状況",
      refundStatusLabel: "返金状況", refundAmountLabel: "返金額",
      allInclusiveNotice: "表示されている価格には適用される政府手数料が含まれています。配送が必要な場合、配送料は別途ご案内いたします。",
      printButton: "印刷 / PDFとして保存",
    },
    vi: {
      loading: "Đang tải biên lai của quý khách...", errorGeneric: "Không thể tải biên lai này. Vui lòng thử lại hoặc liên hệ trực tiếp với chúng tôi.",
      heading: "Biên Lai", referenceLabel: "Mã Tham Chiếu", dateLabel: "Ngày", customerLabel: "Khách Hàng",
      itemLabel: "Mục", totalLabel: "Tổng Cộng", paymentStatusLabel: "Trạng Thái Thanh Toán",
      deliveryLabel: "Phí Giao Hàng", deliveryStatusLabel: "Trạng Thái Thanh Toán Phí Giao Hàng",
      bookingHeading: "Chi Tiết Đặt Lịch", bookingFlightLabel: "Chuyến Bay", bookingStatusLabel: "Trạng Thái Đặt Lịch",
      refundStatusLabel: "Trạng Thái Hoàn Tiền", refundAmountLabel: "Số Tiền Hoàn Lại",
      allInclusiveNotice: "Giá niêm yết đã bao gồm các phí chính phủ áp dụng. Phí giao hàng, nếu có, sẽ được báo giá riêng.",
      printButton: "In / Lưu dưới dạng PDF",
    },
  };

  function t(lang, key) {
    return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function formatPhp(amount) {
    var pesos = Number(amount) || 0;
    return "₱" + pesos.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso.replace(" ", "T") + "Z").toLocaleString();
    } catch (e) {
      return iso;
    }
  }

  var root = document.getElementById("instant-services-receipt-content");
  if (!root) return;

  var params = new URLSearchParams(window.location.search);
  var orderId = params.get("order");
  var lang = CANONICAL_LANGUAGES.indexOf(params.get("lang")) !== -1 ? params.get("lang") : "en";
  document.documentElement.lang = lang;

  if (!orderId) {
    root.innerHTML = '<p class="form-status" role="alert">' + escapeHtml(t(lang, "errorGeneric")) + "</p>";
    return;
  }

  root.innerHTML = '<p class="muted">' + escapeHtml(t(lang, "loading")) + "</p>";

  window
    .portalFetch("/api/instant-services/orders/" + orderId + "/receipt")
    .then(function (resp) {
      if (!resp.ok) return Promise.reject(new Error("not_found"));
      return resp.json();
    })
    .then(function (data) {
      var totalHtml = data.priceSnapshot
        ? "<tr><td>" + escapeHtml((data.service && data.service.priceLabel) || t(lang, "itemLabel")) + "</td><td>" + formatPhp(data.priceSnapshot.totalPhpCentavos / 100) + "</td></tr>" +
          "<tr><td><strong>" + escapeHtml(t(lang, "totalLabel")) + "</strong></td><td><strong>" + formatPhp(data.priceSnapshot.totalPhpCentavos / 100) + "</strong></td></tr>"
        : "";

      var bookingHtml = data.booking
        ? '<div class="card no-print-border">' +
          "<h3>" + escapeHtml(t(lang, "bookingHeading")) + "</h3>" +
          "<p><strong>" + escapeHtml(t(lang, "bookingFlightLabel")) + ":</strong> " + escapeHtml(data.booking.airline) + " " + escapeHtml(data.booking.flightNumber) +
          " &mdash; " + escapeHtml(data.booking.scheduledLocalDate) + " " + escapeHtml(data.booking.scheduledLocalTime) + "</p>" +
          "<p><strong>" + escapeHtml(t(lang, "bookingStatusLabel")) + ":</strong> " + escapeHtml(data.booking.statusLabel) + "</p>" +
          (data.booking.refundStatus
            ? "<p><strong>" + escapeHtml(t(lang, "refundStatusLabel")) + ":</strong> " + escapeHtml(data.booking.refundStatusLabel) +
              (data.booking.refundAmountPhpCentavos != null ? " (" + escapeHtml(t(lang, "refundAmountLabel")) + ": " + formatPhp(data.booking.refundAmountPhpCentavos / 100) + ")" : "") +
              "</p>"
            : "") +
          "</div>"
        : "";

      var deliveryHtml = data.delivery
        ? "<tr><td>" + escapeHtml(t(lang, "deliveryLabel")) + "</td><td>" + formatPhp(data.delivery.amountPhp) + "</td></tr>" +
          "<tr><td>" + escapeHtml(t(lang, "deliveryStatusLabel")) + "</td><td>" + escapeHtml(data.delivery.statusText) + "</td></tr>"
        : "";

      root.innerHTML =
        '<div class="card">' +
        "<h1>" + escapeHtml(t(lang, "heading")) + "</h1>" +
        "<p><strong>" + escapeHtml(t(lang, "referenceLabel")) + ":</strong> " + escapeHtml(data.reference) + "</p>" +
        "<p><strong>" + escapeHtml(t(lang, "dateLabel")) + ":</strong> " + escapeHtml(formatDate(data.createdAt)) + "</p>" +
        "<p><strong>" + escapeHtml(t(lang, "customerLabel")) + ":</strong> " + escapeHtml(data.customerName) + "</p>" +
        (data.service ? "<p><strong>" + escapeHtml(t(lang, "itemLabel")) + ":</strong> " + escapeHtml(data.service.title) + "</p>" : "") +
        '<table class="instant-services-price-table">' + totalHtml + deliveryHtml + "</table>" +
        '<p class="muted">' + escapeHtml(t(lang, "allInclusiveNotice")) + "</p>" +
        "<p><strong>" + escapeHtml(t(lang, "paymentStatusLabel")) + ":</strong> " + escapeHtml(data.payment.statusText) + "</p>" +
        "</div>" +
        bookingHtml +
        '<p class="no-print"><button type="button" class="btn btn-secondary" id="instant-services-receipt-print">' + escapeHtml(t(lang, "printButton")) + "</button></p>";

      var printButton = document.getElementById("instant-services-receipt-print");
      if (printButton) printButton.addEventListener("click", function () { window.print(); });
    })
    .catch(function () {
      root.innerHTML = '<p class="form-status" role="alert">' + escapeHtml(t(lang, "errorGeneric")) + "</p>";
    });
})();
