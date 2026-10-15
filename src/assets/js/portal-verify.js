(function () {
  "use strict";

  var CANONICAL_LANGUAGES = ["en", "zh-CN", "zh-Hant", "ko", "ja", "vi"];
  var STRINGS = {
    en: {
      portalTag: "Client Portal",
      verifyHeading: "Signing You In",
      verifyLede: "Please wait while we confirm your sign-in link...",
      missingToken: "This sign-in link is missing its token. Please request a new one from the sign-in page.",
      signedIn: "You're signed in. Redirecting...",
      invalidOrExpired: "This sign-in link is invalid or has expired. Please request a new one.",
    },
    "zh-CN": {
      portalTag: "客户门户",
      verifyHeading: "正在为您登录",
      verifyLede: "请稍候，我们正在确认您的登录链接...",
      missingToken: "此登录链接缺少令牌。请在登录页面重新获取链接。",
      signedIn: "您已登录。正在跳转...",
      invalidOrExpired: "此登录链接无效或已过期。请重新获取。",
    },
    "zh-Hant": {
      portalTag: "客戶專區",
      verifyHeading: "正在為您登入",
      verifyLede: "請稍候，我們正在確認您的登入連結...",
      missingToken: "此登入連結缺少驗證碼。請於登入頁面重新取得連結。",
      signedIn: "您已登入。正在跳轉...",
      invalidOrExpired: "此登入連結無效或已過期。請重新取得連結。",
    },
    ko: {
      portalTag: "고객 포털",
      verifyHeading: "로그인 처리 중",
      verifyLede: "로그인 링크를 확인하는 동안 잠시 기다려 주십시오...",
      missingToken: "이 로그인 링크에 토큰이 없습니다. 로그인 페이지에서 새 링크를 요청해 주십시오.",
      signedIn: "로그인되었습니다. 이동 중...",
      invalidOrExpired: "이 로그인 링크는 유효하지 않거나 만료되었습니다. 새 링크를 요청해 주십시오.",
    },
    ja: {
      portalTag: "クライアントポータル",
      verifyHeading: "サインイン処理中",
      verifyLede: "サインインリンクを確認しておりますので、しばらくお待ちください...",
      missingToken: "このサインインリンクにはトークンが含まれていません。サインインページから新しいリンクをご請求ください。",
      signedIn: "サインインしました。移動しています...",
      invalidOrExpired: "このサインインリンクは無効か、有効期限が切れています。新しいリンクをご請求ください。",
    },
    vi: {
      portalTag: "Cổng Thông Tin Khách Hàng",
      verifyHeading: "Đang Đăng Nhập",
      verifyLede: "Vui lòng chờ trong khi chúng tôi xác nhận liên kết đăng nhập của quý khách...",
      missingToken: "Liên kết đăng nhập này thiếu mã thông báo. Vui lòng yêu cầu liên kết mới từ trang đăng nhập.",
      signedIn: "Quý khách đã đăng nhập. Đang chuyển hướng...",
      invalidOrExpired: "Liên kết đăng nhập này không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.",
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

  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n-key]").forEach(function (el) {
    el.textContent = t(el.getAttribute("data-i18n-key"));
  });

  var status = document.getElementById("portal-verify-status");
  var params = new URLSearchParams(window.location.search);
  var token = params.get("token");

  if (!token) {
    status.textContent = t("missingToken");
    return;
  }

  window
    .portalFetch("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ token: token }),
    })
    .then(function (resp) {
      if (!resp.ok) return resp.json().then((data) => Promise.reject(data));
      status.textContent = t("signedIn");
      window.location.href = "/portal/";
    })
    .catch(function (data) {
      status.textContent = (data && data.error) || t("invalidOrExpired");
    });
})();
