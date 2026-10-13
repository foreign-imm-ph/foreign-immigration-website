import { env } from "cloudflare:workers";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import worker from "../src/index.js";
import { newId } from "../src/lib/crypto.js";
import { createSubmission, transitionStatus } from "../src/lib/biForms.js";
import { createTestClient, createTestApplication, createTestStaff, createSessionCookieFor, authedRequest, SITE_ORIGIN } from "./helpers.js";
import { generateTestAccessKeypair, signTestAccessJwt, mockAccessJwksEndpoint } from "./access-jwt-helper.js";

// These tests insert `documents` rows directly (simulating what a real
// approve/generate call would have written) so the access-control rule
// itself -- the point of Phase 2 decision 2.7 -- can be tested in full
// isolation from document generation, which this harness cannot execute
// end to end (see biForms-staff.test.js). The rule under test lives in
// routes/documents.js handleDownloadDocument, not in anything BI-form-
// specific, so it protects a staff PDF regardless of which route a
// request comes in through.

let keypair;
let restoreFetch;
beforeAll(async () => {
  keypair = await generateTestAccessKeypair();
  restoreFetch = mockAccessJwksEndpoint(env.CF_ACCESS_TEAM_DOMAIN, keypair.jwks);
});
afterAll(() => restoreFetch());

async function staffJwt(email) {
  return signTestAccessJwt(keypair.keyPair, keypair.kid, { email, aud: [env.CF_ACCESS_AUD], exp: Math.floor(Date.now() / 1000) + 300 });
}

async function insertGeneratedDocument(env, { applicationId, clientId, submissionId, kind }) {
  const id = newId();
  const key = `clients/${clientId}/bi-forms/${submissionId}/${id}.pdf`;
  await env.CLIENT_FILES.put(key, new TextEncoder().encode(`%PDF-1.7\nfake ${kind} for test purposes\n`));
  await env.DB.prepare(
    `INSERT INTO documents (id, application_id, client_id, bi_form_submission_id, r2_key, original_filename, content_type, size_bytes, uploaded_by, kind)
     VALUES (?, ?, ?, ?, ?, ?, 'application/pdf', 60, 'staff', ?)`
  )
    .bind(id, applicationId, clientId, submissionId, key, `${kind}.pdf`, kind)
    .run();
  return id;
}

