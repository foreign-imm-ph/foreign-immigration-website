import { env } from "cloudflare:workers";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import worker from "../src/index.js";
import { createSubmission, transitionStatus } from "../src/lib/biForms.js";
import { createTestClient, createSessionCookieFor, createTestApplication, createTestStaff, authedRequest, SITE_ORIGIN } from "./helpers.js";
import { generateTestAccessKeypair, signTestAccessJwt, mockAccessJwksEndpoint } from "./access-jwt-helper.js";

// Directive section 9: "exception-based operations -- where all required
// info is present/verified, prepare the document automatically for
// review/approval; where missing, flag only the relevant exceptions."
// Proves the Staff Portal BI Forms list (staffBiForms.js listBiForms)
// actually surfaces this distinction -- a submission with nothing
// outstanding is badged "Ready to finalize", one with an outstanding
// "I'm not sure" field is badged as an exception, and the "Needs
// attention" quick filter shows only the latter.
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

describe("Staff: BI Forms list is exception-based", () => {
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

  it("badges a fully-answered submission 'Ready to finalize' and one with an unresolved 'I'm not sure' field as an exception, and the quick filter shows only the exception", async () => {
    const staff = await createTestStaff({ role: "admin" });

    const readyClient = await createTestClient();
    const readyCookie = await createSessionCookieFor(readyClient);
    const readyApp = await createTestApplication(readyClient);
    const readySubmission = await assignForm(readyClient, readyApp, staff);
    await worker.fetch(authedRequest(`/api/bi-forms/${readySubmission.id}/draft`, { method: "PATCH", cookie: readyCookie, body: { answers: completeAnswers() } }), env);
    await worker.fetch(authedRequest(`/api/bi-forms/${readySubmission.id}/submit`, { method: "POST", cookie: readyCookie }), env);
    await transitionStatus(env.DB, await env.DB.prepare("SELECT * FROM bi_form_submissions WHERE id = ?").bind(readySubmission.id).first(), "under_review", { staffEmail: staff.email });
    // CCS-A-CDR-2016 has 4 required STAFF-owned fields (landline, mobile,
    // documentsToBeCertified, purposeLine1 -- purposeLine2 is the one
    // explicitly marked optional in questionnaire.json's
    // staffFieldRequirements) in addition to every customer field -- a
    // submission is only genuinely "ready to finalize" once those are
    // ALSO supplied, exactly like approveBiForm itself requires.
    await staffRequest(`/staff/bi-forms/${readySubmission.id}/staff-fields`, staff, {
      method: "POST",
      body: { landline: "N/A", mobile: "+63 900 000 0000", documentsToBeCertified: "Certificate of Derivative Residency", purposeLine1: "For visa renewal purposes." },
    });

    const exceptionClient = await createTestClient();
    const exceptionCookie = await createSessionCookieFor(exceptionClient);
    const exceptionApp = await createTestApplication(exceptionClient);
    const exceptionSubmission = await assignForm(exceptionClient, exceptionApp, staff);
    const incompleteAnswers = completeAnswers();
    delete incompleteAnswers.citizenship;
    incompleteAnswers.__unsureFields = ["citizenship"];
    await worker.fetch(authedRequest(`/api/bi-forms/${exceptionSubmission.id}/draft`, { method: "PATCH", cookie: exceptionCookie, body: { answers: incompleteAnswers } }), env);
    await worker.fetch(authedRequest(`/api/bi-forms/${exceptionSubmission.id}/submit`, { method: "POST", cookie: exceptionCookie }), env);
    await transitionStatus(env.DB, await env.DB.prepare("SELECT * FROM bi_form_submissions WHERE id = ?").bind(exceptionSubmission.id).first(), "under_review", { staffEmail: staff.email });

    const listResp = await staffRequest("/staff/bi-forms/?status=under_review", staff);
    expect(listResp.status).toBe(200);
    const html = await listResp.text();
    const readyRowIndex = html.indexOf(readySubmission.id);
    const exceptionRowIndex = html.indexOf(exceptionSubmission.id);
    expect(readyRowIndex).toBeGreaterThan(-1);
    expect(exceptionRowIndex).toBeGreaterThan(-1);
    // Each row's own badge: "Ready to finalize" immediately follows the
    // ready submission's row, "N exception(s)" immediately follows the
    // other's -- checked against a window around each row rather than a
    // single global string match, since both badges appear somewhere in
    // the page.
    const readyRowHtml = html.slice(readyRowIndex, readyRowIndex + 400);
    const exceptionRowHtml = html.slice(exceptionRowIndex, exceptionRowIndex + 400);
    expect(readyRowHtml).toContain("Ready to finalize");
    expect(exceptionRowHtml).toContain("exception");
    expect(exceptionRowHtml).not.toContain("Ready to finalize");

    const filteredResp = await staffRequest("/staff/bi-forms/?status=under_review&onlyExceptions=1", staff);
    const filteredHtml = await filteredResp.text();
    expect(filteredHtml).toContain(exceptionSubmission.id);
    expect(filteredHtml).not.toContain(readySubmission.id);
  });
});
