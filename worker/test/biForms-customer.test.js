import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { createSubmission, transitionStatus } from "../src/lib/biForms.js";
import { createTestClient, createSessionCookieFor, createTestApplication, createTestStaff, authedRequest, SITE_ORIGIN } from "./helpers.js";

function fakePdfBytes() {
  return new TextEncoder().encode("%PDF-1.7\n% fake but correctly-signed test content\n");
}

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

  it("the questionnaire returned over the API carries a label in all six FIS languages for every question", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    const submission = await assignForm(client, null, staff);

    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}`, { cookie }), env);
    const body = await resp.json();
    expect(body.questionnaire.languages.sort()).toEqual(["en", "ja", "ko", "vi", "zh-CN", "zh-Hant"].sort());
    for (const q of body.questionnaire.questions) {
      for (const lang of body.questionnaire.languages) {
        expect(q.labels[lang], `${q.id}.${lang}`).toBeTruthy();
      }
    }
  });

  it("BOC04.QF.001 (the engine's first genuinely multi-page form) is served through the exact same generic customer route with full six-language labels", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    const submission = await assignForm(client, null, staff, { biFormId: "BOC04.QF.001" });

    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}`, { cookie }), env);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.submission.biFormId).toBe("BOC04.QF.001");
    expect(body.questionnaire.questions.length).toBeGreaterThan(0);
    expect(body.questionnaire.languages.sort()).toEqual(["en", "ja", "ko", "vi", "zh-CN", "zh-Hant"].sort());
    for (const q of body.questionnaire.questions) {
      for (const lang of body.questionnaire.languages) {
        expect(q.labels[lang], `${q.id}.${lang}`).toBeTruthy();
      }
    }
  });

  it("CGAF-003-Rev 2 (a formId containing a literal space) is served through the exact same generic customer route with full six-language labels", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    const submission = await assignForm(client, null, staff, { biFormId: "CGAF-003-Rev 2" });

    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}`, { cookie }), env);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.submission.biFormId).toBe("CGAF-003-Rev 2");
    expect(body.questionnaire.questions.length).toBeGreaterThan(0);
    expect(body.questionnaire.languages.sort()).toEqual(["en", "ja", "ko", "vi", "zh-CN", "zh-Hant"].sort());
    for (const q of body.questionnaire.questions) {
      for (const lang of body.questionnaire.languages) {
        expect(q.labels[lang], `${q.id}.${lang}`).toBeTruthy();
      }
    }
  });

  it("CGAF-002-Rev3 (kept distinct from BOC04.QF.002, never substituted) is served through the same generic customer route with full six-language labels", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    const submission = await assignForm(client, null, staff, { biFormId: "CGAF-002-Rev3" });

    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}`, { cookie }), env);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.submission.biFormId).toBe("CGAF-002-Rev3");
    expect(body.questionnaire.questions.length).toBeGreaterThan(0);
    expect(body.questionnaire.languages.sort()).toEqual(["en", "ja", "ko", "vi", "zh-CN", "zh-Hant"].sort());
    for (const q of body.questionnaire.questions) {
      for (const lang of body.questionnaire.languages) {
        expect(q.labels[lang], `${q.id}.${lang}`).toBeTruthy();
      }
    }
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

  it("a client can upload a supporting document to their own BI-form submission and download it back", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    const submission = await assignForm(client, application, staff);

    const uploadReq = new Request(`${SITE_ORIGIN}/api/bi-forms/${submission.id}/documents`, {
      method: "POST",
      headers: { Origin: SITE_ORIGIN, Cookie: cookie, "X-Filename": "passport.pdf" },
      body: fakePdfBytes(),
    });
    const uploadResp = await worker.fetch(uploadReq, env);
    expect(uploadResp.status).toBe(201);
    const { id: documentId } = await uploadResp.json();

    const listResp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/documents`, { cookie }), env);
    const listBody = await listResp.json();
    expect(listBody.uploads.map((u) => u.id)).toContain(documentId);
    expect(listBody.documents).toEqual([]); // still unpublished -- no customer_preview listed

    const dlResp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/documents/${documentId}`, { cookie }), env);
    expect(dlResp.status).toBe(200);
    expect(new Uint8Array(await dlResp.arrayBuffer())).toEqual(fakePdfBytes());
  });

  it("a supporting document cannot be attached once the form is past draft/revision_requested", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    let submission = await assignForm(client, application, staff);
    submission = await transitionStatus(env.DB, submission, "submitted", { clientId: client.id });

    const uploadReq = new Request(`${SITE_ORIGIN}/api/bi-forms/${submission.id}/documents`, {
      method: "POST",
      headers: { Origin: SITE_ORIGIN, Cookie: cookie, "X-Filename": "late.pdf" },
      body: fakePdfBytes(),
    });
    const resp = await worker.fetch(uploadReq, env);
    expect(resp.status).toBe(409);
  });

  it("attaching a document to a submission with no associated application is refused clearly, not with a raw 500", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    const submission = await assignForm(client, null, staff); // no application

    const uploadReq = new Request(`${SITE_ORIGIN}/api/bi-forms/${submission.id}/documents`, {
      method: "POST",
      headers: { Origin: SITE_ORIGIN, Cookie: cookie, "X-Filename": "orphan.pdf" },
      body: fakePdfBytes(),
    });
    const resp = await worker.fetch(uploadReq, env);
    expect(resp.status).toBe(501);
  });

  it("client B cannot upload to or download from client A's BI-form submission", async () => {
    const clientA = await createTestClient();
    const applicationA = await createTestApplication(clientA);
    const staff = await createTestStaff();
    const submission = await assignForm(clientA, applicationA, staff);
    const clientB = await createTestClient();
    const cookieB = await createSessionCookieFor(clientB);

    const uploadReq = new Request(`${SITE_ORIGIN}/api/bi-forms/${submission.id}/documents`, {
      method: "POST",
      headers: { Origin: SITE_ORIGIN, Cookie: cookieB, "X-Filename": "hijack.pdf" },
      body: fakePdfBytes(),
    });
    expect((await worker.fetch(uploadReq, env)).status).toBe(404);

    const dlResp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/documents/does-not-matter`, { cookie: cookieB }), env);
    expect(dlResp.status).toBe(404);
  });
});

// Stage 5.5: the rest of this suite exercised only CCS-A-CDR-2016 --
// "for all three validated forms" per this phase's testing requirements.
// 2014-13-002 is structurally identical to CDR (same personal-info field
// set), so one straightforward submission test is representative; 2014-
// 13-006 is the one form with conditional questions (showIf) and a
// repeatable group, so it gets dedicated coverage for both.
describe("customer-facing BI-form routes: 2014-13-002", () => {
  it("a complete submission transitions to submitted", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    const submission = await assignForm(client, null, staff, { biFormId: "2014-13-002" });
    const completeAnswers = {
      lastName: "TANAKA", firstName: "KENJI", middleName: "HARUTO", otherName1: "N/A", otherName2: "N/A",
      dobDay: "08", dobMonth: "JUL", dobYear: "1988", gender: "M", placeOfBirth: "OSAKA JAPAN", citizenship: "JAPANESE",
      address1: "12 ORCHID STREET", barangay: "BRGY BEL AIR MAKATI", provinceZip: "METRO MANILA 1209", passportNumber: "TK4455667",
    };
    await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/draft`, { method: "PATCH", cookie, body: { answers: completeAnswers } }), env);
    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/submit`, { method: "POST", cookie }), env);
    expect(resp.status).toBe(200);
  });
});

describe("customer-facing BI-form routes: 2014-13-006 (conditional questions + repeatable fields)", () => {
  function baseAnswers() {
    return {
      lastName: "TANAKA", firstName: "KENJI", middleName: "HARUTO", otherName1: "N/A", otherName2: "N/A",
      dobDay: "08", dobMonth: "JUL", dobYear: "1988", gender: "M", placeOfBirth: "OSAKA JAPAN", citizenship: "JAPANESE",
      passportNumber: "TK4455667", address1: "12 ORCHID STREET", barangay: "BRGY BEL AIR MAKATI", provinceZip: "METRO MANILA 1209",
      requestingAgencyApplies: false, courtLegalApplies: false,
      trips: [{ arrivalDay: "14", arrivalMonth: "FEB", arrivalYear: "2025", arrivalFlight: "PR0431", departureDay: "28", departureMonth: "FEB", departureYear: "2025", departureFlight: "PR0432" }],
    };
  }

  it("submits successfully with both conditional gates answered 'no' and one repeatable trip entry", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    const submission = await assignForm(client, null, staff, { biFormId: "2014-13-006" });
    await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/draft`, { method: "PATCH", cookie, body: { answers: baseAnswers() } }), env);

    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/submit`, { method: "POST", cookie }), env);
    expect(resp.status).toBe(200);
  });

  it("answering the court/legal gate 'yes' without the follow-up questions is rejected, and accepted once they're answered", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    const submission = await assignForm(client, null, staff, { biFormId: "2014-13-006" });
    const incomplete = { ...baseAnswers(), courtLegalApplies: true }; // courtName/courtBranchPlace/courtContactNumber still unanswered
    await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/draft`, { method: "PATCH", cookie, body: { answers: incomplete } }), env);

    let resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/submit`, { method: "POST", cookie }), env);
    expect(resp.status).toBe(422);
    const body = await resp.json();
    expect(body.error).toMatch(/courtName/);

    const complete = { ...incomplete, courtName: "Regional Trial Court", courtBranchPlace: "Branch 1, Manila", courtContactNumber: "09170000000" };
    await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/draft`, { method: "PATCH", cookie, body: { answers: complete } }), env);
    resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/submit`, { method: "POST", cookie }), env);
    expect(resp.status).toBe(200);
  });

  it("two filled repeatable trip entries round-trip correctly through a draft save", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    const submission = await assignForm(client, null, staff, { biFormId: "2014-13-006" });
    const answers = {
      ...baseAnswers(),
      trips: [
        { arrivalDay: "14", arrivalMonth: "FEB", arrivalYear: "2025", arrivalFlight: "PR0431", departureDay: "28", departureMonth: "FEB", departureYear: "2025", departureFlight: "PR0432" },
        { arrivalDay: "01", arrivalMonth: "JUN", arrivalYear: "2025", arrivalFlight: "CX900", departureDay: "10", departureMonth: "JUN", departureYear: "2025", departureFlight: "CX901" },
      ],
    };
    await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/draft`, { method: "PATCH", cookie, body: { answers } }), env);

    const getResp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}`, { cookie }), env);
    const getBody = await getResp.json();
    expect(getBody.submission.answers.trips).toHaveLength(2);
    expect(getBody.submission.answers.trips[1].arrivalFlight).toBe("CX900");
  });
});
