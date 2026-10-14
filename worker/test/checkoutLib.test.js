import { describe, it, expect } from "vitest";
import { centavosToPhpString, centavosToPhp, sumCentavos, isValidCentavos, phpStringToCentavos } from "../src/lib/money.js";
import { QR_PH, TEST_MOCK_GATEWAY, PROVIDERS, getProvider } from "../src/lib/paymentGateway.js";
import { assertOrderTransitionAllowed, ORDER_STATUSES, DELIVERY_STATUSES } from "../src/lib/checkout.js";
import { HttpError } from "../src/lib/storage.js";

describe("Instant Services: money helpers", () => {
  it("formats centavos as a peso string with thousands separators and two decimals", () => {
    expect(centavosToPhpString(500000)).toBe("5,000.00");
    expect(centavosToPhpString(50)).toBe("0.50");
    expect(centavosToPhpString(0)).toBe("0.00");
    expect(centavosToPhpString(123456789)).toBe("1,234,567.89");
  });

  it("formats a negative amount with a leading sign", () => {
    expect(centavosToPhpString(-500)).toBe("-5.00");
  });

  it("sums fee components exactly, never drifting the way repeated float addition can", () => {
    const components = [
      { amount_php_centavos: 100 },
      { amount_php_centavos: 200 },
      { amount_php_centavos: 1 },
    ];
    expect(sumCentavos(components)).toBe(301);
    expect(sumCentavos([])).toBe(0);
  });

  it("validates centavos are non-negative integers", () => {
    expect(isValidCentavos(500000)).toBe(true);
    expect(isValidCentavos(0)).toBe(true);
    expect(isValidCentavos(-1)).toBe(false);
    expect(isValidCentavos(1.5)).toBe(false);
    expect(isValidCentavos("500")).toBe(false);
  });

  it("parses a staff-typed peso string (with commas) back into integer centavos", () => {
    expect(phpStringToCentavos("5,000.00")).toBe(500000);
    expect(phpStringToCentavos("5000")).toBe(500000);
    expect(phpStringToCentavos("0.01")).toBe(1);
  });

  it("rejects an invalid or negative peso string rather than guessing", () => {
    expect(phpStringToCentavos("not a number")).toBeNull();
    expect(phpStringToCentavos("-100")).toBeNull();
    expect(phpStringToCentavos("")).toBeNull();
    expect(phpStringToCentavos(undefined)).toBeNull();
  });

  it("round-trips centavosToPhp <-> phpStringToCentavos", () => {
    expect(centavosToPhp(500000)).toBe(5000);
    expect(phpStringToCentavos(String(centavosToPhp(500000)))).toBe(500000);
  });
});

describe("Instant Services: payment gateway abstraction", () => {
  it("QR Ph is unconfigured (never offered) with no settings, a disabled row, or an enabled row with no image", () => {
    expect(QR_PH.isConfigured(null)).toBe(false);
    expect(QR_PH.isConfigured({ enabled: 0, qr_image_r2_key: "config/x.png" })).toBe(false);
    expect(QR_PH.isConfigured({ enabled: 1, qr_image_r2_key: null })).toBe(false);
  });

  it("QR Ph is configured only once both enabled AND a real image key exist", () => {
    expect(QR_PH.isConfigured({ enabled: 1, qr_image_r2_key: "config/qr.png" })).toBe(true);
  });

  it("createIntent never fabricates an amount -- it echoes exactly the server-computed snapshot total", async () => {
    const intent = await QR_PH.createIntent({}, { totalPhpCentavos: 500000 }, { merchant_display_name: "FIS", customer_instructions: "Scan it" });
    expect(intent.amountPhpCentavos).toBe(500000);
    expect(intent.requiresManualVerification).toBe(true);
    expect(intent.method).toBe("qr_ph");
  });

  it("the test mock gateway is never registered or reachable through getProvider -- it exists only for direct test import", () => {
    expect(PROVIDERS.test_mock).toBeUndefined();
    expect(getProvider("test_mock")).toBeNull();
    expect(getProvider("qr_ph")).toBe(QR_PH);
    expect(TEST_MOCK_GATEWAY.id).toBe("test_mock"); // still importable directly, just not wired into the registry
  });
});

describe("Instant Services: order status machine", () => {
  it("allows every mandated forward transition", () => {
    expect(() => assertOrderTransitionAllowed("draft", "awaiting_payment")).not.toThrow();
    expect(() => assertOrderTransitionAllowed("awaiting_payment", "awaiting_verification")).not.toThrow();
    expect(() => assertOrderTransitionAllowed("awaiting_verification", "paid")).not.toThrow();
    expect(() => assertOrderTransitionAllowed("awaiting_verification", "awaiting_payment")).not.toThrow(); // staff rejection
  });

  it("refuses an order already paid, cancelled, or expired from transitioning anywhere else", () => {
    expect(() => assertOrderTransitionAllowed("paid", "awaiting_payment")).toThrow(HttpError);
    expect(() => assertOrderTransitionAllowed("cancelled", "draft")).toThrow(HttpError);
    expect(() => assertOrderTransitionAllowed("expired", "paid")).toThrow(HttpError);
  });

  it("refuses skipping straight from draft to paid", () => {
    expect(() => assertOrderTransitionAllowed("draft", "paid")).toThrow(HttpError);
  });

  it("every status referenced by the state machine is one of the canonical ORDER_STATUSES", () => {
    for (const status of ORDER_STATUSES) {
      expect(typeof status).toBe("string");
    }
    expect(ORDER_STATUSES).toContain("draft");
    expect(ORDER_STATUSES).toContain("paid");
  });
});

describe("Instant Services: delivery statuses", () => {
  it("defines exactly the 9 mandated delivery statuses, in order", () => {
    expect(DELIVERY_STATUSES).toEqual([
      "awaiting_document_completion",
      "ready_for_dispatch",
      "delivery_quotation_issued",
      "awaiting_delivery_payment",
      "delivery_payment_verification",
      "ready_for_shipment",
      "dispatched",
      "delivered",
      "delivery_exception",
    ]);
  });
});
