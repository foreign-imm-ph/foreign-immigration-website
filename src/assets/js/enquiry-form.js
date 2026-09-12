(function () {
  "use strict";

  // Visible strings only. Field names, payload keys, the endpoint and all
  // submit/fallback logic below are identical for every locale. Falls back
  // to English for any locale not listed here, so this never needs to be
  // "complete" before a new locale directory can go live.
  var MESSAGES = {
    en: {
      sending: "Sending your enquiry...",
      mailtoSubject: "Enquiry from foreignimmigration.ph",
      mailtoFallback:
        "We couldn't reach our server just now, so your email client should open instead with your enquiry details pre-filled. Please review the message and send it to complete your enquiry.",
      received: function (reference) {
        return (
          "<p><strong>Enquiry received.</strong> Your reference is <strong>" + reference + "</strong>. " +
          "A confirmation has been sent to your email address. Our team will review your enquiry and contact you " +
          "if further information is needed. Submitting this enquiry does not itself constitute acceptance of an engagement.</p>"
        );
      },
    },
    "zh-CN": {
      sending: "正在发送您的咨询……",
      mailtoSubject: "来自 foreignimmigration.ph 的咨询",
      mailtoFallback:
        "我们暂时无法连接到服务器，因此您的电子邮件客户端应会打开，并预先填入您的咨询内容。请核对邮件内容后发送，以完成本次咨询。",
      received: function (reference) {
        return (
          "<p><strong>咨询已收到。</strong>您的参考编号为 <strong>" + reference + "</strong>。" +
          "确认邮件已发送至您的邮箱。我们的团队将审阅您的咨询，如需进一步信息会再与您联系。" +
          "提交本咨询本身并不构成接受委托。</p>"
        );
      },
    },
    ko: {
      sending: "문의를 전송하고 있습니다...",
      mailtoSubject: "foreignimmigration.ph에서 온 문의",
      mailtoFallback:
        "일시적으로 서버에 연결할 수 없어, 대신 이메일 클라이언트가 열리며 문의 내용이 미리 입력되어 있을 것입니다. 내용을 확인하신 후 전송하시면 문의가 완료됩니다.",
      received: function (reference) {
        return (
          "<p><strong>문의가 접수되었습니다.</strong> 참조번호는 <strong>" + reference + "</strong>입니다. " +
          "확인 이메일이 귀하의 이메일 주소로 발송되었습니다. 저희 팀이 문의 내용을 검토한 후 추가 정보가 필요한 경우 연락드리겠습니다. " +
          "본 문의 제출 자체가 위임 수락을 의미하지는 않습니다.</p>"
        );
      },
    },
    "zh-Hant": {
      sending: "正在傳送您的查詢...",
      mailtoSubject: "來自 foreignimmigration.ph 的查詢",
      mailtoFallback:
        "我們暫時無法連線至伺服器，因此您的電郵客戶端應會開啟，並預先填入您的查詢內容。請核對郵件內容後傳送，以完成本次查詢。",
      received: function (reference) {
        return (
          "<p><strong>查詢已收到。</strong>您的參考編號為 <strong>" + reference + "</strong>。" +
          "確認電郵已寄送至您的電郵地址。我們的團隊將審閱您的查詢，如需進一步資訊會再與您聯繫。" +
          "提交本查詢本身並不構成接受委任。</p>"
        );
      },
    },
    ja: {
      sending: "お問い合わせを送信しています...",
      mailtoSubject: "foreignimmigration.ph からのお問い合わせ",
      mailtoFallback:
        "現在サーバーに接続できないため、代わりにメールソフトが起動し、お問い合わせ内容があらかじめ入力された状態で開きます。内容をご確認のうえ送信いただくと、お問い合わせが完了します。",
      received: function (reference) {
        return (
          "<p><strong>お問い合わせを受け付けました。</strong>お客様の参照番号は <strong>" + reference + "</strong> です。" +
          "確認メールをご登録のメールアドレスに送信いたしました。担当チームが内容を確認し、追加情報が必要な場合はご連絡いたします。" +
          "本お問い合わせの送信は、委任契約の成立を意味するものではありません。</p>"
        );
      },
    },
    vi: {
      sending: "Đang gửi yêu cầu của quý khách...",
      mailtoSubject: "Yêu cầu từ foreignimmigration.ph",
      mailtoFallback:
        "Chúng tôi hiện không thể kết nối với máy chủ, do đó ứng dụng email của quý khách sẽ tự động mở với nội dung yêu cầu đã được điền sẵn. Vui lòng kiểm tra lại nội dung và gửi email để hoàn tất yêu cầu.",
      received: function (reference) {
        return (
          "<p><strong>Đã nhận được yêu cầu của quý khách.</strong> Mã số tham chiếu của quý khách là <strong>" + reference + "</strong>. " +
          "Email xác nhận đã được gửi đến địa chỉ email của quý khách. Đội ngũ của chúng tôi sẽ xem xét yêu cầu và liên hệ lại nếu cần thêm thông tin. " +
          "Việc gửi yêu cầu này không đồng nghĩa với việc chấp nhận hợp đồng dịch vụ.</p>"
        );
      },
    },
  };

  var form = document.getElementById("enquiry-form");
  if (!form) return;

  var pageLang = document.documentElement.lang || "en";
  var strings = MESSAGES[pageLang] || MESSAGES.en;

  var renderedAt = Date.now();

  // Preselect the "Service Required" field from a ?service= query parameter,
  // e.g. /contact/?service=airport-vip set by a service page's CTA link.
  var params = new URLSearchParams(window.location.search);
  var requestedService = params.get("service");
  if (requestedService) {
    var select = document.getElementById("service");
    if (select) {
      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === requestedService) {
          select.value = requestedService;
          break;
        }
      }
    }
  }

  // Carried from a service page's "Request Urgent Assistance" / "Request
  // Priority Assistance" CTA (e.g. /contact/?service=legal-support&priority=urgent).
  // This is only ever a hint — the Worker independently validates it against
  // the submitted service and silently downgrades anything it doesn't
  // recognize, so this value can't itself grant an enquiry elevated priority.
  var requestedPriority = params.get("priority");

  function fieldValue(name) {
    var el = form.elements[name];
    return el ? el.value.trim() : "";
  }

  function fallbackToMailto(reason) {
    var lines = [];
    var fields = form.querySelectorAll("[data-field-label]");
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      var value = (field.value || "").trim();
      if (!value) continue;
      if (field.tagName === "SELECT") value = field.options[field.selectedIndex].text;
      lines.push(field.getAttribute("data-field-label") + ": " + value);
    }
    var mailto =
      "mailto:info@foreignimmigration.ph" +
      "?subject=" + encodeURIComponent(strings.mailtoSubject) +
      "&body=" + encodeURIComponent(lines.join("\n"));
    window.location.href = mailto;

    var status = document.getElementById("enquiry-form-status");
    if (status) {
      status.textContent = strings.mailtoFallback;
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var status = document.getElementById("enquiry-form-status");
    var button = form.querySelector("button[type=submit]");
    button.disabled = true;
    if (status) status.textContent = strings.sending;

    var payload = {
      fullName: fieldValue("fullName"),
      email: fieldValue("email"),
      phone: fieldValue("phone"),
      phoneCountry: fieldValue("phoneCountry"),
      preferredContactMethod: fieldValue("preferredContactMethod"),
      nationality: fieldValue("nationality"),
      location: fieldValue("location"),
      language: fieldValue("language"),
      service: fieldValue("service"),
      priority: requestedPriority || "standard",
      description: fieldValue("description"),
      website: fieldValue("website"), // honeypot, real visitors never fill this
      formRenderedAt: renderedAt,
    };

    window
      .portalFetch("/api/enquiries", { method: "POST", body: JSON.stringify(payload) })
      .then(function (resp) {
        if (!resp.ok) return resp.json().then((data) => Promise.reject(new Error((data && data.error) || "request_failed")));
        return resp.json();
      })
      .then(function (data) {
        form.hidden = true;
        var confirmation = document.createElement("div");
        confirmation.className = "notice-box";
        confirmation.innerHTML = strings.received(data.reference);
        form.parentNode.insertBefore(confirmation, form.nextSibling);
      })
      .catch(function () {
        button.disabled = false;
        fallbackToMailto();
      });
  });
})();
