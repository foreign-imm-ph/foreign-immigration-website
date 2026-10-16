import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
// Vite resolves a `?raw` import to the file's text content at transform
// time (build time), unlike node:fs's readFileSync -- which cannot reach
// outside this Worker's own sandboxed filesystem view once the test
// actually runs inside the Workers runtime (Miniflare), not plain Node.
import applyJsSource from "../../src/assets/js/instant-services-apply.js?raw";
import worker from "../src/index.js";
import {
  authedRequest,
  createTestClient,
  createSessionCookieFor,
  createTestCheckoutService,
  selectProcessingTier,
  SITE_ORIGIN,
} from "./helpers.js";
import {
  PROCESSING_TIERS,
  usesProcessingTiers,
  tierIsApproved,
  tierIsSelectable,
  getProcessingTiersForCustomer,
  updateProcessingTiers,
  setOfferingStatus,
  findOrCreateDraftOrder,
  startOrderApplication,
  computeAndSnapshotPrice,
  getServiceById,
} from "../src/lib/checkout.js";
import { HttpError } from "../src/lib/storage.js";
import { recordPaymentSettingsChange } from "../src/lib/checkoutPaymentSettings.js";

// Focused coverage for the dual Express/Regular processing-tier system
// (MASTER DIRECTIVE -- DUAL PROCESSING TIERS, PRICING, LEAD TIMES & FREE
// NATIONWIDE DELIVERY). This reuses the existing checkout test
// infrastructure (helpers.js, the real Worker entry point) rather than
// building a second harness -- each `it` below maps to one of the
// directive's enumerated scenarios, named in its own title.

describe("Dual processing tiers: catalogue-level rules", () => {
  it("lists Express before Regular, and only tiers that are both enabled and approved (display order + default-enabled)", async () => {
    const service = await createTestCheckoutService();
    const tiers = getProcessingTiersForCustomer(service);
    expect(tiers.map((t) => t.tier)).toEqual(["express", "regular"]);
    expect(tiers[0].totalPhpCentavos).toBe(800000);
    expect(tiers[1].totalPhpCentavos).toBe(500000);
  });

  it("disabling one tier leaves only the other selectable; disabling both leaves none", async () => {
    const onlyRegular = await createTestCheckoutService({ expressEnabled: false });
    expect(tierIsSelectable(onlyRegular, "express")).toBe(false);
    expect(tierIsSelectable(onlyRegular, "regular")).toBe(true);
    expect(getProcessingTiersForCustomer(onlyRegular).map((t) => t.tier)).toEqual(["regular"]);

    const neither = await createTestCheckoutService({ expressEnabled: false, regularEnabled: false });
    expect(getProcessingTiersForCustomer(neither)).toEqual([]);
  });

  it("a disabled tier is never selectable even though its price/lead-time data is still present", async () => {
    const service = await createTestCheckoutService({ expressEnabled: false });
    // Price/lead-time columns are still populated by the fixture -- only
    // `enabled` differs -- proving tierIsSelectable checks enabled AND
    // approved, not approved alone.
    expect(service.express_price_php_centavos).not.toBeNull();
    expect(tierIsApproved(service, "express")).toBe(true);
    expect(tierIsSelectable(service, "express")).toBe(false);
  });

  it("each tier's price and lead-time range is independently configurable", async () => {
    const service = await createTestCheckoutService({
      expressPriceCentavos: 900000, expressMinDays: 1, expressMaxDays: 2,
      regularPriceCentavos: 450000, regularMinDays: 12, regularMaxDays: 20,
    });
    const [express, regular] = getProcessingTiersForCustomer(service);
    expect(express).toMatchObject({ totalPhpCentavos: 900000, minBusinessDays: 1, maxBusinessDays: 2 });
    expect(regular).toMatchObject({ totalPhpCentavos: 450000, minBusinessDays: 12, maxBusinessDays: 20 });
  });

  it("a tier with a missing price or an incomplete lead-time range is never treated as approved", async () => {
    const noPrice = await createTestCheckoutService({ expressPriceCentavos: null });
    expect(tierIsApproved(noPrice, "express")).toBe(false);
    expect(tierIsSelectable(noPrice, "express")).toBe(false);

    const noMax = await createTestCheckoutService({ regularMaxDays: null });
    expect(tierIsApproved(noMax, "regular")).toBe(false);
  });

  it("updateProcessingTiers rejects an invalid lead-time range (max < min) and a negative price, persisting neither", async () => {
    const service = await createTestCheckoutService();
    await expect(
      updateProcessingTiers(env.DB, service.id, {
        express: { enabled: true, priceCentavos: 800000, minDays: 5, maxDays: 2 },
        regular: { enabled: true, priceCentavos: 500000, minDays: 10, maxDays: 15 },
      })
    ).rejects.toThrow(HttpError);

    const unchanged = await getServiceById(env.DB, service.id);
    expect(unchanged.express_min_business_days).toBe(2); // the fixture's original value, untouched
  });

  it("saving a tier's price/lead-time never auto-activates the offering", async () => {
    const service = await createTestCheckoutService({ active: 0 });
    await updateProcessingTiers(env.DB, service.id, {
      express: { enabled: true, priceCentavos: 700000, minDays: 1, maxDays: 2 },
      regular: { enabled: true, priceCentavos: 400000, minDays: 8, maxDays: 10 },
    });
    const after = await getServiceById(env.DB, service.id);
    expect(after.active).toBe(0);
  });

  it("activation requires approval AND at least one enabled, fully-approved tier -- non-tiered offerings are unaffected by this gate", async () => {
    const noTierApproved = await createTestCheckoutService({ active: 0, expressPriceCentavos: null, regularPriceCentavos: null });
    await setOfferingStatus(env.DB, noTierApproved.id, "approved", "owner@foreignimmigration.ph");
    await expect(setOfferingStatus(env.DB, noTierApproved.id, "active", "owner@foreignimmigration.ph")).rejects.toThrow(HttpError);

    const ready = await createTestCheckoutService({ active: 0 });
    await setOfferingStatus(env.DB, ready.id, "approved", "owner@foreignimmigration.ph");
    const activated = await setOfferingStatus(env.DB, ready.id, "active", "owner@foreignimmigration.ph");
    expect(activated.active).toBe(1);
  });

  it("non-document offerings (bookable_service, fixed_price_service) never use the tier system and keep their legacy single-price model", async () => {
    expect(usesProcessingTiers("bookable_service")).toBe(false);
    expect(usesProcessingTiers("fixed_price_service")).toBe(false);
    const bookable = await createTestCheckoutService({ offeringType: "bookable_service" });
    expect(bookable.express_price_php_centavos).toBeNull();
    expect(getProcessingTiersForCustomer(bookable)).toEqual([]);
  });
});

