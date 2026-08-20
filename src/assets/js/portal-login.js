(function () {
  "use strict";

  var form = document.getElementById("portal-login-form");
  if (!form) return;

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var status = document.getElementById("portal-login-status");
    var email = document.getElementById("email").value.trim();
    var button = form.querySelector("button[type=submit]");

    button.disabled = true;
    status.textContent = "Sending...";

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
        status.textContent =
          "If that email is registered, a sign-in link has been sent. Please check your inbox and follow the link to continue.";
      })
      .catch(function () {
        status.textContent = "Something went wrong. Please try again.";
        button.disabled = false;
      });
  });
})();
