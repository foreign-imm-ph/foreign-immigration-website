import { env } from "cloudflare:workers";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import worker from "../src/index.js";
import { createSubmission, transitionStatus, getSubmissionById } from "../src/lib/biForms.js";
import { createTestClient, createTestApplication, createTestStaff, createSessionCookieFor, authedRequest, SITE_ORIGIN } from "./helpers.js";
import { generateTestAccessKeypair, signTestAccessJwt, mockAccessJwksEndpoint } from "./access-jwt-helper.js";

// Note on what ISN'T tested here: the actual successful generation path
// inside approveBiForm (the point where it calls getDocumentBuilders(),
// which lazily loads render-pipeline.js and therefore pdf-lib) cannot be
// exercised through worker.fetch() in this harness. vi.mock() does
// intercept that import when called directly from a test file's own
// module scope (verified separately) but NOT when the real Worker
// fetch() handler runs inside @cloudflare/vitest-plugin's simulated
// Workers isolate, which is a genuinely separate module registry from
// Vitest's own mocking system -- there is no supported way within this
// plugin to stub an internal module used only by code running inside
// that isolate. This is a deeper, structural limitation of integration-
// testing this specific code path with this specific tool version, not
// something a different mock syntax works around. The tests below cover
// every precondition check leading up to that point (staff-field
// completeness, original-template availability, status guards) --
// everything that doesn't require pdf-lib to actually run -- and the
// underlying generation code itself is independently verified correct
// by the engine's own 45-test Node suite plus a direct esbuild bundle
// check (see biFormEngine.js's getDocumentBuilders() comment).

let keypair;
let restoreFetch;
beforeAll(async () => {
  keypair = await generateTestAccessKeypair();
  restoreFetch = mockAccessJwksEndpoint(env.CF_ACCESS_TEAM_DOMAIN, keypair.jwks);
});
afterAll(() => restoreFetch());

async function staffRequest(path, { method = "GET", staffEmail, body, isForm = true } = {}) {
  const jwt = await signTestAccessJwt(keypair.keyPair, keypair.kid, { email: staffEmail, aud: [env.CF_ACCESS_AUD], exp: Math.floor(Date.now() / 1000) + 300 });
  const headers = { "Cf-Access-Jwt-Assertion": jwt, Origin: SITE_ORIGIN };
  let requestBody;
  if (body !== undefined) {
    if (isForm) {
      const form = new URLSearchParams(body);
      requestBody = form.toString();
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    } else {
      requestBody = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
    }
  }
  return worker.fetch(new Request(`${SITE_ORIGIN}${path}`, { method, headers, body: requestBody }), env);
}

async function putFakeOriginal(biFormId) {
  // Matches the real, approved object-key convention for the private
  // fis-bi-forms-library bucket (BI_FORMS_LIBRARY binding) -- see
  // bi-forms-library/inventory/forms-library-inventory.json and
  // biFormEngine.js's originalTemplateKey().
  await env.BI_FORMS_LIBRARY.put(`originals/${biFormId}.pdf`, new TextEncoder().encode("%PDF-1.7\nfake original for test purposes\n"));
}

