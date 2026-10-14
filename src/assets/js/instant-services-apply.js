(function () {
  "use strict";

  // The Instant Services guest application flow -- a single dynamic page
  // (not one per locale, like the portal), driven entirely by server
  // state: on every step, the actual source of truth is
  // GET /api/instant-services/orders/:id, and this file only ever
  // decides which screen to show FROM that response, never from its own
  // local assumption about where the customer "should" be. The
  // questionnaire step reuses window.PortalBiForms.openBiFormDetail
  // (portal-bi-form.js) completely unchanged -- no second questionnaire
  // renderer exists.
  var CANONICAL_LANGUAGES = ["en", "zh-CN", "zh-Hant", "ko", "ja", "vi"];

  var STRINGS = {
    en: {
      loading: "Loading...",
      errorGeneric: "Something went wrong. Please try again, or contact us directly.",
      serviceNotFound: "This service could not be found or is no longer available.",
      fullNameLabel: "Full Name", emailLabel: "Email Address",
      startButton: "Continue", sending: "Sending...",
      checkEmailHeading: "Check Your Email",
      checkEmailBody: "We've sent a confirmation link to your email address. Please follow the link to continue your request.",
      questionnaireIntro: "Please complete the following questionnaire to continue your request.",
      deliveryHeading: "Delivery Address",
      recipientNameLabel: "Recipient Name", phoneLabel: "Phone Number", countryLabel: "Country",
      internationalLabel: "This is an international address",
      regionLabel: "State / Province / Region", cityLabel: "City", postalCodeLabel: "Postal Code",
      addressLine1Label: "Address Line 1", addressLine2Label: "Address Line 2 (optional)",
      deliveryNotice: "Delivery charges are not included in the service fee. Once your documents are ready for dispatch, we will provide a separate delivery quotation and payment request.",
      continueButton: "Continue", saving: "Saving...",
      reviewHeading: "Request Submitted",
      reviewIntro: "Your questionnaire has been submitted. Review the price breakdown below to proceed to payment.",
      totalLabel: "Total", confirmAndPayButton: "Confirm and Continue to Payment",
      paymentHeading: "Payment", amountLabel: "Amount Due",
      paymentUnavailable: "Online payment is not currently available online right now. Please contact FIS directly to complete this request.",
      uploadProofLabel: "Upload Proof of Payment", submitProofButton: "Submit Payment Proof",
      uploadError: "Upload failed. Please check the file type (PDF, JPEG, PNG or WebP) and size (under 15MB), then try again.",
      paymentSubmittedHeading: "Your Payment Has Been Submitted for Verification",
      paymentSubmittedBody: "Thank you! We've received your payment details and will review them shortly. You'll receive a confirmation by email once your payment has been verified. You can also track the status of your request through the FIS Client Portal.",
      referenceLabel: "Reference", portalLinkText: "Go to the FIS Client Portal",
      paidHeading: "Payment Verified",
      paidBody: "Your payment has been verified. You can track the progress of your request through the FIS Client Portal.",
    },
    "zh-CN": {
      loading: "加载中...",
      errorGeneric: "出现问题，请重试，或直接与我们联系。",
      serviceNotFound: "未能找到该服务，或该服务目前已不可用。",
      fullNameLabel: "姓名", emailLabel: "电子邮箱",
      startButton: "继续", sending: "正在发送...",
      checkEmailHeading: "请查收您的邮箱",
      checkEmailBody: "我们已向您的邮箱发送了一封确认邮件，请点击邮件中的链接以继续办理。",
      questionnaireIntro: "请填写以下问卷以继续办理。",
      deliveryHeading: "收件地址",
      recipientNameLabel: "收件人姓名", phoneLabel: "电话号码", countryLabel: "国家/地区",
      internationalLabel: "这是一个国际地址",
      regionLabel: "省/州/地区", cityLabel: "城市", postalCodeLabel: "邮政编码",
      addressLine1Label: "地址第一行", addressLine2Label: "地址第二行（选填）",
      deliveryNotice: "邮寄费用不包含在服务费中。文件备妥可寄送后，我们将另行提供邮寄报价及付款请求。",
      continueButton: "继续", saving: "保存中...",
      reviewHeading: "申请已提交",
      reviewIntro: "您的问卷已提交。请查看以下费用明细以继续付款。",
      totalLabel: "总计", confirmAndPayButton: "确认并继续付款",
      paymentHeading: "付款", amountLabel: "应付金额",
      paymentUnavailable: "目前暂不支持在线付款，请直接与 FIS 联系以完成办理。",
      uploadProofLabel: "上传付款凭证", submitProofButton: "提交付款凭证",
      uploadError: "上传失败。请检查文件类型（PDF、JPEG、PNG 或 WebP）及大小（小于 15MB）后重试。",
      paymentSubmittedHeading: "您的付款已提交待核实",
      paymentSubmittedBody: "感谢您！我们已收到您的付款信息，将尽快进行核实。付款核实后，您将收到邮件确认。您也可以通过 FIS 客户门户查询办理进度。",
      referenceLabel: "参考编号", portalLinkText: "前往 FIS 客户门户",
      paidHeading: "付款已核实",
      paidBody: "您的付款已核实。您可以通过 FIS 客户门户查询办理进度。",
    },
    "zh-Hant": {
      loading: "載入中...",
      errorGeneric: "發生問題，請再試一次，或直接與我們聯絡。",
      serviceNotFound: "找不到此服務，或此服務目前已不可用。",
      fullNameLabel: "姓名", emailLabel: "電子郵件",
      startButton: "繼續", sending: "傳送中...",
      checkEmailHeading: "請查收您的電子郵件",
      checkEmailBody: "我們已傳送確認連結至您的電子郵件，請點選郵件中的連結以繼續辦理。",
      questionnaireIntro: "請填寫以下問卷以繼續辦理。",
      deliveryHeading: "收件地址",
      recipientNameLabel: "收件人姓名", phoneLabel: "電話號碼", countryLabel: "國家/地區",
      internationalLabel: "這是國際地址",
      regionLabel: "省/州/地區", cityLabel: "城市", postalCodeLabel: "郵遞區號",
      addressLine1Label: "地址第一行", addressLine2Label: "地址第二行（選填）",
      deliveryNotice: "郵寄費用不包含在服務費中。文件備妥可寄送後，我們將另行提供郵寄報價及付款請求。",
      continueButton: "繼續", saving: "儲存中...",
      reviewHeading: "申請已提交",
      reviewIntro: "您的問卷已提交。請查看以下費用明細以繼續付款。",
      totalLabel: "總計", confirmAndPayButton: "確認並繼續付款",
      paymentHeading: "付款", amountLabel: "應付金額",
      paymentUnavailable: "目前暫不支援線上付款，請直接與 FIS 聯絡以完成辦理。",
      uploadProofLabel: "上傳付款憑證", submitProofButton: "提交付款憑證",
      uploadError: "上傳失敗。請檢查檔案類型（PDF、JPEG、PNG 或 WebP）及大小（小於 15MB）後再試一次。",
      paymentSubmittedHeading: "您的付款已提交待核實",
      paymentSubmittedBody: "感謝您！我們已收到您的付款資訊，將儘速進行核實。付款核實後，您將收到電子郵件確認。您也可以透過 FIS 客戶專區查詢辦理進度。",
      referenceLabel: "參考編號", portalLinkText: "前往 FIS 客戶專區",
      paidHeading: "付款已核實",
      paidBody: "您的付款已核實。您可以透過 FIS 客戶專區查詢辦理進度。",
    },
    ko: {
      loading: "불러오는 중...",
      errorGeneric: "문제가 발생했습니다. 다시 시도하시거나 저희에게 직접 문의해 주십시오.",
      serviceNotFound: "이 서비스를 찾을 수 없거나 현재 이용할 수 없습니다.",
      fullNameLabel: "성명", emailLabel: "이메일 주소",
      startButton: "계속", sending: "전송 중...",
      checkEmailHeading: "이메일을 확인해 주세요",
      checkEmailBody: "확인 링크가 포함된 이메일을 보내드렸습니다. 이메일의 링크를 클릭하여 신청을 계속해 주십시오.",
      questionnaireIntro: "신청을 계속하려면 아래 설문을 작성해 주십시오.",
      deliveryHeading: "배송 주소",
      recipientNameLabel: "수령인 성명", phoneLabel: "전화번호", countryLabel: "국가",
      internationalLabel: "국제 배송 주소입니다",
      regionLabel: "주/도/지역", cityLabel: "도시", postalCodeLabel: "우편번호",
      addressLine1Label: "주소 1", addressLine2Label: "주소 2 (선택)",
      deliveryNotice: "배송비는 서비스 수수료에 포함되어 있지 않습니다. 서류 발송 준비가 완료되면 별도의 배송 견적 및 결제 요청을 보내드립니다.",
      continueButton: "계속", saving: "저장 중...",
      reviewHeading: "신청이 제출되었습니다",
      reviewIntro: "설문이 제출되었습니다. 아래 금액 내역을 확인하신 후 결제를 진행해 주십시오.",
      totalLabel: "합계", confirmAndPayButton: "확인 후 결제 진행",
      paymentHeading: "결제", amountLabel: "결제 금액",
      paymentUnavailable: "현재 온라인 결제를 이용할 수 없습니다. 신청을 완료하시려면 FIS로 직접 문의해 주십시오.",
      uploadProofLabel: "결제 증빙 업로드", submitProofButton: "결제 증빙 제출",
      uploadError: "업로드에 실패했습니다. 파일 형식(PDF, JPEG, PNG 또는 WebP)과 크기(15MB 미만)를 확인한 후 다시 시도해 주십시오.",
      paymentSubmittedHeading: "결제 내역이 확인 대기 중입니다",
      paymentSubmittedBody: "감사합니다! 결제 정보를 수신했으며 곧 확인해 드리겠습니다. 결제가 확인되면 이메일로 안내해 드립니다. FIS 고객 포털에서도 신청 상태를 확인하실 수 있습니다.",
      referenceLabel: "참조번호", portalLinkText: "FIS 고객 포털로 이동",
      paidHeading: "결제가 확인되었습니다",
      paidBody: "결제가 확인되었습니다. FIS 고객 포털에서 신청 진행 상황을 확인하실 수 있습니다.",
    },
    ja: {
      loading: "読み込み中...",
      errorGeneric: "問題が発生しました。もう一度お試しいただくか、直接お問い合わせください。",
      serviceNotFound: "このサービスが見つからないか、現在ご利用いただけません。",
      fullNameLabel: "氏名", emailLabel: "メールアドレス",
      startButton: "次へ", sending: "送信中...",
      checkEmailHeading: "メールをご確認ください",
      checkEmailBody: "確認用のリンクをメールでお送りしました。メール内のリンクからお手続きをお進めください。",
      questionnaireIntro: "お手続きを続けるには、以下の質問にご回答ください。",
      deliveryHeading: "お届け先住所",
      recipientNameLabel: "受取人氏名", phoneLabel: "電話番号", countryLabel: "国",
      internationalLabel: "海外のご住所です",
      regionLabel: "都道府県・州・地域", cityLabel: "市区町村", postalCodeLabel: "郵便番号",
      addressLine1Label: "住所1", addressLine2Label: "住所2（任意）",
      deliveryNotice: "配送料はサービス料金に含まれておりません。書類の発送準備が整い次第、別途配送見積もりとお支払いのご案内をお送りいたします。",
      continueButton: "次へ", saving: "保存中...",
      reviewHeading: "お申し込みを受け付けました",
      reviewIntro: "アンケートが送信されました。以下の金額内訳をご確認のうえ、お支払いにお進みください。",
      totalLabel: "合計", confirmAndPayButton: "確認してお支払いに進む",
      paymentHeading: "お支払い", amountLabel: "お支払い金額",
      paymentUnavailable: "現在オンラインでのお支払いはご利用いただけません。お手続きを完了するには、FISまで直接お問い合わせください。",
      uploadProofLabel: "お支払い証明のアップロード", submitProofButton: "お支払い証明を送信",
      uploadError: "アップロードに失敗しました。ファイル形式（PDF、JPEG、PNG、WebP）とサイズ（15MB未満）をご確認のうえ、再度お試しください。",
      paymentSubmittedHeading: "お支払い内容を確認待ちで送信しました",
      paymentSubmittedBody: "ありがとうございます。お支払い情報を受け取りましたので、確認のうえ対応いたします。確認が完了次第、メールにてご連絡いたします。FISクライアントポータルからも進捗状況をご確認いただけます。",
      referenceLabel: "参照番号", portalLinkText: "FISクライアントポータルへ",
      paidHeading: "お支払いが確認されました",
      paidBody: "お支払いが確認されました。進捗状況はFISクライアントポータルよりご確認いただけます。",
    },
    vi: {
      loading: "Đang tải...",
      errorGeneric: "Đã xảy ra sự cố. Vui lòng thử lại, hoặc liên hệ trực tiếp với chúng tôi.",
      serviceNotFound: "Không tìm thấy dịch vụ này hoặc dịch vụ hiện không khả dụng.",
      fullNameLabel: "Họ và Tên", emailLabel: "Địa Chỉ Email",
      startButton: "Tiếp Tục", sending: "Đang gửi...",
      checkEmailHeading: "Vui Lòng Kiểm Tra Email",
      checkEmailBody: "Chúng tôi đã gửi liên kết xác nhận đến email của quý khách. Vui lòng nhấp vào liên kết trong email để tiếp tục yêu cầu.",
      questionnaireIntro: "Vui lòng hoàn thành bảng câu hỏi sau để tiếp tục yêu cầu.",
      deliveryHeading: "Địa Chỉ Giao Hàng",
      recipientNameLabel: "Tên Người Nhận", phoneLabel: "Số Điện Thoại", countryLabel: "Quốc Gia",
      internationalLabel: "Đây là địa chỉ quốc tế",
      regionLabel: "Tỉnh / Thành Phố / Khu Vực", cityLabel: "Thành Phố", postalCodeLabel: "Mã Bưu Điện",
      addressLine1Label: "Địa Chỉ Dòng 1", addressLine2Label: "Địa Chỉ Dòng 2 (tùy chọn)",
      deliveryNotice: "Phí giao hàng không bao gồm trong phí dịch vụ. Khi hồ sơ của quý khách sẵn sàng để gửi đi, chúng tôi sẽ cung cấp báo giá giao hàng và yêu cầu thanh toán riêng.",
      continueButton: "Tiếp Tục", saving: "Đang lưu...",
      reviewHeading: "Yêu Cầu Đã Được Gửi",
      reviewIntro: "Bảng câu hỏi của quý khách đã được gửi. Vui lòng xem chi tiết giá bên dưới để tiếp tục thanh toán.",
      totalLabel: "Tổng Cộng", confirmAndPayButton: "Xác Nhận và Tiếp Tục Thanh Toán",
      paymentHeading: "Thanh Toán", amountLabel: "Số Tiền Cần Thanh Toán",
      paymentUnavailable: "Hiện chưa thể thanh toán trực tuyến. Vui lòng liên hệ trực tiếp với FIS để hoàn tất yêu cầu này.",
      uploadProofLabel: "Tải Lên Chứng Từ Thanh Toán", submitProofButton: "Gửi Chứng Từ Thanh Toán",
      uploadError: "Tải lên không thành công. Vui lòng kiểm tra loại tệp (PDF, JPEG, PNG hoặc WebP) và kích thước (dưới 15MB), sau đó thử lại.",
      paymentSubmittedHeading: "Thanh Toán Của Quý Khách Đã Được Gửi Để Xác Minh",
      paymentSubmittedBody: "Cảm ơn quý khách! Chúng tôi đã nhận được thông tin thanh toán và sẽ sớm xem xét. Quý khách sẽ nhận được email xác nhận ngay khi thanh toán được xác minh. Quý khách cũng có thể theo dõi trạng thái yêu cầu qua Cổng Thông Tin Khách Hàng FIS.",
      referenceLabel: "Mã Tham Chiếu", portalLinkText: "Đến Cổng Thông Tin Khách Hàng FIS",
      paidHeading: "Thanh Toán Đã Được Xác Minh",
      paidBody: "Thanh toán của quý khách đã được xác minh. Quý khách có thể theo dõi tiến trình yêu cầu qua Cổng Thông Tin Khách Hàng FIS.",
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

  function formatPhp(centavos) {
    var pesos = Math.round(Number(centavos) || 0) / 100;
    return "₱" + pesos.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  var root = document.getElementById("instant-services-apply-content");
  if (!root) return;

  var params = new URLSearchParams(window.location.search);
  var serviceId = params.get("service");
  var orderId = params.get("order");
  var lang = CANONICAL_LANGUAGES.indexOf(params.get("lang")) !== -1 ? params.get("lang") : "en";
  document.documentElement.lang = lang;

  function renderError(message) {
    root.innerHTML = '<p class="form-status" role="alert">' + escapeHtml(message) + "</p>";
  }

  function renderLoading() {
    root.innerHTML = '<p class="muted">' + escapeHtml(t(lang, "loading")) + "</p>";
  }

  // ---- Screen: guest details (email capture) ----
  function renderGuestDetails(service) {
    root.innerHTML =
      '<div class="card">' +
      "<h2>" + escapeHtml(service.title) + "</h2>" +
      "<p>" + escapeHtml(service.shortDescription) + "</p>" +
      '<p class="instant-service-card__eligibility">' + escapeHtml(service.eligibilityText) + "</p>" +
      '<p class="instant-service-card__price">' + formatPhp(service.totalPhpCentavos) + "</p>" +
      '<form id="instant-services-guest-form" class="enquiry-form">' +
      '<div class="form-field hp-field" aria-hidden="true"><label for="website">Leave this field empty</label><input type="text" id="website" name="website" tabindex="-1" autocomplete="off"></div>' +
      '<div class="form-field form-field--full"><label for="fullName">' + escapeHtml(t(lang, "fullNameLabel")) + '</label><input type="text" id="fullName" name="fullName" autocomplete="name" required></div>' +
      '<div class="form-field form-field--full"><label for="email">' + escapeHtml(t(lang, "emailLabel")) + '</label><input type="email" id="email" name="email" autocomplete="email" required></div>' +
      '<div class="enquiry-form-actions"><button type="submit" class="btn btn-primary">' + escapeHtml(t(lang, "startButton")) + '</button><p class="form-status" aria-live="polite"></p></div>' +
      "</form>" +
      "</div>";

    var renderedAt = Date.now();
    var form = document.getElementById("instant-services-guest-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var status = form.querySelector(".form-status");
      var button = form.querySelector("button[type=submit]");
      button.disabled = true;
      status.textContent = t(lang, "sending");

      window
        .portalFetch("/api/instant-services/begin", {
          method: "POST",
          body: JSON.stringify({
            fullName: document.getElementById("fullName").value.trim(),
            email: document.getElementById("email").value.trim(),
            serviceId: serviceId,
            website: document.getElementById("website").value,
            formRenderedAt: renderedAt,
          }),
        })
        .then(function (resp) {
          if (!resp.ok) return resp.json().then((data) => Promise.reject(data));
          root.innerHTML =
            '<div class="card"><h2>' + escapeHtml(t(lang, "checkEmailHeading")) + "</h2><p>" + escapeHtml(t(lang, "checkEmailBody")) + "</p></div>";
        })
        .catch(function (data) {
          status.textContent = (data && data.error) || t(lang, "errorGeneric");
          button.disabled = false;
        });
    });
  }

  // ---- Screen: questionnaire (reuses portal-bi-form.js verbatim) ----
  function renderQuestionnaire(order) {
    root.innerHTML = '<div class="card"><p>' + escapeHtml(t(lang, "questionnaireIntro")) + '</p><div id="instant-services-questionnaire"></div></div>';
    var container = document.getElementById("instant-services-questionnaire");
    window.PortalBiForms.openBiFormDetail(
      container,
      order.submissionId,
      function () {}, // no "back" target -- this IS the whole page for this step
      lang
    );
    // openBiFormDetail re-renders into `container` on save/submit but never
    // tells this caller when a submit succeeded -- poll the order's own
    // submission status instead of hooking into its internals, so this
    // stays a thin wrapper rather than forking that file's logic.
    var poll = setInterval(function () {
      window
        .portalFetch("/api/instant-services/orders/" + order.id)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.submissionStatus && data.submissionStatus !== "draft" && data.submissionStatus !== "revision_requested") {
            clearInterval(poll);
            loadOrder();
          }
        });
    }, 2500);
  }

  // ---- Screen: delivery address ----
  function renderDeliveryAddress(order) {
    root.innerHTML =
      '<div class="card"><h2>' + escapeHtml(t(lang, "deliveryHeading")) + "</h2>" +
      '<form id="instant-services-delivery-form" class="enquiry-form">' +
      '<div class="form-field form-field--full"><label for="recipientName">' + escapeHtml(t(lang, "recipientNameLabel")) + '</label><input type="text" id="recipientName" required></div>' +
      '<div class="form-field"><label for="phone">' + escapeHtml(t(lang, "phoneLabel")) + '</label><input type="text" id="phone" required></div>' +
      '<div class="form-field"><label for="country">' + escapeHtml(t(lang, "countryLabel")) + '</label><input type="text" id="country" required></div>' +
      '<div class="form-field"><label for="city">' + escapeHtml(t(lang, "cityLabel")) + '</label><input type="text" id="city" required></div>' +
      '<div class="form-field"><label for="regionStateProvince">' + escapeHtml(t(lang, "regionLabel")) + '</label><input type="text" id="regionStateProvince"></div>' +
      '<div class="form-field"><label for="postalCode">' + escapeHtml(t(lang, "postalCodeLabel")) + '</label><input type="text" id="postalCode"></div>' +
      '<div class="form-field form-field--full"><label for="addressLine1">' + escapeHtml(t(lang, "addressLine1Label")) + '</label><input type="text" id="addressLine1" required></div>' +
      '<div class="form-field form-field--full"><label for="addressLine2">' + escapeHtml(t(lang, "addressLine2Label")) + '</label><input type="text" id="addressLine2"></div>' +
      '<div class="form-field form-field--full"><label class="portal-radio"><input type="checkbox" id="isInternational"> ' + escapeHtml(t(lang, "internationalLabel")) + "</label></div>" +
      '<div class="context-note"><p>' + escapeHtml(t(lang, "deliveryNotice")) + "</p></div>" +
      '<div class="enquiry-form-actions"><button type="submit" class="btn btn-primary">' + escapeHtml(t(lang, "continueButton")) + '</button><p class="form-status" aria-live="polite"></p></div>' +
      "</form></div>";

    var form = document.getElementById("instant-services-delivery-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var status = form.querySelector(".form-status");
      var button = form.querySelector("button[type=submit]");
      button.disabled = true;
      status.textContent = t(lang, "saving");

      window
        .portalFetch("/api/instant-services/orders/" + order.id + "/delivery-address", {
          method: "POST",
          body: JSON.stringify({
            recipientName: document.getElementById("recipientName").value.trim(),
            phone: document.getElementById("phone").value.trim(),
            country: document.getElementById("country").value.trim(),
            city: document.getElementById("city").value.trim(),
            regionStateProvince: document.getElementById("regionStateProvince").value.trim(),
            postalCode: document.getElementById("postalCode").value.trim(),
            addressLine1: document.getElementById("addressLine1").value.trim(),
            addressLine2: document.getElementById("addressLine2").value.trim(),
            isInternational: document.getElementById("isInternational").checked,
          }),
        })
        .then(function (resp) {
          if (!resp.ok) return resp.json().then((data) => Promise.reject(data));
          loadOrder();
        })
        .catch(function (data) {
          status.textContent = (data && data.error) || t(lang, "errorGeneric");
          button.disabled = false;
        });
    });
  }

  // ---- Screen: review + confirm-and-pay ----
  function renderReview(order, service) {
    var priceHtml = service.priceComponents
      .map(function (c) {
        return "<tr><td>" + escapeHtml(c.label) + "</td><td>" + formatPhp(c.amountPhpCentavos) + "</td></tr>";
      })
      .join("");
    root.innerHTML =
      '<div class="card"><h2>' + escapeHtml(t(lang, "reviewHeading")) + "</h2><p>" + escapeHtml(t(lang, "reviewIntro")) + "</p>" +
      '<table class="instant-services-price-table">' + priceHtml +
      "<tr><td><strong>" + escapeHtml(t(lang, "totalLabel")) + "</strong></td><td><strong>" + formatPhp(service.totalPhpCentavos) + "</strong></td></tr>" +
      "</table>" +
      '<div class="enquiry-form-actions"><button type="button" class="btn btn-primary" id="instant-services-confirm-pay">' + escapeHtml(t(lang, "confirmAndPayButton")) + '</button><p class="form-status" aria-live="polite"></p></div>' +
      "</div>";

    document.getElementById("instant-services-confirm-pay").addEventListener("click", function () {
      var status = root.querySelector(".form-status");
      var button = document.getElementById("instant-services-confirm-pay");
      button.disabled = true;
      status.textContent = t(lang, "saving");

      window
        .portalFetch("/api/instant-services/orders/" + order.id + "/confirm-and-pay", { method: "POST" })
        .then(function (resp) {
          if (!resp.ok) return resp.json().then((data) => Promise.reject(data));
          return resp.json();
        })
        .then(function () {
          loadOrder();
        })
        .catch(function (data) {
          status.textContent = (data && data.error) || t(lang, "paymentUnavailable");
          button.disabled = false;
        });
    });
  }

  // ---- Screen: payment (QR Ph) ----
  function renderPayment(order, payment) {
    var amount = order.priceSnapshot ? formatPhp(order.priceSnapshot.totalPhpCentavos) : payment ? "₱" + Number(payment.amountPhp).toFixed(2) : "";
    var merchantLine = payment && payment.merchantDisplayName ? "<p><strong>" + escapeHtml(payment.merchantDisplayName) + "</strong></p>" : "";
    var instructionsLine = payment && payment.instructions ? "<p>" + escapeHtml(payment.instructions) + "</p>" : "";
    root.innerHTML =
      '<div class="card"><h2>' + escapeHtml(t(lang, "paymentHeading")) + "</h2>" +
      '<p class="instant-service-card__price">' + escapeHtml(t(lang, "amountLabel")) + ": " + amount + "</p>" +
      merchantLine + instructionsLine +
      '<p><img id="instant-services-qr-image" alt="QR Ph" style="max-width:260px;border:1px solid #e2e2dc;border-radius:6px;"></p>' +
      '<label class="portal-upload-label">' + escapeHtml(t(lang, "uploadProofLabel")) + '<input type="file" id="instant-services-proof-upload" accept=".pdf,.jpg,.jpeg,.png,.webp"></label>' +
      '<p class="form-status" aria-live="polite"></p>' +
      "</div>";

    var img = document.getElementById("instant-services-qr-image");
    window
      .portalFetch("/api/instant-services/orders/" + order.id + "/qr-ph-image")
      .then(function (resp) {
        if (!resp.ok) throw new Error("not_configured");
        return resp.blob();
      })
      .then(function (blob) {
        img.src = URL.createObjectURL(blob);
      })
      .catch(function () {
        img.replaceWith(document.createTextNode(t(lang, "paymentUnavailable")));
      });

    var uploadInput = document.getElementById("instant-services-proof-upload");
    uploadInput.addEventListener("change", function () {
      var file = uploadInput.files[0];
      if (!file || !payment) return;
      var status = root.querySelector(".form-status");
      status.textContent = t(lang, "saving");
      file.arrayBuffer().then(function (buffer) {
        window
          .portalFetch("/api/applications/" + payment.applicationId + "/payments/" + payment.id + "/proof", {
            method: "POST",
            headers: { "X-Filename": file.name },
            body: buffer,
          })
          .then(function (resp) {
            if (!resp.ok) throw new Error("upload_failed");
            loadOrder();
          })
          .catch(function () {
            status.textContent = t(lang, "uploadError");
          });
      });
    });
  }

  // ---- Screens: awaiting verification / paid (final states) ----
  function renderAwaitingVerification(order) {
    root.innerHTML =
      '<div class="card"><h2>' + escapeHtml(t(lang, "paymentSubmittedHeading")) + "</h2><p>" + escapeHtml(t(lang, "paymentSubmittedBody")) + "</p>" +
      "<p>" + escapeHtml(t(lang, "referenceLabel")) + ": <strong>" + escapeHtml(order.id) + "</strong></p>" +
      '<p><a class="btn btn-secondary" href="/portal/">' + escapeHtml(t(lang, "portalLinkText")) + "</a></p>" +
      "</div>";
  }

  function renderPaid(order) {
    root.innerHTML =
      '<div class="card"><h2>' + escapeHtml(t(lang, "paidHeading")) + "</h2><p>" + escapeHtml(t(lang, "paidBody")) + "</p>" +
      '<p><a class="btn btn-primary" href="/portal/">' + escapeHtml(t(lang, "portalLinkText")) + "</a></p>" +
      "</div>";
  }

  // ---- The state machine: decide which screen to show from the order's
  // actual current state. Called on load and after every step completes. ----
  function loadOrder() {
    renderLoading();
    window
      .portalFetch("/api/instant-services/orders/" + orderId)
      .then(function (resp) {
        if (!resp.ok) return Promise.reject(new Error("order_not_found"));
        return resp.json();
      })
      .then(function (data) {
        var order = data.order;
        var service = data.service;

        if (order.status === "paid") return renderPaid(order);
        if (order.status === "awaiting_verification") return renderAwaitingVerification(order);
        if (order.status === "awaiting_payment") {
          return renderPayment(order, data.payment);
        }

        // Still "draft": figure out which step of the application is next.
        if (!order.submissionId) {
          return window
            .portalFetch("/api/instant-services/orders/" + order.id + "/application", { method: "POST" })
            .then(function (r) { return r.json(); })
            .then(function () { loadOrder(); });
        }
        if (!data.submissionStatus || data.submissionStatus === "draft" || data.submissionStatus === "revision_requested") {
          return renderQuestionnaire({ id: order.id, submissionId: order.submissionId });
        }
        if (service.supportsDelivery && !data.deliveryAddress) {
          return renderDeliveryAddress(order);
        }
        return renderReview(order, service);
      })
      .catch(function () {
        renderError(t(lang, "errorGeneric"));
      });
  }

  // ---- Entry point ----
  if (orderId) {
    loadOrder();
  } else if (serviceId) {
    renderLoading();
    window
      .portalFetch("/api/instant-services/catalogue/" + serviceId + "?lang=" + encodeURIComponent(lang))
      .then(function (resp) {
        if (!resp.ok) return Promise.reject(new Error("not_found"));
        return resp.json();
      })
      .then(function (data) {
        renderGuestDetails(data.service);
      })
      .catch(function () {
        renderError(t(lang, "serviceNotFound"));
      });
  } else {
    renderError(t(lang, "serviceNotFound"));
  }
})();
