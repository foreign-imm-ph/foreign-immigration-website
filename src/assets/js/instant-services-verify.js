(function () {
  "use strict";

  // Mirrors portal-verify.js exactly -- this redeems the token through the
  // SAME, unmodified /api/auth/verify endpoint (no Instant-Services-specific
  // verification route exists, by design). The only difference is where it
  // sends the customer afterwards: back into their own order's application
  // flow, carrying the language they started in, rather than the generic
  // Client Portal landing page.
  var status = document.getElementById("instant-services-verify-status");
  var params = new URLSearchParams(window.location.search);
  var token = params.get("token");
  var orderId = params.get("order");
  var lang = params.get("lang") || "en";

  if (!token || !orderId) {
    status.textContent = "This confirmation link is missing required information. Please start again from the Instant Checkout page.";
    return;
  }

  window
    .portalFetch("/api/auth/verify", { method: "POST", body: JSON.stringify({ token: token }) })
    .then(function (resp) {
      if (!resp.ok) return resp.json().then((data) => Promise.reject(data));
      status.textContent = "Confirmed. Redirecting...";
      window.location.href = "/instant-services/apply/?order=" + encodeURIComponent(orderId) + "&lang=" + encodeURIComponent(lang);
    })
    .catch(function (data) {
      status.textContent =
        (data && data.error) ||
        "This confirmation link is invalid or has expired. Please start again from the Instant Checkout page.";
    });
})();