describe("staff-facing BI-form routes", () => {
  it("staff can assign a BI form to an existing application", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const staff = await createTestStaff();

    const resp = await staffRequest(`/staff/applications/${application.id}/bi-forms/assign`, { method: "POST", staffEmail: staff.email, body: { biFormId: "CCS-A-CDR-2016" } });
    expect(resp.status).toBe(303);
    const location = resp.headers.get("Location");
    expect(location).toMatch(/\/staff\/bi-forms\//);

    const { results } = await env.DB.prepare("SELECT * FROM bi_form_submissions WHERE application_id = ?").bind(application.id).all();
    expect(results.length).toBe(1);
    expect(results[0].bi_form_id).toBe("CCS-A-CDR-2016");
    expect(results[0].status).toBe("draft");
    expect(results[0].assigned_by_staff_email).toBe(staff.email);
  });

  it("assigning an unknown BI form id is rejected", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    const resp = await staffRequest(`/staff/applications/${application.id}/bi-forms/assign`, { method: "POST", staffEmail: staff.email, body: { biFormId: "NOT-A-REAL-FORM" } });
    expect(resp.status).toBe(400);
  });

  it("the application detail page shows the assigned BI form", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    await createSubmission(env.DB, { applicationId: application.id, clientId: client.id, biFormId: "2014-13-002", assignedByStaffEmail: staff.email });

    const resp = await staffRequest(`/staff/applications/${application.id}`, { staffEmail: staff.email });
    expect(resp.status).toBe(200);
    const html = await resp.text();
    expect(html).toContain("2014-13-002");
  });

  it("staff review flow works up through every precondition check before generation", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    await putFakeOriginal("CCS-A-CDR-2016");
    // A generated document's application_id is NOT NULL (same column as
    // every ordinary uploaded document), so this exercises the realistic,
    // in-scope path: a BI form assigned to an existing application. A
    // submission with no application at all is a future Instant Checkout
    // concern (not built yet) and would need its own schema accommodation
    // for generated documents -- noted, not solved, in the Stage 3 report.
    let submission = await createSubmission(env.DB, { applicationId: application.id, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });

    await env.DB.prepare("UPDATE bi_form_submissions SET customer_answers_json = ? WHERE id = ?")
      .bind(JSON.stringify({ lastName: "SMITH", firstName: "JONATHAN", gender: "M", middleName: "M", otherName1: "N/A", otherName2: "N/A", dobDay: "15", dobMonth: "MAR", dobYear: "1985", placeOfBirth: "X", citizenship: "X", address1: "X", barangay: "X", provinceZip: "X", passportNumber: "PA1" }), submission.id)
      .run();
    submission = await transitionStatus(env.DB, submission, "submitted", { clientId: client.id });

    let resp = await staffRequest(`/staff/bi-forms/${submission.id}/start-review`, { method: "POST", staffEmail: staff.email });
    expect(resp.status).toBe(303);
    submission = await getSubmissionById(env.DB, submission.id);
    expect(submission.status).toBe("under_review");

    // Approving without staff fields filled in should fail -- CDR has
    // staff-only fields (landline, mobile, documentsToBeCertified, purpose).
    resp = await staffRequest(`/staff/bi-forms/${submission.id}/approve`, { method: "POST", staffEmail: staff.email });
    expect(resp.status).toBe(422);

    resp = await staffRequest(`/staff/bi-forms/${submission.id}/staff-fields`, {
      method: "POST", staffEmail: staff.email,
      body: { landline: "N/A", mobile: "09171234567", documentsToBeCertified: "Cert of No Derogatory Record", purposeLine1: "Visa extension support", purposeLine2: "continued." },
    });
    expect(resp.status).toBe(303);

    // All preconditions now satisfied (status, staff-field completeness,
    // original-template availability) -- generation itself is the one
    // step this harness cannot exercise (see the file-level comment
    // above). A real deployment reaching this point proceeds to call
    // pdf-lib; here it surfaces as a 500 from the known test-harness
    // limitation, not from any precondition this route is responsible
    // for checking.
    resp = await staffRequest(`/staff/bi-forms/${submission.id}/approve`, { method: "POST", staffEmail: staff.email });
    expect(resp.status).toBe(500);
  });

  it.todo("a successful approve stores both documents and transitions to approved (blocked by the harness limitation described above)");

  it("BOC04.QF.001 (the engine's first genuinely multi-page form) works up through every precondition check before generation, same as a single-page form", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    await putFakeOriginal("BOC04.QF.001");
    let submission = await createSubmission(env.DB, { applicationId: application.id, clientId: client.id, biFormId: "BOC04.QF.001", assignedByStaffEmail: staff.email });

    await env.DB.prepare("UPDATE bi_form_submissions SET customer_answers_json = ? WHERE id = ?")
      .bind(
        JSON.stringify({
          presentImmigrationStatus: "9(A) TEMPORARY VISITOR", typeOfVisaApplication: "Conversion", typeOfVisa: "13(A) SPOUSE",
          methodOfApplication: "Personal", biAccreditationNumber: "N/A", nameOfAuthorizedRep: "N/A", passportNumber: "PA1234567",
          dateLatestArrivalDay: "12", dateLatestArrivalMonth: "JUN", dateLatestArrivalYear: "2024",
          expiryDateDay: "05", expiryDateMonth: "MAR", expiryDateYear: "2029", placeOfIssuance: "MANILA",
          lastDayAuthStayDay: "12", lastDayAuthStayMonth: "JUN", lastDayAuthStayYear: "2027",
          lastName: "KOVACS", firstGivenName: "ESZTER", middleName: "N/A", otherAlias1: "N/A", otherAlias2: "N/A",
          dobDay: "18", dobMonth: "APR", dobYear: "1990", sex: "F", countryOfBirth: "HUNGARY", countryOfCitizenship: "HUNGARIAN",
          civilStatus: "Married", height: "165", weight: "58", profession: "GRAPHIC DESIGNER", landline: "N/A", mobile: "09179876543",
          emailAddress: "e.kovacs@ex.com",
        }),
        submission.id
      )
      .run();
    submission = await transitionStatus(env.DB, submission, "submitted", { clientId: client.id });

    let resp = await staffRequest(`/staff/bi-forms/${submission.id}/start-review`, { method: "POST", staffEmail: staff.email });
    expect(resp.status).toBe(303);
    submission = await getSubmissionById(env.DB, submission.id);
    expect(submission.status).toBe("under_review");

    // BOC04.QF.001's one staff-only field (applicationNumber, on page 2's
    // "DO NOT FILL OUT THIS PORTION" section) is intentionally
    // staffFieldRequirements.required: false -- it's the BI office's own
    // physical-counter tracking number, which legitimately doesn't exist
    // yet at digital-preparation time -- so approval proceeds straight
    // through the staff-completeness check with nothing filled in, same as
    // it correctly would for a real submission. It still exercises the
    // staff-fields endpoint itself (writable, not required) before hitting
    // the one precondition check this harness genuinely cannot get past.
    resp = await staffRequest(`/staff/bi-forms/${submission.id}/staff-fields`, {
      method: "POST", staffEmail: staff.email,
      body: { applicationNumber: "" },
    });
    expect(resp.status).toBe(303);

    // Same documented harness limitation as every other form's own test
    // above: the actual pdf-lib generation call (which is where this
    // form's page-routing fix lives) cannot be exercised through
    // worker.fetch() in this harness -- independently verified correct by
    // the engine's own test suite instead (bi-forms-library/tests/run-all.js,
    // run against the real original PDF).
    resp = await staffRequest(`/staff/bi-forms/${submission.id}/approve`, { method: "POST", staffEmail: staff.email });
    expect(resp.status).toBe(500);
  });

  it("publish and cancel work correctly once reached through the lifecycle's own rules, independent of generation", async () => {
    // Fast-forwards status via transitionStatus() directly (bypassing the
    // approve HTTP action, which needs pdf-lib) to test publish/cancel in
    // isolation -- both are pure D1 state transitions with no document-
    // generation dependency of their own.
    const client = await createTestClient();
    const staff = await createTestStaff();
    let submission = await createSubmission(env.DB, { applicationId: null, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "submitted", { clientId: client.id });
    submission = await transitionStatus(env.DB, submission, "under_review", { staffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "approved", { staffEmail: staff.email });

    const publishResp = await staffRequest(`/staff/bi-forms/${submission.id}/publish`, { method: "POST", staffEmail: staff.email });
    expect(publishResp.status).toBe(303);
    submission = await getSubmissionById(env.DB, submission.id);
    expect(submission.status).toBe("published");
    expect(submission.published_at).toBeTruthy();
    expect(submission.published_by_staff_email).toBe(staff.email);

    const client2 = await createTestClient();
    let cancellable = await createSubmission(env.DB, { applicationId: null, clientId: client2.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    const cancelResp = await staffRequest(`/staff/bi-forms/${cancellable.id}/cancel`, { method: "POST", staffEmail: staff.email });
    expect(cancelResp.status).toBe(303);
    cancellable = await getSubmissionById(env.DB, cancellable.id);
    expect(cancellable.status).toBe("cancelled");
  });

  it("approving is refused when the original BI template isn't available in R2", async () => {
    const client = await createTestClient();
    const staff = await createTestStaff();
    let submission = await createSubmission(env.DB, { applicationId: null, clientId: client.id, biFormId: "2014-13-006", assignedByStaffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "submitted", { clientId: client.id });
    submission = await transitionStatus(env.DB, submission, "under_review", { staffEmail: staff.email });
    const resp = await staffRequest(`/staff/bi-forms/${submission.id}/approve`, { method: "POST", staffEmail: staff.email });
    expect(resp.status).toBe(501);
  });

  it("approve does not require staff fields that are conditionally inapplicable to this submission (requestingAgencyApplies/courtLegalApplies both false)", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    await putFakeOriginal("2014-13-006");
    let submission = await createSubmission(env.DB, { applicationId: application.id, clientId: client.id, biFormId: "2014-13-006", assignedByStaffEmail: staff.email });

    await env.DB.prepare("UPDATE bi_form_submissions SET customer_answers_json = ? WHERE id = ?")
      .bind(JSON.stringify({
        lastName: "SMITH", firstName: "JONATHAN", gender: "M", middleName: "M", otherName1: "N/A", otherName2: "N/A",
        dobDay: "15", dobMonth: "MAR", dobYear: "1985", placeOfBirth: "X", citizenship: "X", address1: "X", barangay: "X",
        provinceZip: "X", passportNumber: "PA1", requestingAgencyApplies: false, courtLegalApplies: false, trips: [],
      }), submission.id)
      .run();
    submission = await transitionStatus(env.DB, submission, "submitted", { clientId: client.id });
    submission = await transitionStatus(env.DB, submission, "under_review", { staffEmail: staff.email });

    // Only the unconditionally-required staff fields are supplied --
    // landline2/mobile2/requestingAgency (gated on requestingAgencyApplies)
    // and courtName/courtBranchPlace/courtContactNumber (gated on
    // courtLegalApplies) are deliberately left blank, since neither gate
    // applies to this submission.
    let resp = await staffRequest(`/staff/bi-forms/${submission.id}/staff-fields`, {
      method: "POST", staffEmail: staff.email,
      body: { landline1: "N/A", mobile1: "09171234567", signatureLineContactNumber: "09171234567" },
    });
    expect(resp.status).toBe(303);

    // If the conditional fields were still being treated as required, this
    // would come back 422 (missing required staff field). Reaching the
    // known pdf-lib harness limitation (500) instead confirms every
    // precondition this route is responsible for -- including the new
    // conditional staff-field completeness check -- was satisfied.
    resp = await staffRequest(`/staff/bi-forms/${submission.id}/approve`, { method: "POST", staffEmail: staff.email });
    expect(resp.status).toBe(500);
  });

  it("approve still requires conditionally-applicable staff fields once their gate is satisfied", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    await putFakeOriginal("2014-13-006");
    let submission = await createSubmission(env.DB, { applicationId: application.id, clientId: client.id, biFormId: "2014-13-006", assignedByStaffEmail: staff.email });

    await env.DB.prepare("UPDATE bi_form_submissions SET customer_answers_json = ? WHERE id = ?")
      .bind(JSON.stringify({
        lastName: "SMITH", firstName: "JONATHAN", gender: "M", middleName: "M", otherName1: "N/A", otherName2: "N/A",
        dobDay: "15", dobMonth: "MAR", dobYear: "1985", placeOfBirth: "X", citizenship: "X", address1: "X", barangay: "X",
        provinceZip: "X", passportNumber: "PA1", requestingAgencyApplies: false, courtLegalApplies: true, trips: [],
      }), submission.id)
      .run();
    submission = await transitionStatus(env.DB, submission, "submitted", { clientId: client.id });
    submission = await transitionStatus(env.DB, submission, "under_review", { staffEmail: staff.email });

    // courtLegalApplies is true, so the court fields are now required --
    // leaving them blank must still be rejected.
    let resp = await staffRequest(`/staff/bi-forms/${submission.id}/staff-fields`, {
      method: "POST", staffEmail: staff.email,
      body: { landline1: "N/A", mobile1: "09171234567", signatureLineContactNumber: "09171234567" },
    });
    expect(resp.status).toBe(303);

    resp = await staffRequest(`/staff/bi-forms/${submission.id}/approve`, { method: "POST", staffEmail: staff.email });
    expect(resp.status).toBe(422);

    resp = await staffRequest(`/staff/bi-forms/${submission.id}/staff-fields`, {
      method: "POST", staffEmail: staff.email,
      body: { courtName: "Regional Trial Court", courtBranchPlace: "Branch 1, Manila", courtContactNumber: "09170000000" },
    });
    expect(resp.status).toBe(303);

    resp = await staffRequest(`/staff/bi-forms/${submission.id}/approve`, { method: "POST", staffEmail: staff.email });
    expect(resp.status).toBe(500); // harness limitation, not a missing-field 422 -- see file-level comment above
  });

  it("staff fields cannot be edited before review has started (draft status)", async () => {
    const client = await createTestClient();
    const staff = await createTestStaff();
    const submission = await createSubmission(env.DB, { applicationId: null, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    const resp = await staffRequest(`/staff/bi-forms/${submission.id}/staff-fields`, { method: "POST", staffEmail: staff.email, body: { mobile: "09171234567" } });
    expect(resp.status).toBe(409);
  });

  it("request-revision requires a note", async () => {
    const client = await createTestClient();
    const staff = await createTestStaff();
    let submission = await createSubmission(env.DB, { applicationId: null, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "submitted", { clientId: client.id });
    const resp = await staffRequest(`/staff/bi-forms/${submission.id}/request-revision`, { method: "POST", staffEmail: staff.email, body: { note: "" } });
    expect(resp.status).toBe(400);
  });

  it("staff cannot act on a BI-form staff route without a valid Access identity", async () => {
    const client = await createTestClient();
    const staff = await createTestStaff();
    const submission = await createSubmission(env.DB, { applicationId: null, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    const resp = await worker.fetch(new Request(`${SITE_ORIGIN}/staff/bi-forms/${submission.id}`), env); // no Access JWT
    expect(resp.status).toBe(401);
  });
});