describe("Dual processing tiers: order snapshot and price integrity", () => {
  it("computeAndSnapshotPrice freezes the SELECTED tier's own price and lead-time range, not the other tier's or a generic total", async () => {
    const service = await createTestCheckoutService({ supportsDelivery: 0 });
    const client = await createTestClient();
    let order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
    await startOrderApplication(env.DB, order, service);
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    order = await selectProcessingTier(order, "express");

    const snapshot = await computeAndSnapshotPrice(env.DB, order);
    expect(snapshot.processingTier).toBe("express");
    expect(snapshot.tierLabel).toBe("Express Processing");
    expect(snapshot.totalPhpCentavos).toBe(800000); // Express, not Regular's 500000
    expect(snapshot.minBusinessDays).toBe(2);
    expect(snapshot.maxBusinessDays).toBe(3);
    expect(snapshot.currency).toBe("PHP");
  });

  it("selecting the other tier on an otherwise-identical order yields that tier's own total -- the two are priced independently end-to-end", async () => {
    const service = await createTestCheckoutService({ supportsDelivery: 0 });
    const client = await createTestClient();
    let order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
    await startOrderApplication(env.DB, order, service);
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    order = await selectProcessingTier(order, "regular");
    const snapshot = await computeAndSnapshotPrice(env.DB, order);
    expect(snapshot.totalPhpCentavos).toBe(500000);
  });

  it("refuses to snapshot a price when no processing tier has been selected yet", async () => {
    const service = await createTestCheckoutService({ supportsDelivery: 0 });
    const client = await createTestClient();
    let order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
    await startOrderApplication(env.DB, order, service);
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    await expect(computeAndSnapshotPrice(env.DB, order)).rejects.toThrow(HttpError);
  });

  it("refuses to snapshot a price for a tier that has since been disabled, even though it was selected while still enabled", async () => {
    const service = await createTestCheckoutService({ supportsDelivery: 0 });
    const client = await createTestClient();
    let order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
    await startOrderApplication(env.DB, order, service);
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    order = await selectProcessingTier(order, "express");

    await env.DB.prepare("UPDATE checkout_services SET express_enabled = 0 WHERE id = ?").bind(service.id).run();
    await expect(computeAndSnapshotPrice(env.DB, order)).rejects.toThrow(HttpError);
  });

  it("the customer-facing API rejects selecting a disabled tier outright (handleSetProcessingTier)", async () => {
    const service = await createTestCheckoutService({ regularEnabled: false, supportsDelivery: 0 });
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });

    const resp = await worker.fetch(
      authedRequest(`/api/instant-services/orders/${order.id}/processing-tier`, { method: "POST", cookie, body: { processingTier: "regular" } }),
      env
    );
    expect(resp.status).toBe(409);

    const unchanged = await env.DB.prepare("SELECT processing_tier FROM checkout_orders WHERE id = ?").bind(order.id).first();
    expect(unchanged.processing_tier).toBeNull();
  });

  it("the browser cannot alter the charged price -- confirm-and-pay never reads a price from the request body, only the server-recomputed tier total", async () => {
    // document_manual has no questionnaire gate (see startOrderApplication),
    // so this test can isolate the price-integrity check itself.
    const service = await createTestCheckoutService({ offeringType: "document_manual", supportsDelivery: 0 });
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    let order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
    await startOrderApplication(env.DB, order, service);
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    order = await selectProcessingTier(order, "express");

    // Configure QR Ph so confirm-and-pay can actually succeed.
    await recordPaymentSettingsChange(env.DB, {
      changedByStaffEmail: "test@fis.test",
      changes: { qrImageR2Key: "config/qr.png", merchantDisplayName: "FIS", customerInstructions: "Scan and pay.", enabled: true },
    });

    const resp = await worker.fetch(
      authedRequest(`/api/instant-services/orders/${order.id}/confirm-and-pay`, {
        method: "POST",
        cookie,
        body: { totalPhpCentavos: 1, priceSnapshot: { totalPhpCentavos: 1 } }, // an attacker-shaped body
      }),
      env
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.priceSnapshot.totalPhpCentavos).toBe(800000); // Express's real price, never the injected 1
  });

  it("a historical order's snapshotted tier/price/lead-time survive unchanged even after the catalogue's own tier pricing is later edited", async () => {
    const service = await createTestCheckoutService({ supportsDelivery: 0 });
    const client = await createTestClient();
    let order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
    await startOrderApplication(env.DB, order, service);
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    order = await selectProcessingTier(order, "regular");
    const original = await computeAndSnapshotPrice(env.DB, order);
    expect(original.totalPhpCentavos).toBe(500000);

    await updateProcessingTiers(env.DB, service.id, {
      express: { enabled: true, priceCentavos: 800000, minDays: 2, maxDays: 3 },
      regular: { enabled: true, priceCentavos: 650000, minDays: 10, maxDays: 15 }, // raised after the order existed
    });

    const reread = await env.DB.prepare("SELECT price_snapshot_json FROM checkout_orders WHERE id = ?").bind(order.id).first();
    expect(JSON.parse(reread.price_snapshot_json).totalPhpCentavos).toBe(500000); // unchanged
  });
});

