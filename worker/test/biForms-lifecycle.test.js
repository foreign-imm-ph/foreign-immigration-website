import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import { assertTransitionAllowed, STATUSES, createSubmission, transitionStatus, getHistory } from "../src/lib/biForms.js";
import { createTestClient, createTestApplication, createTestStaff } from "./helpers.js";

// Full transition table from bi-forms-library/BI_FORM_LIFECYCLE.md,
// expressed as an exhaustive matrix test: every (from, to) pair not
// explicitly allowed must be rejected -- not just spot-checking the
// allowed ones.
const ALLOWED = {
  draft: ["submitted", "cancelled"],
  submitted: ["under_review", "cancelled"],
  under_review: ["revision_requested", "approved", "cancelled"],
  revision_requested: ["submitted", "cancelled"],
  approved: ["published", "revision_requested"],
  published: ["revision_requested"],
  cancelled: [],
};

describe("BI-form lifecycle transition rules (assertTransitionAllowed)", () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const shouldAllow = (ALLOWED[from] || []).includes(to);
      it(`${from} -> ${to} is ${shouldAllow ? "allowed" : "rejected"}`, () => {
        if (shouldAllow) {
          expect(() => assertTransitionAllowed(from, to)).not.toThrow();
        } else {
          expect(() => assertTransitionAllowed(from, to)).toThrow();
        }
      });
    }
  }
});

describe("BI-form lifecycle end to end against real D1 (transitionStatus + history)", () => {
  it("records a full chronological history across a realistic lifecycle", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    let submission = await createSubmission(env.DB, { applicationId: application.id, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    expect(submission.status).toBe("draft");

    submission = await transitionStatus(env.DB, submission, "submitted", { clientId: client.id });
    submission = await transitionStatus(env.DB, submission, "under_review", { staffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "revision_requested", { staffEmail: staff.email, note: "Please correct your passport number" });
    submission = await transitionStatus(env.DB, submission, "submitted", { clientId: client.id });
    submission = await transitionStatus(env.DB, submission, "under_review", { staffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "approved", { staffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "published", { staffEmail: staff.email });
    expect(submission.status).toBe("published");
    expect(submission.published_at).toBeTruthy();
    expect(submission.published_by_staff_email).toBe(staff.email);

    const history = await getHistory(env.DB, submission.id);
    expect(history.map((h) => h.status)).toEqual([
      "draft", "submitted", "under_review", "revision_requested", "submitted", "under_review", "approved", "published",
    ]);
    expect(history.find((h) => h.status === "revision_requested").note).toBe("Please correct your passport number");
  });

  it("rejects an illegal transition attempted through transitionStatus (not just the pure checker)", async () => {
    const client = await createTestClient();
    const staff = await createTestStaff();
    const submission = await createSubmission(env.DB, { applicationId: null, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    await expect(transitionStatus(env.DB, submission, "approved", { staffEmail: staff.email })).rejects.toThrow();
  });

  it("approved -> revision_requested is allowed (a safety valve for catching a mistake before publishing)", async () => {
    const client = await createTestClient();
    const staff = await createTestStaff();
    let submission = await createSubmission(env.DB, { applicationId: null, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "submitted", { clientId: client.id });
    submission = await transitionStatus(env.DB, submission, "under_review", { staffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "approved", { staffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "revision_requested", { staffEmail: staff.email, note: "caught a typo before publishing" });
    expect(submission.status).toBe("revision_requested");
  });

  it("published -> revision_requested is allowed (re-opening an already-published form for correction)", async () => {
    const client = await createTestClient();
    const staff = await createTestStaff();
    let submission = await createSubmission(env.DB, { applicationId: null, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "submitted", { clientId: client.id });
    submission = await transitionStatus(env.DB, submission, "under_review", { staffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "approved", { staffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "published", { staffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "revision_requested", { staffEmail: staff.email, note: "found an error after publishing" });
    expect(submission.status).toBe("revision_requested");
  });

  it("cancelled is terminal -- no transition out of it is ever allowed", async () => {
    const client = await createTestClient();
    const staff = await createTestStaff();
    let submission = await createSubmission(env.DB, { applicationId: null, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "cancelled", { staffEmail: staff.email });
    for (const to of STATUSES) {
      await expect(transitionStatus(env.DB, submission, to, { staffEmail: staff.email })).rejects.toThrow();
    }
  });
});
