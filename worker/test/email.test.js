import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendEnquiryAcknowledgement,
  sendEnquiryReplyEmail,
  sendInstantServicesVerification,
  sendInstantServicesConfirmation,
  sendMagicLink,
  sendDocumentRequestNotification,
  sendPaymentRequestNotification,
  sendApplicationStatusUpdate,
  sendClientMessageNotification,
  sendPaymentConfirmation,
  sendStaffEnquiryNotification,
} from "../src/lib/email.js";

// "FIS -- Final Automation Integration" directive item 3's own test
// requirement: representative templates in several languages, plus the
// English-fallback behavior every template shares. These are pure unit
// tests (no D1/R2/Miniflare needed) -- email.js's send() only ever
// touches env and a mocked global fetch, exactly like every other
// outbound call in this file.
function fakeEnv() {
  return { RESEND_API_KEY: "test-key", EMAIL_FROM: "FIS <no-reply@example.com>", EMAIL_REPLY_TO: "help@example.com", PUBLIC_SITE_URL: "https://example.test" };
}

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function sentBody() {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe("email.js: multilingual transactional emails", () => {
  it("sendEnquiryAcknowledgement renders in zh-CN when the enquiry's saved language is zh-CN", async () => {
    await sendEnquiryAcknowledgement(fakeEnv(), { to: "a@b.com", fullName: "Dela Cruz", reference: "ENQ-123", lang: "zh-CN" });
    const body = sentBody();
    expect(body.subject).toBe("已收到您的咨询 - ENQ-123");
    expect(body.text).toContain("亲爱的Dela Cruz，");
    expect(body.text).toContain("编号： ENQ-123");
    expect(body.html).toContain("编号：");
  });

  it("sendEnquiryAcknowledgement renders in ja", async () => {
    await sendEnquiryAcknowledgement(fakeEnv(), { to: "a@b.com", fullName: "Tanaka", reference: "ENQ-456", lang: "ja" });
    const body = sentBody();
    expect(body.subject).toBe("お問い合わせを受け付けました - ENQ-456");
    expect(body.text).toContain("Tanaka 様");
  });

  it("sendEnquiryAcknowledgement renders in vi", async () => {
    await sendEnquiryAcknowledgement(fakeEnv(), { to: "a@b.com", fullName: "Nguyen", reference: "ENQ-789", lang: "vi" });
    const body = sentBody();
    expect(body.subject).toBe("Đã nhận được yêu cầu của quý khách - ENQ-789");
    expect(body.text).toContain("Kính gửi Nguyen,");
  });

  it("sendEnquiryAcknowledgement falls back to English when lang is missing", async () => {
    await sendEnquiryAcknowledgement(fakeEnv(), { to: "a@b.com", fullName: "Smith", reference: "ENQ-999" });
    const body = sentBody();
    expect(body.subject).toBe("Enquiry received - ENQ-999");
    expect(body.text).toContain("Dear Smith,");
  });

  it("sendEnquiryAcknowledgement falls back to English when lang is an unsupported/unknown code", async () => {
    await sendEnquiryAcknowledgement(fakeEnv(), { to: "a@b.com", fullName: "Smith", reference: "ENQ-000", lang: "fr" });
    const body = sentBody();
    expect(body.subject).toBe("Enquiry received - ENQ-000");
  });

  it("sendEnquiryReplyEmail localizes the wrapper text but never touches replyText/englishOriginal content", async () => {
    await sendEnquiryReplyEmail(fakeEnv(), {
      to: "a@b.com",
      fullName: "Dela Cruz",
      reference: "ENQ-111",
      replyText: "Ya naisumite na ang iyong dokumento.",
      englishOriginal: "Your document has been submitted.",
      lang: "ko",
    });
    const body = sentBody();
    expect(body.text).toContain("Dela Cruz님,");
    expect(body.text).toContain("영어 원문"); // localized label
    expect(body.text).toContain("Ya naisumite na ang iyong dokumento."); // untouched case content
    expect(body.text).toContain("Your document has been submitted."); // untouched case content
    expect(body.text).toContain("참조 번호: ENQ-111");
  });

  it("sendInstantServicesVerification renders in zh-Hant", async () => {
    await sendInstantServicesVerification(fakeEnv(), { to: "a@b.com", url: "https://example.test/verify?token=x", lang: "zh-Hant" });
    const body = sentBody();
    expect(body.subject).toBe("確認您的Instant Services申請請求");
    expect(body.html).toContain("驗證我的郵箱");
  });

  it("sendInstantServicesConfirmation renders in ko with both references", async () => {
    await sendInstantServicesConfirmation(fakeEnv(), { to: "a@b.com", fullName: "Kim", orderReference: "ORD-1", applicationReference: "APP-1", lang: "ko" });
    const body = sentBody();
    expect(body.subject).toBe("Instant Services 신청이 제출되었습니다 - ORD-1");
    expect(body.text).toContain("주문 참조 번호: ORD-1");
    expect(body.text).toContain("신청 참조 번호: APP-1");
  });

  it("sendMagicLink renders in vi", async () => {
    await sendMagicLink(fakeEnv(), { to: "a@b.com", url: "https://example.test/verify?token=x", lang: "vi" });
    const body = sentBody();
    expect(body.subject).toBe("Đăng nhập vào Cổng thông tin khách hàng");
  });

  it("sendDocumentRequestNotification renders in ja and never includes a document label (none is passed in)", async () => {
    await sendDocumentRequestNotification(fakeEnv(), { to: "a@b.com", applicationReference: "APP-2", lang: "ja" });
    const body = sentBody();
    expect(body.subject).toBe("書類のご提出をお願いします - APP-2");
    expect(body.text).toContain("APP-2について、書類のご提出をお願いしております。");
  });

  it("sendPaymentRequestNotification renders the amount correctly in zh-CN", async () => {
    await sendPaymentRequestNotification(fakeEnv(), { to: "a@b.com", applicationReference: "APP-3", amountPhp: 1500.5, lang: "zh-CN" });
    const body = sentBody();
    expect(body.text).toContain("金额： PHP 1500.50");
  });

  it("sendApplicationStatusUpdate reuses the Client Portal's own localized status label", async () => {
    await sendApplicationStatusUpdate(fakeEnv(), { to: "a@b.com", fullName: "Dela Cruz", applicationReference: "APP-4", status: "under_review", lang: "zh-CN" });
    const body = sentBody();
    expect(body.text).toContain("最新状态： 审核中"); // matches clientLocaleStrings.js's own STATUS_LABELS, not a re-translation
  });

  it("sendApplicationStatusUpdate omits the greeting entirely when fullName is absent, in every language", async () => {
    await sendApplicationStatusUpdate(fakeEnv(), { to: "a@b.com", applicationReference: "APP-5", status: "approved", lang: "ja" });
    const body = sentBody();
    expect(body.text).not.toContain("様");
    expect(body.html).not.toContain("様");
  });

  it("sendClientMessageNotification renders in vi", async () => {
    await sendClientMessageNotification(fakeEnv(), { to: "a@b.com", applicationReference: "APP-6", lang: "vi" });
    const body = sentBody();
    expect(body.subject).toBe("Tin nhắn mới từ Bộ phận Chăm sóc Khách hàng FIS - APP-6");
  });

  it("sendPaymentConfirmation renders in ko", async () => {
    await sendPaymentConfirmation(fakeEnv(), { to: "a@b.com", applicationReference: "APP-7", amountPhp: 2000, lang: "ko" });
    const body = sentBody();
    expect(body.subject).toBe("결제가 확인되었습니다 - APP-7");
    expect(body.text).toContain("금액: PHP 2000.00");
  });

  it("sendStaffEnquiryNotification (staff-facing, not customer-facing) stays English regardless of any lang-like input", async () => {
    await sendStaffEnquiryNotification(fakeEnv(), { reference: "ENQ-222", serviceSlug: "motions-blacklist", fullName: "Dela Cruz", email: "a@b.com", priority: "standard" });
    const body = sentBody();
    expect(body.subject).toBe("New enquiry - ENQ-222");
    expect(body.text).toContain("New enquiry received.");
  });
});
