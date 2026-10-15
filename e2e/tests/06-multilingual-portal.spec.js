// Journey 6: the Client Portal's own six-language localization (Phase 4
// Stage D) -- locale continuity from the public site, static shell
// strings, a backend-SOURCED dynamic status label (proving
// syncPreferredLanguage actually updates client.preferred_communication_
// language server-side, not just the shell's own display), an
// untranslated-fragment regression check (the BI Forms empty state found
// and fixed during this same stage), and the in-portal language switcher.
const { test, expect } = require("@playwright/test");
const {
  ensureTestStaffAdmin,
  createTestClientWithApplication,
  signInClientInPortal,
  d1Json,
} = require("../fixtures/testHelpers");

// Expected strings copied verbatim from src/assets/js/portal-app.js's own
// STRINGS/STATUS_LABELS tables -- this test fails if either file's
// wording drifts without the other being updated to match.
const EXPECTED = {
  en: { signOut: "Sign Out", underReview: "Under review" },
  "zh-CN": { signOut: "退出登录", underReview: "审核中" },
  "zh-Hant": { signOut: "登出", underReview: "審核中" },
  ko: { signOut: "로그아웃", underReview: "검토 중" },
  ja: { signOut: "サインアウト", underReview: "確認中" },
  vi: { signOut: "Đăng Xuất", underReview: "Đang xem xét" },
};

test.describe("Journey 6: multilingual Client Portal", () => {
  test.beforeAll(() => {
    ensureTestStaffAdmin();
  });

  for (const lang of Object.keys(EXPECTED)) {
    test(`locale continuity + dashboard rendering in ${lang}`, async ({ page }) => {
      const client = createTestClientWithApplication({ emailPrefix: `e2e-j6-${lang}` });

      // Simulates having picked `lang` on the PUBLIC site first, then
      // entering the portal -- the continuity requirement, not just the
      // portal's own switcher in isolation.
      await signInClientInPortal(page, client.rawToken, { lang });

      await expect(page.locator("#portal-logout")).toHaveText(EXPECTED[lang].signOut);

      // A dynamic, BACKEND-sourced status label -- proving
      // syncPreferredLanguage() actually persisted
      // client.preferred_communication_language server-side (confirmed
      // directly below), not merely that the shell's own static chrome
      // is translated.
      const statusRows = d1Json(`SELECT preferred_communication_language FROM clients WHERE id = '${client.id}'`);
      expect(statusRows[0].preferred_communication_language).toBe(lang);
      await expect(page.locator(".portal-application-item__status")).toHaveText(EXPECTED[lang].underReview);
    });
  }

  test("the in-portal language switcher updates the UI and syncs the preference to the backend, without a page reload", async ({ page }) => {
    const client = createTestClientWithApplication({ emailPrefix: "e2e-j6-switcher" });
    await signInClientInPortal(page, client.rawToken); // starts in English (no prior locale)

    await expect(page.locator("#portal-logout")).toHaveText("Sign Out");

    await page.selectOption("#portal-lang-switcher", "ja");
    await expect(page.locator("#portal-logout")).toHaveText("サインアウト");
    await expect(page.locator(".portal-application-item__status")).toHaveText("確認中");

    const rows = d1Json(`SELECT preferred_communication_language FROM clients WHERE id = '${client.id}'`);
    expect(rows[0].preferred_communication_language).toBe("ja");
  });

  test("an application's BI Forms empty state is translated, not left as an untranslated English fragment", async ({ page }) => {
    const client = createTestClientWithApplication({ emailPrefix: "e2e-j6-biforms" });
    await signInClientInPortal(page, client.rawToken, { lang: "zh-CN" });

    await page.locator(".portal-application-item").first().click();
    await expect(page.locator("#portal-bi-forms-section")).toContainText("尚未分配 BI 表格");
    await expect(page.locator("#portal-bi-forms-section")).not.toContainText("No BI forms assigned yet");
  });
});
