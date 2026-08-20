(function () {
  "use strict";

  var status = document.getElementById("portal-verify-status");
  var params = new URLSearchParams(window.location.search);
  var token = params.get("token");

  if (!token) {
    status.textContent = "This sign-in link is missing its token. Please request a new one from the sign-in page.";
    return;
  }

  window
    .portalFetch("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ token: token }),
    })
    .then(function (resp) {
      if (!resp.ok) return resp.json().then((data) => Promise.reject(data));
      status.textContent = "You're signed in. Redirecting...";
      window.location.href = "/portal/";
    })
    .catch(function (data) {
      status.textContent =
        (data && data.error) ||
        "This sign-in link is invalid or has expired. Please request a new one.";
    });
})();
