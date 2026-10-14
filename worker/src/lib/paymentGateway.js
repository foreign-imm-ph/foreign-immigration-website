// Provider-independent payment layer for Instant Services (Part V.15).
// No production gateway is chosen or wired in here -- this is the
// structural seam a future gateway (PayMongo or otherwise, once you
// approve one) plugs into, modeled on the one payment method that is
// actually real today: QR Ph, manual verification.
//
// Every adapter implements the same shape:
//   id              -- stable string key, stored on payment_requests.gateway_provider
//   createIntent(order, snapshot) -> { method, instructions, requiresManualVerification }
//   verifyWebhookSignature(request, rawBody, secret) -> boolean
//   isConfigured(env) -> boolean -- whether this adapter has what it needs to be offered to a customer right now
//
// "requiresManualVerification: true" is QR Ph's entire security model --
// a customer action can only ever move a payment_requests row to
// 'submitted'; only a staff action (or, for a future real gateway, a
// verified webhook) can ever move it to 'paid'. See routes/checkoutCustomer.js.

export const QR_PH = {
  id: "qr_ph",
  requiresManualVerification: true,
  async createIntent(order, snapshot, settings) {
    return {
      method: "qr_ph",
      amountPhpCentavos: snapshot.totalPhpCentavos,
      merchantDisplayName: settings.merchant_display_name || null,
      instructions: settings.customer_instructions || null,
      requiresManualVerification: true,
    };
  },
  // QR Ph has no webhook at all -- nothing calls this for the qr_ph
  // adapter; it exists only so the interface shape is uniform across
  // adapters, and so a future adapter's real implementation is a drop-in
  // replacement rather than a special case in route code.
  async verifyWebhookSignature() {
    return false;
  },
  // Configured once an administrator has uploaded an image AND
  // explicitly enabled it -- see routes/staffCheckout.js. Never "always
  // true": an unconfigured/disabled QR Ph must never be offered, per the
  // explicit "QR Ph must remain disabled until an authorized
  // administrator uploads a valid image and explicitly enables the
  // method" requirement.
  isConfigured(settings) {
    return !!(settings && settings.enabled && settings.qr_image_r2_key);
  },
};

// Deliberately NOT registered in PROVIDERS below, and deliberately not
// reachable from any customer-facing route -- exists only so a future
// real gateway's integration code has a concrete, already-proven
// counterpart to pattern-match against in local tests, per "use local
// mocks or test adapters for development... do not implement fake
// production success callbacks". Nothing in this module ever calls
// `markPaid` itself; only an explicit test imports and exercises this.
export const TEST_MOCK_GATEWAY = {
  id: "test_mock",
  requiresManualVerification: false,
  async createIntent(order, snapshot) {
    return {
      method: "test_mock",
      amountPhpCentavos: snapshot.totalPhpCentavos,
      // Never a real URL -- a syntactically-obvious non-production value,
      // so this can never be mistaken for (or accidentally wired to) a
      // live checkout session.
      sessionUrl: `test-mock://checkout-session/${order.id}`,
      requiresManualVerification: false,
    };
  },
  async verifyWebhookSignature(request, rawBody, secret) {
    if (!secret) return false;
    const signature = request.headers.get("X-Test-Mock-Signature");
    return signature === secret;
  },
  isConfigured() {
    return true;
  },
};

// The only provider actually offered to a customer today. Adding a real
// gateway later means adding its adapter here (and in PROVIDERS), not
// changing any route's logic -- routes only ever call through this
// registry by id, never hardcode "qr_ph" behavior inline.
export const PROVIDERS = {
  qr_ph: QR_PH,
};

export function getProvider(id) {
  return PROVIDERS[id] || null;
}
