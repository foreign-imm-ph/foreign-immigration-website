import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { createSubmission, transitionStatus } from "../src/lib/biForms.js";
import { createTestClient, createSessionCookieFor, createTestApplication, createTestStaff, authedRequest } from "./helpers.js";

async function assignForm(client, application, staff, overrides = {}) {
  return createSubmission(env.DB, {
    applicationId: application ? application.id : null,
    clientId: client.id,
    biFormId: overrides.biFormId || "CCS-A-CDR-2016",
    assignedByStaffEmail: staff.email,
  });
}

describe("customer-facing BI-form routes", () => {
  it("a client sees a form staff assigned to them in their list", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    const submission = await assignForm(client, application, staff);

    const resp = await worker.fetch(authedRequest("/api/bi-forms", { cookie }), env);
    expect(resp.status).toBe(200);
    const { submissions } = await resp.json();
    expect(submissions.map((s) => s.id)).toContain(submission.id);
    expect(submissions.find((s) => s.id === submission.id).status).toBe("draft");
  });

  it("client B never sees client A's assigned forms", async () => {
    const clientA = await createTestClient();
    const staff = await createTestStaff();
    await assignForm(clientA, null, staff);
    const clientB = await createTestClient();
    const cookieB = await createSessionCookieFor(clientB);

    const resp = await worker.fetch(authedRequest("/api/bi-forms", { cookie: cookieB }), env);
    const { submissions } = await resp.json();
    expect(submissions.length).toBe(0);
  });

  it("GET returns the questionnaire (not the coordinate map) alongside the submission", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    const submission = await assignForm(client, null, staff);

    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}`, { cookie }), env);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.submission.id).toBe(submission.id);
    expect(Array.isArray(body.questionnaire.questions)).toBe(true);
    expect(body.questionnaire.coordinateMap).toBeUndefined();
    expect(body.coordinateMap).toBeUndefined();
  });

  it("client B cannot read client A's submission by ID", async () => {
    const clientA = await createTestClient();
    const staff = await createTestStaff();
    const submission = await assignForm(clientA, null, staff);
    const clientB = await createTestClient();
    const cookieB = await createSessionCookieFor(clientB);

    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}`, { cookie: cookieB }), env);
    expect(resp.status).toBe(404);
  });

  it("saving a draft stores answers and is readable back", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    const submission = await assignForm(client, null, staff);

    const resp = await worker.fetch(
      authedRequest(`/api/bi-forms/${submission.id}/draft`, { method: "PATCH", cookie, body: { answers: { lastName: "SMITH" }, preferredLanguage: "ja" } }),
      env
    );
    expect(resp.status).toBe(200);

    const getResp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}`, { cookie }), env);
    const body = await getResp.json();
    expect(body.submission.answers.lastName).toBe("SMITH");
    expect(body.submission.preferredLanguage).toBe("ja");
  });

  it("a draft cannot be edited once it has moved past draft/revision_requested", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    let submission = await assignForm(client, null, staff);
    submission = await transitionStatus(env.DB, submission, "submitted", { clientId: client.id });
    submission = await transitionStatus(env.DB, submission, "under_review", { staffEmail: staff.email });

    const resp = await worker.fetch(
      authedRequest(`/api/bi-forms/${submission.id}/draft`, { method: "PATCH", cookie, body: { answers: { lastName: "HACKED" } } }),
      env
    );
    expect(resp.status).toBe(409);
  });

  it("client B cannot save a draft onto client A's submission by guessing its ID", async () => {
    const clientA = await createTestClient();
    const staff = await createTestStaff();
    const submission = await assignForm(clientA, null, staff);
    const clientB = await createTestClient();
    const cookieB = await createSessionCookieFor(clientB);

    const resp = await worker.fetch(
      authedRequest(`/api/bi-forms/${submission.id}/draft`, { method: "PATCH", cookie: cookieB, body: { answers: { lastName: "HIJACKED" } } }),
      env
    );
    expect(resp.status).toBe(404);

    const dbRow = await env.DB.prepare("SELECT customer_answers_json FROM bi_form_submissions WHERE id = ?").bind(submission.id).first();
    expect(dbRow.customer_answers_json).toBeNull();
  });

  it("submitting an incomplete questionnaire is rejected with the specific missing fields", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    const submission = await assignForm(client, null, staff);
    await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/draft`, { method: "PATCH", cookie, body: { answers: { lastName: "SMITH" } } }), env);

    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/submit`, { method: "POST", cookie }), env);
    expect(resp.status).toBe(422);
    const body = await resp.json();
    expect(body.error).toMatch(/firstName/);
  });

  it("submitting a complete questionnaire transitions to submitted", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    const submission = await assignForm(client, null, staff);
    const completeAnswers = {
      lastName: "SMITH", firstName: "JONATHAN", middleName: "M", otherName1: "N/A", otherName2: "N/A",
      dobDay: "15", dobMonth: "MAR", dobYear: "1985", gender: "M", placeOfBirth: "SYDNEY", citizenship: "AUSTRALIAN",
      address1: "UNIT 1", barangay: "BRGY X", provinceZip: "METRO MANILA 1000", passportNumber: "PA123456",
    };
    await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/draft`, { method: "PATCH", cookie, body: { answers: completeAnswers } }), env);

    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/submit`, { method: "POST", cookie }), env);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.status).toBe("submitted");
  });

  it("a submission cannot be submitted twice", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    let submission = await assignForm(client, null, staff);
    submission = await transitionStatus(env.DB, submission, "submitted", { clientId: client.id });

    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/submit`, { method: "POST", cookie }), env);
    expect(resp.status).toBe(409);
  });

  it("unauthenticated requests to every BI-form customer endpoint are rejected", async () => {
    const client = await createTestClient();
    const staff = await createTestStaff();
    const submission = await assignForm(client, null, staff);
    const cases = [
      ["/api/bi-forms", "GET"],
      [`/api/bi-forms/${submission.id}`, "GET"],
      [`/api/bi-forms/${submission.id}/draft`, "PATCH"],
      [`/api/bi-forms/${submission.id}/submit`, "POST"],
    ];
    for (const [path, method] of cases) {
      const resp = await worker.fetch(authedRequest(path, { method }), env); // no cookie
      expect(resp.status, `${method} ${path}`).toBe(401);
    }
  });

  it("documents are never listed for an unpublished submission", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    const submission = await assignForm(client, null, staff);
    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/documents`, { cookie }), env);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.documents).toEqual([]);
  });
});
