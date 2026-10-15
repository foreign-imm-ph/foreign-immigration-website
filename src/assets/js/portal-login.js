(function () {
  "use strict";

  var CANONICAL_LANGUAGES = ["en", "zh-CN", "zh-Hant", "ko", "ja", "vi"];
  var STRINGS = {
    en: {
      portalTag: "Client Portal",
      signInHeading: "Sign In",
      signInLede: "Enter your email and we'll send you a secure sign-in link. No password needed.",
      emailLabel: "Email Address",
      sendLinkButton: "Send Sign-In Link",
      noAccountNote: "Don't have Client Portal access yet? {link} first and our team will set up your account.",
      noAccountLinkText: "Send us an enquiry",
      sending: "Sending...",
      sentBody: "If that email is registered, a sign-in link has been sent. Please check your inbox and follow the link to continue.",
      genericError: "Something went wrong. Please try again.",
    },
    "zh-CN": {
      portalTag: "客户门户",
      signInHeading: "登录",
      signInLede: "请输入您的电子邮箱，我们将发送一个安全登录链接给您，无需密码。",
      emailLabel: "电子邮箱",
      sendLinkButton: "发送登录链接",
      noAccountNote: "尚未开通客户门户访问权限？请先{link}，我们的团队将为您设置账户。",
      noAccountLinkText: "发送咨询",
      sending: "正在发送...",
      sentBody: "如果该邮箱已注册，登录链接已发送至您的邮箱。请查收邮件并点击链接以继续。",
      genericError: "出现问题，请重试。",
    },
    "zh-Hant": {
      portalTag: "客戶專區",
      signInHeading: "登入",
      signInLede: "請輸入您的電子郵件地址，我們將寄送安全登入連結給您，無需密碼。",
      emailLabel: "電子郵件地址",
      sendLinkButton: "傳送登入連結",
      noAccountNote: "尚未開通客戶專區存取權限？請先{link}，我們的團隊將為您設定帳戶。",
      noAccountLinkText: "傳送詢問",
      sending: "傳送中...",
      sentBody: "若該信箱已註冊，登入連結已寄送至您的信箱。請查收郵件並點擊連結以繼續。",
      genericError: "發生問題，請再試一次。",
    },
    ko: {
      portalTag: "고객 포털",
      signInHeading: "로그인",
      signInLede: "이메일을 입력하시면 안전한 로그인 링크를 보내드립니다. 비밀번호는 필요하지 않습니다.",
      emailLabel: "이메일 주소",
      sendLinkButton: "로그인 링크 받기",
      noAccountNote: "아직 고객 포털 접속 권한이 없으신가요? 먼저 {link} 보내주시면 저희 팀이 계정을 설정해 드립니다.",
      noAccountLinkText: "문의 보내기",
      sending: "전송 중...",
      sentBody: "해당 이메일이 등록되어 있는 경우 로그인 링크가 발송되었습니다. 받은편지함을 확인하신 후 링크를 클릭해 계속 진행해 주십시오.",
      genericError: "문제가 발생했습니다. 다시 시도해 주십시오.",
    },
    ja: {
      portalTag: "クライアントポータル",
      signInHeading: "サインイン",
      signInLede: "メールアドレスをご入力いただくと、安全なサインインリンクをお送りします。パスワードは不要です。",
      emailLabel: "メールアドレス",
      sendLinkButton: "サインインリンクを送信",
      noAccountNote: "クライアントポータルのアクセス権をまだお持ちでない場合は、まず{link}いただければ、担当チームがアカウントを設定いたします。",
      noAccountLinkText: "お問い合わせを送信",
      sending: "送信中...",
      sentBody: "ご登録のメールアドレスであれば、サインインリンクを送信いたしました。受信トレイをご確認のうえ、リンクより手続きをお進めください。",
      genericError: "問題が発生しました。もう一度お試しください。",
    },
    vi: {
      portalTag: "Cổng Thông Tin Khách Hàng",
      signInHeading: "Đăng Nhập",
      signInLede: "Nhập email của quý khách và chúng tôi sẽ gửi một liên kết đăng nhập an toàn. Không cần mật khẩu.",
      emailLabel: "Địa Chỉ Email",
      sendLinkButton: "Gửi Liên Kết Đăng Nhập",
      noAccountNote: "Chưa có quyền truy cập Cổng Thông Tin Khách Hàng? Vui lòng {link} trước và đội ngũ của chúng tôi sẽ thiết lập tài khoản cho quý khách.",
      noAccountLinkText: "gửi yêu cầu cho chúng tôi",
      sending: "Đang gửi...",
      sentBody: "Nếu email đó đã được đăng ký, một liên kết đăng nhập đã được gửi. Vui lòng kiểm tra hộp thư đến và nhấn vào liên kết để tiếp tục.",
      genericError: "Đã xảy ra sự cố. Vui lòng thử lại.",
    },
  };
  var lang = "en";
  try {
    var stored = window.localStorage.getItem("fisPreferredLocale");
    if (CANONICAL_LANGUAGES.indexOf(stored) !== -1) lang = stored;
  } catch (e) {
    /* localStorage unavailable -- default to English */
  }
  function t(key) {
    return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
  }
  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n-key]").forEach(function (el) {
    el.textContent = t(el.getAttribute("data-i18n-key"));
  });
  var noAccountNote = document.getElementById("portal-login-no-account-note");
  if (noAccountNote) {
    noAccountNote.innerHTML = escapeHtml(t("noAccountNote")).replace(
      "{link}",
      '<a href="/contact/">' + escapeHtml(t("noAccountLinkText")) + "</a>"
    );
  }

  var form = document.getElementById("portal-login-form");
  if (!form) return;

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var status = document.getElementById("portal-login-status");
    var email = document.getElementById("email").value.trim();
    var button = form.querySelector("button[type=submit]");

    button.disabled = true;
    status.textContent = t("sending");

    window
      .portalFetch("/api/auth/magic-link", {
        method: "POST",
        body: JSON.stringify({ email: email }),
      })
      .then(function () {
        // The API always returns the same generic response regardless of
        // whether the email matches an account; the frontend must not
        // treat this differently either.
        form.hidden = true;
        status.textContent = t("sentBody");
      })
      .catch(function () {
        status.textContent = t("genericError");
        button.disabled = false;
      });
  });
})();