describe("document access control: staff_pdf vs customer_preview (Phase 2 decision 2.7)", () => {
  it("a client can NEVER download a staff_pdf document, even for their own, owned application", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    const submission = await createSubmission(env.DB, { applicationId: application.id, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    const docId = await insertGeneratedDocument(env, { applicationId: application.id, clientId: client.id, submissionId: submission.id, kind: "staff_pdf" });

    const resp = await worker.fetch(authedRequest(`/api/applications/${application.id}/documents/${docId}`, { cookie }), env);
    expect(resp.status).toBe(404);
  });

  it("a client cannot download a customer_preview before its submission is published", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    const submission = await createSubmission(env.DB, { applicationId: application.id, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    const docId = await insertGeneratedDocument(env, { applicationId: application.id, clientId: client.id, submissionId: submission.id, kind: "customer_preview" });

    const resp = await worker.fetch(authedRequest(`/api/applications/${application.id}/documents/${docId}`, { cookie }), env);
    expect(resp.status).toBe(404);
  });

  it("a client CAN download a customer_preview once its submission is published", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    let submission = await createSubmission(env.DB, { applicationId: application.id, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "submitted", { clientId: client.id });
    submission = await transitionStatus(env.DB, submission, "under_review", { staffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "approved", { staffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "published", { staffEmail: staff.email });
    const docId = await insertGeneratedDocument(env, { applicationId: application.id, clientId: client.id, submissionId: submission.id, kind: "customer_preview" });

    const resp = await worker.fetch(authedRequest(`/api/applications/${application.id}/documents/${docId}`, { cookie }), env);
    expect(resp.status).toBe(200);
    const text = await resp.text();
    expect(text).toContain("fake customer_preview");
  });

  it("publishing is per-submission: a published submission's preview does not make a DIFFERENT, unpublished submission's preview downloadable", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const application = await createTestApplication(client);
    const staff = await createTestStaff();

    let publishedSubmission = await createSubmission(env.DB, { applicationId: application.id, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    publishedSubmission = await transitionStatus(env.DB, publishedSubmission, "submitted", { clientId: client.id });
    publishedSubmission = await transitionStatus(env.DB, publishedSubmission, "under_review", { staffEmail: staff.email });
    publishedSubmission = await transitionStatus(env.DB, publishedSubmission, "approved", { staffEmail: staff.email });
    publishedSubmission = await transitionStatus(env.DB, publishedSubmission, "published", { staffEmail: staff.email });

    const unpublishedSubmission = await createSubmission(env.DB, { applicationId: application.id, clientId: client.id, biFormId: "2014-13-002", assignedByStaffEmail: staff.email });
    const unpublishedDocId = await insertGeneratedDocument(env, { applicationId: application.id, clientId: client.id, submissionId: unpublishedSubmission.id, kind: "customer_preview" });

    const resp = await worker.fetch(authedRequest(`/api/applications/${application.id}/documents/${unpublishedDocId}`, { cookie }), env);
    expect(resp.status).toBe(404);
  });

  it("client B can never download client A's BI-form documents, staff_pdf or published customer_preview alike", async () => {
    const clientA = await createTestClient();
    const application = await createTestApplication(clientA);
    const staff = await createTestStaff();
    let submission = await createSubmission(env.DB, { applicationId: application.id, clientId: clientA.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "submitted", { clientId: clientA.id });
    submission = await transitionStatus(env.DB, submission, "under_review", { staffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "approved", { staffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "published", { staffEmail: staff.email });
    const staffDocId = await insertGeneratedDocument(env, { applicationId: application.id, clientId: clientA.id, submissionId: submission.id, kind: "staff_pdf" });
    const previewDocId = await insertGeneratedDocument(env, { applicationId: application.id, clientId: clientA.id, submissionId: submission.id, kind: "customer_preview" });

    const clientB = await createTestClient();
    const cookieB = await createSessionCookieFor(clientB);
    for (const docId of [staffDocId, previewDocId]) {
      const resp = await worker.fetch(authedRequest(`/api/applications/${application.id}/documents/${docId}`, { cookie: cookieB }), env);
      expect(resp.status).toBe(404);
    }
  });

  it("staff CAN download both a staff_pdf and an unpublished customer_preview through the staff route", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    const submission = await createSubmission(env.DB, { applicationId: application.id, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    const staffDocId = await insertGeneratedDocument(env, { applicationId: application.id, clientId: client.id, submissionId: submission.id, kind: "staff_pdf" });
    const previewDocId = await insertGeneratedDocument(env, { applicationId: application.id, clientId: client.id, submissionId: submission.id, kind: "customer_preview" });

    const jwt = await staffJwt(staff.email);
    for (const docId of [staffDocId, previewDocId]) {
      const resp = await worker.fetch(
        new Request(`${SITE_ORIGIN}/staff/bi-forms/${submission.id}/documents/${docId}/download`, { headers: { "Cf-Access-Jwt-Assertion": jwt } }),
        env
      );
      expect(resp.status).toBe(200);
    }
  });

  it("staff cannot download a BI-form document through a mismatched submission ID in the URL", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    const submissionOne = await createSubmission(env.DB, { applicationId: application.id, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    const submissionTwo = await createSubmission(env.DB, { applicationId: application.id, clientId: client.id, biFormId: "2014-13-002", assignedByStaffEmail: staff.email });
    const docId = await insertGeneratedDocument(env, { applicationId: application.id, clientId: client.id, submissionId: submissionOne.id, kind: "staff_pdf" });

    const jwt = await staffJwt(staff.email);
    const resp = await worker.fetch(
      new Request(`${SITE_ORIGIN}/staff/bi-forms/${submissionTwo.id}/documents/${docId}/download`, { headers: { "Cf-Access-Jwt-Assertion": jwt } }),
      env
    );
    expect(resp.status).toBe(404);
  });

  it("the BI-forms customer document-listing endpoint never lists an unpublished or staff_pdf document", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    const submission = await createSubmission(env.DB, { applicationId: application.id, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    await insertGeneratedDocument(env, { applicationId: application.id, clientId: client.id, submissionId: submission.id, kind: "staff_pdf" });
    await insertGeneratedDocument(env, { applicationId: application.id, clientId: client.id, submissionId: submission.id, kind: "customer_preview" });

    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/documents`, { cookie }), env);
    const body = await resp.json();
    expect(body.documents).toEqual([]);
  });
});
