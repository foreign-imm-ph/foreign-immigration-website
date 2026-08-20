(function () {
  "use strict";

  var form = document.getElementById("enquiry-form");
  if (!form) return;

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
      "?subject=" + encodeURIComponent("Enquiry from foreignimmigration.ph") +
      "&body=" + encodeURIComponent(lines.join("\n"));
    window.location.href = mailto;

    var status = document.getElementById("enquiry-form-status");
    if (status) {
      status.textContent =
        "We couldn't reach our server just now, so your email client should open instead with your enquiry details pre-filled. Please review the message and send it to complete your enquiry.";
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var status = document.getElementById("enquiry-form-status");
    var button = form.querySelector("button[type=submit]");
    button.disabled = true;
    if (status) status.textContent = "Sending your enquiry...";

    var payload = {
      fullName: fieldValue("fullName"),
      email: fieldValue("email"),
      phone: fieldValue("phone"),
      nationality: fieldValue("nationality"),
      location: fieldValue("location"),
      language: fieldValue("language"),
      service: fieldValue("service"),
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
        confirmation.innerHTML =
          "<p><strong>Enquiry received.</strong> Your reference is <strong>" + data.reference + "</strong>. " +
          "A confirmation has been sent to your email address. Our team will review your enquiry and contact you " +
          "if further information is needed. Submitting this enquiry does not itself constitute acceptance of an engagement.</p>";
        form.parentNode.insertBefore(confirmation, form.nextSibling);
      })
      .catch(function () {
        button.disabled = false;
        fallbackToMailto();
      });
  });
})();
