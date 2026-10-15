(function () {
  "use strict";

  // If the browser restores this page from its back-forward cache (e.g. a
  // client signs out on a shared computer, then someone hits Back), the
  // already-rendered DOM from the previous session could flash briefly
  // before anything re-checks auth, since bfcache restoration doesn't
  // re-fire the events this file's initial load relies on. Forcing a
  // real reload on restore guarantees the auth check below always reruns.
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) window.location.reload();
  });

  var STATUS_LABELS = {
    enquiry_received: "Enquiry received",
    under_review: "Under review",
    documents_required: "Documents required",
    documents_received: "Documents received",
    preparing_application: "Preparing application",
    submitted: "Submitted",
    awaiting_authority_action: "Awaiting authority action",
    additional_information_required: "Additional information required",
    completed: "Completed",
  };

  function statusLabel(status) {
    return STATUS_LABELS[status] || status.replace(/_/g, " ");
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso.replace(" ", "T") + (iso.endsWith("Z") ? "" : "Z"));
    return isNaN(d) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  var appEl = document.getElementById("portal-app");
  var loadingEl = document.getElementById("portal-loading");
  var welcomeEl = document.getElementById("portal-welcome");
  var currentClient = null;

  window
    .portalFetch("/api/auth/me")
    .then(function (resp) {
      if (!resp.ok) {
        window.location.href = "/portal/login/";
        return Promise.reject();
      }
      return resp.json();
    })
    .then(function (data) {
      currentClient = data.client;
      welcomeEl.textContent = "Welcome, " + currentClient.fullName;
      loadingEl.hidden = true;
      appEl.hidden = false;
      loadApplications();
      setupTabs();
      setupProfileForm();
      setupConsentToggles();
      setupLogout();
    })
    .catch(function () {
      /* already redirected */
    });

  function setupTabs() {
    var tabs = document.querySelectorAll(".portal-tab");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) {
          t.setAttribute("aria-selected", t === tab ? "true" : "false");
        });
        document.querySelectorAll(".portal-panel").forEach(function (panel) {
          panel.hidden = panel.id !== "portal-panel-" + tab.dataset.tab;
        });
        if (tab.dataset.tab === "profile") loadProfile();
      });
    });
  }

  function setupLogout() {
    document.getElementById("portal-logout").addEventListener("click", function () {
      window.portalFetch("/api/auth/logout", { method: "POST" }).then(function () {
        window.location.href = "/portal/login/";
      });
    });
  }

  // ---- Applications & Services ----

  function loadApplications() {
    window
      .portalFetch("/api/applications")
      .then(function (resp) { return resp.json(); })
      .then(function (data) { renderApplicationsList(data.applications); });
  }

  function renderApplicationsList(applications) {
    var listEl = document.getElementById("portal-applications-list");
    var template = document.getElementById("portal-application-item-template");
    listEl.innerHTML = "";

    if (!applications.length) {
      listEl.innerHTML = '<p class="muted">No applications yet. Once our team reviews your enquiry, it will appear here.</p>';
      return;
    }

    applications.forEach(function (application) {
      var node = template.content.cloneNode(true);
      var btn = node.querySelector(".portal-application-item");
      btn.querySelector(".portal-application-item__ref").textContent = application.reference;
      btn.querySelector(".portal-application-item__service").textContent = application.service_slug.replace(/-/g, " ");
      // The compact list row has room for one badge -- prefer whichever
      // status is most consequential to the customer right now (a
      // booking's own status, then payment, then the generic enquiry/
      // document status), rather than always defaulting to the latter.
      // The full detail view (renderApplicationDetail) always shows all
      // three separately -- this is a space-constrained summary, not a
      // second place the dimensions get merged into one.
      var badgeLabel = (application.bookingStatus && application.bookingStatus.statusLabel) ||
        (application.checkoutOrder && application.checkoutOrder.statusLabel) ||
        application.statusLabel || statusLabel(application.status);
      btn.querySelector(".portal-application-item__status").textContent = badgeLabel;
      btn.addEventListener("click", function () { loadApplicationDetail(application.id); });
      listEl.appendChild(node);
    });
  }

  function loadApplicationDetail(applicationId) {
    var detailEl = document.getElementById("portal-application-detail");
    detailEl.hidden = false;
    detailEl.innerHTML = '<p class="muted">Loading...</p>';
    detailEl.scrollIntoView({ behavior: "smooth", block: "start" });

    Promise.all([
      window.portalFetch("/api/applications/" + applicationId).then((r) => r.json()),
      window.portalFetch("/api/applications/" + applicationId + "/documents").then((r) => r.json()),
      window.portalFetch("/api/applications/" + applicationId + "/messages").then((r) => r.json()),
      window.portalFetch("/api/applications/" + applicationId + "/payments").then((r) => r.json()),
      window.portalFetch("/api/bi-forms").then((r) => r.json()),
    ]).then(function (results) {
      renderApplicationDetail(applicationId, results[0], results[1], results[2], results[3], results[4]);
    });
  }

  function renderApplicationDetail(applicationId, appData, docsData, msgData, payData, biFormsData) {
    var detailEl = document.getElementById("portal-application-detail");
    var application = appData.application;

    var historyHtml = appData.history
      .map(function (h) {
        var label = h.statusLabel || statusLabel(h.status);
        var noteHtml = "";
        if (h.noteTranslationStatus === "ready" && h.noteTranslated) {
          // Bilingual-capable, but a status note is not a payment — the
          // client sees the translated note primarily, with the English
          // original available as a discreet disclosure (same pattern as
          // the "Show English original" control on portal messages).
          noteHtml =
            '<br><span class="muted">' + escapeHtml(h.noteTranslated) + '</span>' +
            '<details class="portal-message-original"><summary>Show English original</summary><p>' + escapeHtml(h.note) + '</p></details>';
        } else if (h.note) {
          noteHtml = '<br><span class="muted">' + escapeHtml(h.note) + '</span>';
        }
        return '<li><strong>' + escapeHtml(label) + '</strong>, ' + formatDate(h.changedAt) + noteHtml + '</li>';
      })
      .join("");

    var docRequestsHtml = docsData.documentRequests
      .map(function (dr) {
        var uploaded = docsData.documents.find((d) => d.document_request_id === dr.id);
        var labelHtml = '<span>' + escapeHtml(dr.label) + '</span>';
        if (dr.labelTranslationStatus === "ready" && dr.labelTranslated) {
          // Translated primary, English original as a discreet disclosure
          // (Phase 3.1 Section 13) — not hidden entirely, but not the
          // always-visible bilingual treatment payments get either.
          labelHtml =
            '<span>' + escapeHtml(dr.labelTranslated) + '</span>' +
            '<details class="portal-message-original"><summary>Show English original</summary><p>' + escapeHtml(dr.label) + '</p></details>';
        }
        return '<li class="portal-doc-request" data-request-id="' + dr.id + '">' +
          labelHtml + ' ' +
          '<span class="status-badge">' + escapeHtml(dr.status) + '</span>' +
          (uploaded
            ? '<span class="muted">: ' + escapeHtml(uploaded.original_filename) + '</span>'
            : '<label class="portal-upload-label">Upload<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" class="portal-doc-upload" data-request-id="' + dr.id + '"></label>') +
          '</li>';
      })
      .join("") || '<li class="muted">No documents requested yet.</li>';

    var messagesHtml = msgData.messages
      .map(function (m) {
        // english_original is present only for a translated staff reply
        // (never for the client's own messages) — a native <details>
        // disclosure keeps the toggle simple, accessible, and JS-free.
        var originalHtml = m.english_original
          ? '<details class="portal-message-original"><summary>Show English original</summary><p>' + escapeHtml(m.english_original) + '</p></details>'
          : '';
        return '<div class="portal-message portal-message--' + m.sender_type + '"><strong>' + escapeHtml(m.sender_label) + '</strong> <span class="muted">' + formatDate(m.created_at) + '</span><p>' + escapeHtml(m.body) + '</p>' + originalHtml + '</div>';
      })
      .join("") || '<p class="muted">No messages yet.</p>';

    var paymentsHtml = payData.payments
      .map(function (p) {
        var actionHtml = "";
        if (p.status === "pending") {
          var onlineInstructions = payData.qrPhConfigured
            ? '<img src="' + window.PORTAL_API_BASE + '/api/qr-ph-image" alt="QR Ph payment QR code" class="portal-qr-image">' +
              "<p>Please make your online payment using QR Ph.</p>"
            : "<p>Online payment instructions will be provided by our team.</p>";
          actionHtml =
            '<div class="portal-payment-instructions">' +
            onlineInstructions +
            "<p class=\"muted\">Debit and credit card payments are currently accepted in person through our POS terminal.</p>" +
            '<label class="portal-upload-label">Upload proof of payment<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" class="portal-payment-proof-upload" data-payment-id="' + p.id + '"></label>' +
            "</div>";
        } else if (p.status === "submitted") {
          actionHtml = '<p class="muted">Proof received. Awaiting verification by our team.</p>';
        }
        // Bilingual by design (Phase 3.1 Section 17): once a translation
        // is ready, BOTH the English original and the translated
        // description are always shown, never one hidden behind a
        // disclosure — this is money, not a status update or a document
        // request title.
        var descriptionHtml;
        if (p.descriptionTranslationStatus === "ready" && p.descriptionTranslated) {
          descriptionHtml =
            '<p><strong>English Description</strong><br>' + escapeHtml(p.description) + '</p>' +
            '<p><strong>' + escapeHtml(p.descriptionHeading || "Translated Description") + '</strong><br>' + escapeHtml(p.descriptionTranslated) + '</p>' +
            (p.discrepancyWarning ? '<p class="muted portal-payment-warning">' + escapeHtml(p.discrepancyWarning) + '</p>' : '');
        } else {
          descriptionHtml = '<p>' + escapeHtml(p.description) + '</p>';
        }
        return '<li class="portal-payment"><div><strong>PHP ' + Number(p.amountPhp).toFixed(2) + '</strong> <span class="status-badge">' + escapeHtml(p.status) + '</span></div>' + descriptionHtml + actionHtml + '</li>';
      })
      .join("") || '<li class="muted">No payments requested yet.</li>';

    // Finding F1 (October review): application.status is the document/
    // enquiry-processing pipeline ONLY -- a linked Order & Book Online
    // order's payment status, and an Airport VIP booking's own status,
    // are each a DIFFERENT dimension and are shown as their own line,
    // never merged into or replacing the line above. A customer whose
    // payment is verified but whose booking availability is still under
    // review must see BOTH facts, not one overwriting the other.
    var checkoutOrder = appData.checkoutOrder;
    var bookingStatus = appData.bookingStatus;
    var statusLinesHtml =
      '<p><strong>Service:</strong> ' + escapeHtml(application.service_slug.replace(/-/g, " ")) + ' &nbsp; <strong>Status:</strong> <span class="status-badge">' + escapeHtml(application.statusLabel || statusLabel(application.status)) + "</span></p>" +
      (checkoutOrder ? '<p><strong>Payment:</strong> <span class="status-badge">' + escapeHtml(checkoutOrder.statusLabel) + "</span></p>" : "") +
      (bookingStatus ? '<p><strong>Airport VIP Booking:</strong> <span class="status-badge">' + escapeHtml(bookingStatus.statusLabel) + "</span></p>" : "");

    detailEl.innerHTML =
      '<div class="card portal-detail-card">' +
      '<h2>' + escapeHtml(application.reference) + '</h2>' +
      statusLinesHtml +
      (historyHtml ? '<h3>Status History</h3><ul class="portal-history">' + historyHtml + "</ul>" : "") +
      '<div id="portal-bi-forms-section"></div>' +
      (bookingStatus ? '<div id="portal-airport-vip-section"></div>' : "") +
      '<h3>Documents</h3><ul class="portal-doc-requests">' + docRequestsHtml + "</ul>" +
      '<h3>Messages</h3><div class="portal-messages">' + messagesHtml + '</div>' +
      '<form class="portal-message-form"><textarea placeholder="Write a message..." required></textarea><button type="submit" class="btn btn-secondary">Send</button></form>' +
      '<h3>Payments</h3><ul class="portal-payments">' + paymentsHtml + "</ul>" +
      "</div>";

    wireDetailInteractions(detailEl, applicationId);

    // BI Forms assigned to THIS application, rendered via the dedicated
    // questionnaire module (Phase 2 Stage 5.4) -- kept as a separate file
    // (portal-bi-form.js) rather than folded in here given its own scope
    // (generic multi-language question rendering, draft/submit,
    // documents), but still just another section of this same detail view.
    if (window.PortalBiForms) {
      var ownForms = (biFormsData.submissions || []).filter(function (s) { return s.applicationId === applicationId; });
      wireBiFormsSection(applicationId, ownForms);
    }

    if (bookingStatus && checkoutOrder) {
      wireAirportVipSection(checkoutOrder.id);
    }
  }

  // ---------------------------------------------------------------------
  // Airport VIP booking details + rescheduling (Stage 4C/§12 of the Order
  // & Book Online directive). Flight/passenger details and the reschedule-
  // request history come from the SAME customer-facing booking routes the
  // guest application flow uses (worker/src/routes/airportVipCustomer.js)
  // -- nothing about a booking's data is duplicated here. The 120-hour
  // eligibility wording is always whatever the backend just computed;
  // this file never calculates or guesses it.
  // ---------------------------------------------------------------------
  function wireAirportVipSection(orderId) {
    var sectionEl = document.getElementById("portal-airport-vip-section");
    if (!sectionEl) return;
    sectionEl.innerHTML = '<p class="muted">Loading booking details...</p>';

    window
      .portalFetch("/api/instant-services/orders/" + orderId + "/booking")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var booking = data.booking;
        if (!booking) {
          sectionEl.innerHTML = "";
          return;
        }
        renderAirportVipSection(sectionEl, booking);
      })
      .catch(function () {
        sectionEl.innerHTML = '<p class="muted">Booking details could not be loaded right now.</p>';
      });
  }

  var RESCHEDULABLE_BOOKING_STATUSES = ["confirmed", "rescheduled"];

  function renderAirportVipSection(sectionEl, booking) {
    var flightHtml =
      '<p><strong>Flight:</strong> ' + escapeHtml(booking.airline) + " " + escapeHtml(booking.flightNumber) +
      (booking.flightRoute ? " (" + escapeHtml(booking.flightRoute) + ")" : "") + "<br>" +
      '<strong>Scheduled:</strong> ' + escapeHtml(booking.scheduledLocalDate) + " " + escapeHtml(booking.scheduledLocalTime) + " (" + escapeHtml(booking.scheduledTimezone) + ")<br>" +
      '<strong>Passengers:</strong> ' + escapeHtml(booking.passengerNames.join(", ")) + "</p>";

    var canReschedule = RESCHEDULABLE_BOOKING_STATUSES.indexOf(booking.status) !== -1;
    var rescheduleFormHtml = canReschedule
      ? '<form class="portal-reschedule-form enquiry-form">' +
        '<h4>Request a Flight Change</h4>' +
        '<div class="form-field"><label for="reschedAirline">Airline</label><input type="text" id="reschedAirline" required></div>' +
        '<div class="form-field"><label for="reschedFlightNumber">Flight Number</label><input type="text" id="reschedFlightNumber" required></div>' +
        '<div class="form-field"><label for="reschedRoute">Flight Origin / Destination (optional)</label><input type="text" id="reschedRoute"></div>' +
        '<div class="form-field"><label for="reschedDate">New Scheduled Flight Date</label><input type="date" id="reschedDate" required></div>' +
        '<div class="form-field"><label for="reschedTime">New Scheduled Flight Time</label><input type="time" id="reschedTime" required></div>' +
        '<div class="form-field form-field--full"><label for="reschedNote">Note (optional)</label><textarea id="reschedNote"></textarea></div>' +
        '<div class="enquiry-form-actions"><button type="submit" class="btn btn-secondary">Submit Flight Change Request</button><p class="form-status" aria-live="polite"></p></div>' +
        "</form>"
      : '<p class="muted">Rescheduling can be requested once this booking has been confirmed.</p>';

    sectionEl.innerHTML =
      '<h3>Airport VIP Booking</h3>' +
      '<div class="card">' + flightHtml + rescheduleFormHtml +
      '<div class="portal-reschedule-requests"></div>' +
      "</div>";

    loadRescheduleRequests(sectionEl, booking.id);

    var form = sectionEl.querySelector(".portal-reschedule-form");
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var status = form.querySelector(".form-status");
        var button = form.querySelector("button[type=submit]");
        button.disabled = true;
        status.textContent = "Submitting...";

        window
          .portalFetch("/api/instant-services/bookings/" + booking.id + "/reschedule-requests", {
            method: "POST",
            body: JSON.stringify({
              airline: document.getElementById("reschedAirline").value.trim(),
              flightNumber: document.getElementById("reschedFlightNumber").value.trim(),
              flightRoute: document.getElementById("reschedRoute").value.trim(),
              scheduledLocalDate: document.getElementById("reschedDate").value,
              scheduledLocalTime: document.getElementById("reschedTime").value,
              scheduledTimezone: booking.scheduledTimezone,
              customerNote: document.getElementById("reschedNote").value.trim(),
            }),
          })
          .then(function (resp) {
            if (!resp.ok) return resp.json().then((data) => Promise.reject(data));
            return resp.json();
          })
          .then(function (result) {
            // Never a guarantee -- surfaces exactly what the backend
            // decided from the 120-hour rule, in the directive's own
            // required wording, and nothing stronger.
            status.textContent = result.eligible
              ? "Request submitted. Eligible for rescheduling, subject to availability."
              : "Request submitted. This change was notified less than 120 hours before the originally scheduled departure, so it does not qualify for rescheduling under the standard policy.";
            form.reset();
            button.disabled = false;
            loadRescheduleRequests(sectionEl, booking.id);
          })
          .catch(function (data) {
            status.textContent = (data && data.error) || "Something went wrong. Please try again.";
            button.disabled = false;
          });
      });
    }
  }

  function loadRescheduleRequests(sectionEl, bookingId) {
    var listEl = sectionEl.querySelector(".portal-reschedule-requests");
    if (!listEl) return;
    window
      .portalFetch("/api/instant-services/bookings/" + bookingId + "/reschedule-requests")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var requests = data.requests || [];
        if (!requests.length) {
          listEl.innerHTML = "";
          return;
        }
        var decisionLabel = { pending: "Awaiting staff review", approved: "Approved", exception_approved: "Approved (exception)", rejected: "Not approved" };
        listEl.innerHTML =
          "<h4>Flight Change Requests</h4><ul class=\"portal-history\">" +
          requests
            .map(function (r) {
              var pf = r.proposedFlight;
              return "<li><strong>" + escapeHtml(pf.airline) + " " + escapeHtml(pf.flightNumber) + "</strong> &rarr; " +
                escapeHtml(pf.scheduledLocalDate) + " " + escapeHtml(pf.scheduledLocalTime) +
                "<br><span class=\"status-badge\">" + escapeHtml(decisionLabel[r.staffDecision] || r.staffDecision) + "</span></li>";
            })
            .join("") +
          "</ul>";
      })
      .catch(function () {
        listEl.innerHTML = "";
      });
  }

  function wireBiFormsSection(applicationId, submissions) {
    var sectionEl = document.getElementById("portal-bi-forms-section");
    var detailEl = document.getElementById("portal-application-detail");
    var biFormViewEl = document.getElementById("portal-bi-form-view");
    // Per-submission preferredLanguage (saved on first draft/submit) is
    // the authoritative source once a form has been touched -- /api/auth/me
    // intentionally returns only id/fullName/email, so there is no
    // client-wide language preference available here to fall back to
    // without a separate /api/profile fetch; a never-touched submission
    // simply defaults to English until the customer picks a language.
    window.PortalBiForms.wireBiFormsSection(sectionEl, submissions, function (submissionId) {
      detailEl.hidden = true;
      biFormViewEl.hidden = false;
      biFormViewEl.scrollIntoView({ behavior: "smooth", block: "start" });
      window.PortalBiForms.openBiFormDetail(biFormViewEl, submissionId, function () {
        biFormViewEl.hidden = true;
        detailEl.hidden = false;
      });
    });
  }

  function wireDetailInteractions(detailEl, applicationId) {
    detailEl.querySelectorAll(".portal-doc-upload").forEach(function (input) {
      input.addEventListener("change", function () {
        var file = input.files[0];
        if (!file) return;
        var requestId = input.dataset.requestId;
        uploadFile("/api/applications/" + applicationId + "/documents?documentRequestId=" + requestId, file).then(function (ok) {
          if (ok) loadApplicationDetail(applicationId);
          else alert("Upload failed. Please check the file type (PDF, JPEG, PNG or WebP) and size (under 15MB), then try again.");
        });
      });
    });

    detailEl.querySelectorAll(".portal-payment-proof-upload").forEach(function (input) {
      input.addEventListener("change", function () {
        var file = input.files[0];
        if (!file) return;
        var paymentId = input.dataset.paymentId;
        uploadFile("/api/applications/" + applicationId + "/payments/" + paymentId + "/proof", file).then(function (ok) {
          if (ok) loadApplicationDetail(applicationId);
          else alert("Upload failed. Please check the file type and size, then try again.");
        });
      });
    });

    var msgForm = detailEl.querySelector(".portal-message-form");
    if (msgForm) {
      msgForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var textarea = msgForm.querySelector("textarea");
        var body = textarea.value.trim();
        if (!body) return;
        window
          .portalFetch("/api/applications/" + applicationId + "/messages", {
            method: "POST",
            body: JSON.stringify({ body: body }),
          })
          .then(function () { loadApplicationDetail(applicationId); });
      });
    }
  }

  function uploadFile(path, file) {
    return file.arrayBuffer().then(function (buffer) {
      return window
        .portalFetch(path, {
          method: "POST",
          headers: { "X-Filename": file.name },
          body: buffer,
        })
        .then(function (resp) {
          // The explicit headers object above replaces portalFetch's default
          // JSON Content-Type entirely, so the binary body isn't mislabelled.
          return resp.ok;
        });
    });
  }

  // ---- Profile ----

  var CONSENT_CHANNELS = ["sms", "whatsapp", "telegram", "wechat"];

  function loadProfile() {
    window
      .portalFetch("/api/profile")
      .then((r) => r.json())
      .then(function (data) {
        document.getElementById("profile-fullName").value = data.fullName || "";
        document.getElementById("profile-email").value = data.email || "";
        document.getElementById("profile-phone").value = data.phone || "";
        document.getElementById("profile-nationality").value = data.nationality || "";
        document.getElementById("profile-preferredLanguage").value = data.preferredCommunicationLanguage || "";

        // Phase 3.1 correction: the active-channel selector only offers
        // Email/Client Portal, but an account may already have an inactive
        // value on file (from before this correction). Represent it
        // honestly with an extra option rather than silently showing no
        // selection, without making it newly selectable once changed away
        // from — resubmitting the form unchanged still preserves it
        // (server allows only the unchanged value through), but choosing
        // Email/Client Portal/Not specified switches away for good.
        var channelSelect = document.getElementById("profile-preferredChannel");
        var currentChannel = data.preferredCommunicationChannel || "";
        if (currentChannel && !channelSelect.querySelector('option[value="' + currentChannel + '"]')) {
          var inactiveOption = document.createElement("option");
          inactiveOption.value = currentChannel;
          inactiveOption.textContent = currentChannel + " (not currently active)";
          channelSelect.appendChild(inactiveOption);
        }
        channelSelect.value = currentChannel;
        document.getElementById("profile-mobileNumber").value = data.mobileE164 || "";
        document.getElementById("profile-mobileCountry").value = "";

        var consents = data.consents || {};
        CONSENT_CHANNELS.forEach(function (channel) {
          var box = document.getElementById("consent-" + channel);
          if (box) box.checked = consents[channel] === "granted";
        });
      });
  }

  function setupProfileForm() {
    var form = document.getElementById("portal-profile-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var status = document.getElementById("portal-profile-status");
      status.textContent = "Saving...";
      window
        .portalFetch("/api/profile", {
          method: "PATCH",
          body: JSON.stringify({
            fullName: document.getElementById("profile-fullName").value,
            phone: document.getElementById("profile-phone").value,
            nationality: document.getElementById("profile-nationality").value,
            preferredCommunicationLanguage: document.getElementById("profile-preferredLanguage").value,
            preferredCommunicationChannel: document.getElementById("profile-preferredChannel").value,
            mobileNumber: document.getElementById("profile-mobileNumber").value,
            mobileCountry: document.getElementById("profile-mobileCountry").value,
          }),
        })
        .then(function (resp) {
          if (resp.ok) {
            status.textContent = "Saved.";
            return;
          }
          resp
            .json()
            .then(function (data) {
              status.textContent = (data && data.error) || "Something went wrong. Please try again.";
            })
            .catch(function () {
              status.textContent = "Something went wrong. Please try again.";
            });
        });
    });
  }

  function setupConsentToggles() {
    var status = document.getElementById("portal-consent-status");
    CONSENT_CHANNELS.forEach(function (channel) {
      var box = document.getElementById("consent-" + channel);
      if (!box) return;
      box.addEventListener("change", function () {
        var desiredStatus = box.checked ? "granted" : "revoked";
        status.textContent = "Saving...";
        window
          .portalFetch("/api/consents", {
            method: "POST",
            body: JSON.stringify({ channel: channel, status: desiredStatus }),
          })
          .then(function (resp) {
            if (resp.ok) {
              status.textContent = "Saved.";
            } else {
              box.checked = !box.checked;
              status.textContent = "Something went wrong. Please try again.";
            }
          });
      });
    });
  }
})();
