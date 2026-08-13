(function () {
  "use strict";

  var form = document.getElementById("enquiry-form");
  if (!form) return;

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

  // No backend enquiry API exists yet (see docs/backend-requirements.md).
  // Until one does, submitting this form composes a pre-filled email to
  // info@foreignimmigration.ph via the visitor's own email client. This is
  // real, working behaviour — not a simulated submission — and no success
  // message is shown beyond describing that the email client has opened.
  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var lines = [];
    var fields = form.querySelectorAll("[data-field-label]");
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      var value = (field.value || "").trim();
      if (!value) continue;
      if (field.tagName === "SELECT") {
        value = field.options[field.selectedIndex].text;
      }
      lines.push(field.getAttribute("data-field-label") + ": " + value);
    }

    var subject = "Enquiry from foreignimmigration.ph";
    var body = lines.join("\n");
    var mailto =
      "mailto:info@foreignimmigration.ph" +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);

    window.location.href = mailto;

    var status = document.getElementById("enquiry-form-status");
    if (status) {
      status.textContent =
        "Your email client should now open with your enquiry details pre-filled. Please review the message and send it to complete your enquiry.";
    }
  });
})();
