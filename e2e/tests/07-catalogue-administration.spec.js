// Journey 7: catalogue administration, entirely through the real Staff
// Portal UI (a server-rendered form site, not a SPA) -- no direct API
// calls or DB writes for the actions under test, only for the staff
// identity itself (see testHelpers.ensureTestStaffAdmin).
const { test, expect } = require("@playwright/test");
const { WORKER_BASE, ensureTestStaffAdmin, uniqueSuffix, beginGuestOrderAndSignIn, d1Json, PUBLIC_ORIGIN_HEADERS } = require("../fixtures/testHelpers");

test.describe("Journey 7: catalogue administration", () => {
  test.beforeAll(() => {
    ensureTestStaffAdmin();
  });

  test("create a draft offering, price it, approve it, activate it, and the price stays immutable on an already-placed order", async ({ page }) => {
    const slug = `e2e-fixed-price-${uniqueSuffix()}`;

    // --- Create as draft ---
    await page.goto(`${WORKER_BASE}/staff/instant-services/catalogue/new`);
    await page.selectOption("#offeringType", "fixed_price_service");
    await page.fill("#serviceSlug", slug);
    await page.fill("#serviceFeeAmount", "4500.00");
    await page.fill("#title-en", "E2E Fixed Price Service");
    await page.fill("#desc-en", "A fixed-price professional service created by the automated test suite.");
    await page.fill("#elig-en", "Available to any client. Created by an automated test.");
    await page.fill("#priceChangeReason", "Initial price set by e2e test");
    await page.uncheck("#supportsDelivery"); // Category C: no document deliverable
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/staff\/instant-services\/catalogue\/[^/]+\/?$/);
    const serviceId = page.url().match(/catalogue\/([^/]+)\/?$/)[1];

    await expect(page.locator(".status").first()).toHaveText("draft");
    await expect(page.locator("text=Not yet approved")).toBeVisible();

    // --- Confirm it cannot be purchased while unapproved: the public
    // catalogue API only ever lists active offerings, and this one isn't
    // active yet (activation is refused automatically without approval). ---
    const catalogueResp = await page.request.get(`${WORKER_BASE}/api/instant-services/catalogue`);
    const catalogueBody = await catalogueResp.json();
    expect(catalogueBody.services.some((s) => s.id === serviceId)).toBe(false);

    const detailResp = await page.request.get(`${WORKER_BASE}/api/instant-services/catalogue/${serviceId}`);
    expect(detailResp.status()).toBe(404);

    // Also confirm the server refuses activation outright while
    // unapproved, not merely that the UI hides the option.
    const activateAttempt = await page.request.post(
      `${WORKER_BASE}/staff/instant-services/catalogue/${serviceId}/status`,
      { form: { status: "active" }, maxRedirects: 0, headers: PUBLIC_ORIGIN_HEADERS }
    );
    expect(activateAttempt.status()).toBeGreaterThanOrEqual(400);
    expect(activateAttempt.status()).toBeLessThan(500);

    // --- Move to approved ---
    await page.goto(`${WORKER_BASE}/staff/instant-services/catalogue/${serviceId}`);
    await page.locator('form[action$="/status"] button:has-text("approved")').click();
    await expect(page.locator(".status").first()).toHaveText("approved");
    await expect(page.locator("text=Approved by")).toContainText("dev-staff@local.test");

    // --- Now activation succeeds ---
    await page.locator('form[action$="/status"] button:has-text("active")').click();
    await expect(page.locator(".status").first()).toHaveText("active");
    await expect(page.locator("text=(customer-visible)")).toBeVisible();

    // --- Confirm it IS now purchasable ---
    const catalogueResp2 = await page.request.get(`${WORKER_BASE}/api/instant-services/catalogue`);
    const catalogueBody2 = await catalogueResp2.json();
    expect(catalogueBody2.services.some((s) => s.id === serviceId)).toBe(true);

    // --- Place a real guest order, through the real browser flow, all
    // the way to "confirm and pay" -- that's the one step that actually
    // computes and snapshots the price onto the order. ---
    const { orderId } = await beginGuestOrderAndSignIn(page, {
      serviceId,
      fullName: "E2E Price Immutability Tester",
      emailPrefix: "e2e-price",
    });
    await expect(page.locator("text=Request Submitted")).toBeVisible({ timeout: 15_000 });
    await page.click("#instant-services-confirm-pay");
    await expect(page.locator("#instant-services-qr-image")).toBeVisible({ timeout: 15_000 });

    const rows = d1Json(`SELECT price_snapshot_json FROM checkout_orders WHERE id = '${orderId}'`);
    const snapshot = JSON.parse(rows[0].price_snapshot_json);
    expect(snapshot.totalPhpCentavos).toBe(450000); // 4500.00 PHP, captured at confirm-and-pay

    // --- Staff changes the catalogue price AFTER the order was placed ---
    await page.goto(`${WORKER_BASE}/staff/instant-services/catalogue/${serviceId}`);
    await page.fill("#serviceFeeAmount", "9999.00");
    await page.fill("#priceChangeReason", "e2e: price raised after an order was already placed");
    await page.click('form[action$="/' + serviceId + '"] button[type="submit"]');
    await page.waitForURL(`${WORKER_BASE}/staff/instant-services/catalogue/${serviceId}`);

    // --- Price history now shows two entries ---
    const historyRows = page.locator(".card:has-text('Price history') table tr");
    await expect(historyRows).toHaveCount(3); // header row + 2 price changes

    // --- The already-placed order's stored price snapshot is untouched ---
    const rowsAfter = d1Json(`SELECT price_snapshot_json FROM checkout_orders WHERE id = '${orderId}'`);
    const snapshotAfter = JSON.parse(rowsAfter[0].price_snapshot_json);
    expect(snapshotAfter.totalPhpCentavos).toBe(450000);
  });
});