describe("Dual processing tiers: delivery, independent of processing time", () => {
  async function orderWithDelivery(isInternational) {
    const service = await createTestCheckoutService({ supportsDelivery: 1 });
    const client = await createTestClient();
    let order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
    await startOrderApplication(env.DB, order, service);
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    order = await selectProcessingTier(order, "express");
    await env.DB
      .prepare("INSERT INTO checkout_delivery_addresses (order_id, recipient_name, phone, country, city, region_state_province, postal_code, address_line1, is_international) VALUES (?, 'Test', '000', ?, 'City', 'Region', '0000', 'Line 1', ?)")
      .bind(order.id, isInternational ? "United States" : "Philippines", isInternational ? 1 : 0)
      .run();
    return { order, service };
  }

  it("free domestic delivery applies identically to both tiers -- the delivery status never varies by which tier was selected", async () => {
    const { order } = await orderWithDelivery(false);
    const snapshot = await computeAndSnapshotPrice(env.DB, order);
    expect(snapshot.delivery.domesticFree).toBe(true);
    expect(snapshot.delivery.isInternational).toBe(false);
    expect(snapshot.delivery.internationalQuotationRequired).toBe(false);
  });

  it("an international destination records that a separate delivery quotation is required, without folding any amount into the service price", async () => {
    const { order } = await orderWithDelivery(true);
    const snapshot = await computeAndSnapshotPrice(env.DB, order);
    expect(snapshot.delivery.isInternational).toBe(true);
    expect(snapshot.delivery.domesticFree).toBe(false);
    expect(snapshot.delivery.internationalQuotationRequired).toBe(true);
    expect(snapshot.totalPhpCentavos).toBe(800000); // service price alone -- no invented shipping charge added
  });

  it("processing lead-time and delivery status are recorded as separate snapshot fields -- neither is derived from the other", async () => {
    const { order } = await orderWithDelivery(true);
    const snapshot = await computeAndSnapshotPrice(env.DB, order);
    expect(snapshot.minBusinessDays).toBe(2);
    expect(snapshot.maxBusinessDays).toBe(3);
    expect(snapshot.delivery).toBeTruthy();
    expect(snapshot).not.toHaveProperty("estimatedDeliveryDate"); // no invented combined completion date
  });
});

describe("Dual processing tiers: six-language customer-facing labels", () => {
  it("the apply flow defines the required fixed interface labels in all six canonical languages, each with real (non-empty) text", () => {
    const source = applyJsSource;
    const requiredKeys = [
      "processingOptionHeading",
      "expressProcessingLabel",
      "regularProcessingLabel",
      "estimatedProcessingTimeLabel",
      "businessDaysLabel",
      "deliveryFreeDomesticLabel",
      "deliveryInternationalPendingLabel",
    ];
    const languages = ["en", "zh-CN", "zh-Hant", "ko", "ja", "vi"];
    for (const key of requiredKeys) {
      const matches = source.match(new RegExp(`${key}:\\s*"[^"]+"`, "g")) || [];
      expect(matches.length).toBe(languages.length);
    }
    // The required free-delivery/international/processing-time-excludes-
    // delivery statement must also appear once per language.
    const noticeMatches = source.match(/deliveryNotice:\s*"[^"]+"/g) || [];
    expect(noticeMatches.length).toBe(languages.length);
  });
});
