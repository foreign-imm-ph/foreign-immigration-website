import { env } from "cloudflare:workers";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import worker from "../src/index.js";
import { createSubmission, transitionStatus } from "../src/lib/biForms.js";
import { createTestClient, createSessionCookieFor, createTestApplication, createTestStaff, authedRequest, SITE_ORIGIN } from "./helpers.js";
import { generateTestAccessKeypair, signTestAccessJwt, mockAccessJwksEndpoint } from "./access-jwt-helper.js";

// Directive section 7 ("I'm not sure -- let FIS help me") and section 9
// (staff completing/correcting customer answers). Reuses the existing
// CCS-A-CDR-2016 fixture shape from biForms-customer.test.js.
function completeAnswers() {
  return {
    lastName: "SMITH", firstName: "JONATHAN", middleName: "M", otherName1: "N/A", otherName2: "N/A",
    dobDay: "15", dobMonth: "MAR", dobYear: "1985", gender: "M", placeOfBirth: "SYDNEY", citizenship: "AUSTRALIAN",
    address1: "UNIT 1", barangay: "BRGY X", provinceZip: "METRO MANILA 1000", passportNumber: "PA123456",
  };
}

async function assignForm(client, application, staff) {
  return createSubmission(env.DB, { applicationId: application ? application.id : null, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
}

describe("Customer: 'I'm not sure' never blocks submission, and is never treated as an answer", () => {
  it("submits successfully with a required field left blank, as long as it's listed in __unsureFields", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    const submission = await assignForm(client, application, staff);

    const answers = completeAnswers();
    delete answers.citizenship; // the customer genuinely doesn't know this
    answers.__unsureFields = ["citizenship"];
    await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/draft`, { method: "PATCH", cookie, body: { answers } }), env);

    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/submit`, { method: "POST", cookie }), env);
    expect(resp.status).toBe(200);
    expect((await resp.json()).status).toBe("submitted");

    // The field is genuinely absent, never invented as "No"/"None"/a guess.
    const row = await env.DB.prepare("SELECT customer_answers_json FROM bi_form_submissions WHERE id = ?").bind(submission.id).first();
    const saved = JSON.parse(row.customer_answers_json);
    expect(saved.citizenship).toBeUndefined();
    expect(saved.__unsureFields).toContain("citizenship");
  });

  it("still refuses submission for a required field left blank that was NOT marked unsure -- the exemption is narrow, not a general bypass", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    const submission = await assignForm(client, application, staff);

    const answers = completeAnswers();
    delete answers.citizenship; // blank, but NOT listed as unsure this time
    await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/draft`, { method: "PATCH", cookie, body: { answers } }), env);

    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/submit`, { method: "POST", cookie }), env);
    expect(resp.status).toBe(422);
  });
});

describe("Staff: assisted-completion visibility and completion", () => {
  let keypair;
  let restoreFetch;
  beforeAll(async () => {
    keypair = await generateTestAccessKeypair();
    restoreFetch = mockAccessJwksEndpoint(env.CF_ACCESS_TEAM_DOMAIN, keypair.jwks);
  });
  afterAll(() => restoreFetch());

  async function staffRequest(path, staffRow, { method = "GET", body } = {}) {
    const jwt = await signTestAccessJwt(keypair.keyPair, keypair.kid, { email: staffRow.email, aud: [env.CF_ACCESS_AUD], exp: Math.floor(Date.now() / 1000) + 300 });
    const init = { method, headers: { "Cf-Access-Jwt-Assertion": jwt, Origin: SITE_ORIGIN } };
    if (body !== undefined) {
      init.body = new URLSearchParams(body).toString();
      init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    return worker.fetch(new Request(`${SITE_ORIGIN}${path}`, init), env);
  }

  it("shows an 'Assistance Requested' badge and flags the specific unresolved field", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const application = await createTestApplication(client);
    const staff = await createTestStaff({ role: "admin" });
    const submission = await assignForm(client, application, staff);

    const answers = completeAnswers();
    delete answers.citizenship;
    answers.__unsureFields = ["citizenship"];
    await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/draft`, { method: "PATCH", cookie, body: { answers } }), env);
    await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/submit`, { method: "POST", cookie }), env);
    await transitionStatus(env.DB, await env.DB.prepare("SELECT * FROM bi_form_submissions WHERE id = ?").bind(submission.id).first(), "under_review", { staffEmail: staff.email });

    const resp = await staffRequest(`/staff/bi-forms/${submission.id}`, staff);
    expect(resp.status).toBe(200);
    const html = await resp.text();
    expect(html).toContain("Assistance Requested (1 field)");
    expect(html).toMatch(/Citizenship\/Nationality:<\/strong>[^<]*<span class="priority-badge priority-badge--priority">assistance requested<\/span>/);
  });

  it("lets staff complete the flagged field, clears it from __unsureFields, and writes an audit record -- without touching anything the customer already answered", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const application = await createTestApplication(client);
    const staff = await createTestStaff({ role: "admin" });
    const submission = await assignForm(client, application, staff);

    const answers = completeAnswers();
    delete answers.citizenship;
    answers.__unsureFields = ["citizenship"];
    await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/draft`, { method: "PATCH", cookie, body: { answers } }), env);
    await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/submit`, { method: "POST", cookie }), env);
    await transitionStatus(env.DB, await env.DB.prepare("SELECT * FROM bi_form_submissions WHERE id = ?").bind(submission.id).first(), "under_review", { staffEmail: staff.email });

    const resp = await staffRequest(`/staff/bi-forms/${submission.id}/customer-fields`, staff, {
      method: "POST",
      body: { citizenship: "AUSTRALIAN (confirmed by staff via passport copy)", lastName: "SMITH" }, // lastName unchanged, on purpose
    });
    expect(resp.status).toBe(303);

    const row = await env.DB.prepare("SELECT customer_answers_json FROM bi_form_submissions WHERE id = ?").bind(submission.id).first();
    const saved = JSON.parse(row.customer_answers_json);
    expect(saved.citizenship).toBe("AUSTRALIAN (confirmed by staff via passport copy)");
    expect(saved.__unsureFields).not.toContain("citizenship");
    expect(saved.firstName).toBe("JONATHAN"); // every other customer answer untouched

    const audit = await env.DB.prepare("SELECT * FROM audit_log WHERE target_id = ? ORDER BY created_at DESC LIMIT 1").bind(submission.id).first();
    expect(audit).toBeTruthy();
    expect(audit.actor_id_or_email).toBe(staff.email);
    expect(JSON.parse(audit.metadata).fields).toContain("citizenship");
  });

  it("never lets a blank submission silently erase an already-answered field", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const application = await createTestApplication(client);
    const staff = await createTestStaff({ role: "admin" });
    const submission = await assignForm(client, application, staff);

    await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/draft`, { method: "PATCH", cookie, body: { answers: completeAnswers() } }), env);
    await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/submit`, { method: "POST", cookie }), env);
    await transitionStatus(env.DB, await env.DB.prepare("SELECT * FROM bi_form_submissions WHERE id = ?").bind(submission.id).first(), "under_review", { staffEmail: staff.email });

    await staffRequest(`/staff/bi-forms/${submission.id}/customer-fields`, staff, { method: "POST", body: { citizenship: "" } });

    const row = await env.DB.prepare("SELECT customer_answers_json FROM bi_form_submissions WHERE id = ?").bind(submission.id).first();
    expect(JSON.parse(row.customer_answers_json).citizenship).toBe("AUSTRALIAN"); // unchanged
  });
});
