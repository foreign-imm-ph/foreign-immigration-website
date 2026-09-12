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
      btn.querySelector(".portal-application-item__status").textContent = statusLabel(application.status);
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
    ]).then(function (results) {
      renderApplicationDetail(applicationId, results[0], results[1], results[2], results[3]);
    });
  }

  function renderApplicationDetail(applicationId, appData, docsData, msgData, payData) {
    var detailEl = document.getElementById("portal-application-detail");
    var application = appData.application;

    var historyHtml = appData.history
      .map((h) => '<li><strong>' + escapeHtml(statusLabel(h.status)) + '</strong>, ' + formatDate(h.changed_at) + (h.note ? '<br><span class="muted">' + escapeHtml(h.note) + '</span>' : '') + '</li>')
      .join("");

    var docRequestsHtml = docsData.documentRequests
      .map(function (dr) {
        var uploaded = docsData.documents.find((d) => d.document_request_id === dr.id);
        return '<li class="portal-doc-request" data-request-id="' + dr.id + '">' +
          '<span>' + escapeHtml(dr.label) + '</span> ' +
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
        return '<li class="portal-payment"><div><strong>PHP ' + Number(p.amount_php).toFixed(2) + '</strong>: ' + escapeHtml(p.description) + ' <span class="status-badge">' + escapeHtml(p.status) + '</span></div>' + actionHtml + '</li>';
      })
      .join("") || '<li class="muted">No payments requested yet.</li>';

    detailEl.innerHTML =
      '<div class="card portal-detail-card">' +
      '<h2>' + escapeHtml(application.reference) + '</h2>' +
      '<p><strong>Service:</strong> ' + escapeHtml(application.service_slug.replace(/-/g, " ")) + ' &nbsp; <strong>Status:</strong> <span class="status-badge">' + escapeHtml(statusLabel(application.status)) + "</span></p>" +
      (historyHtml ? '<h3>Status History</h3><ul class="portal-history">' + historyHtml + "</ul>" : "") +
      '<h3>Documents</h3><ul class="portal-doc-requests">' + docRequestsHtml + "</ul>" +
      '<h3>Messages</h3><div class="portal-messages">' + messagesHtml + '</div>' +
      '<form class="portal-message-form"><textarea placeholder="Write a message..." required></textarea><button type="submit" class="btn btn-secondary">Send</button></form>' +
      '<h3>Payments</h3><ul class="portal-payments">' + paymentsHtml + "</ul>" +
      "</div>";

    wireDetailInteractions(detailEl, applicationId);
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

  function loadProfile() {
    window
      .portalFetch("/api/profile")
      .then((r) => r.json())
      .then(function (data) {
        document.getElementById("profile-fullName").value = data.fullName || "";
        document.getElementById("profile-email").value = data.email || "";
        document.getElementById("profile-phone").value = data.phone || "";
        document.getElementById("profile-nationality").value = data.nationality || "";
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
          }),
        })
        .then(function (resp) {
          status.textContent = resp.ok ? "Saved." : "Something went wrong. Please try again.";
        });
    });
  }
})();
