import { describe, it, expect } from "vitest";
import {
  localDateTimeToUtc,
  noticeHours,
  isEligibleForRescheduling,
  evaluateRescheduleRequest,
  NOTICE_HOURS_REQUIRED,
  POLICY_OUTCOMES,
} from "../src/lib/airportVipPolicy.js";

describe("airportVipPolicy: localDateTimeToUtc", () => {
  it("converts a Manila (UTC+8, no DST) local time correctly", () => {
    const utc = localDateTimeToUtc("2026-12-01", "14:30", "Asia/Manila");
    expect(utc).toBe("2026-12-01T06:30:00.000Z");
  });

  it("converts a US Eastern local time correctly on each side of a DST transition", () => {
    // 2026-03-08 is the US spring-forward date; before it, ET is UTC-5 (EST).
    const beforeDst = localDateTimeToUtc("2026-03-01", "09:00", "America/New_York");
    expect(beforeDst).toBe("2026-03-01T14:00:00.000Z");
    // After spring-forward, ET is UTC-4 (EDT).
    const afterDst = localDateTimeToUtc("2026-03-15", "09:00", "America/New_York");
    expect(afterDst).toBe("2026-03-15T13:00:00.000Z");
  });
});

describe("airportVipPolicy: noticeHours / isEligibleForRescheduling", () => {
  const departure = "2026-06-15T00:00:00.000Z";

  it("is eligible at exactly 120 hours' notice (the boundary itself counts)", () => {
    const received = new Date(new Date(departure).getTime() - NOTICE_HOURS_REQUIRED * 60 * 60 * 1000).toISOString();
    expect(noticeHours(departure, received)).toBeCloseTo(120, 6);
    expect(isEligibleForRescheduling(departure, received)).toBe(true);
  });

  it("is eligible with more than 120 hours' notice", () => {
    const received = new Date(new Date(departure).getTime() - 200 * 60 * 60 * 1000).toISOString();
    expect(isEligibleForRescheduling(departure, received)).toBe(true);
  });

  it("is NOT eligible with just under 120 hours' notice", () => {
    const received = new Date(new Date(departure).getTime() - (120 * 60 * 60 * 1000 - 60 * 1000)).toISOString();
    expect(isEligibleForRescheduling(departure, received)).toBe(false);
  });

  it("is NOT eligible with far less than 120 hours' notice", () => {
    const received = new Date(new Date(departure).getTime() - 24 * 60 * 60 * 1000).toISOString();
    expect(isEligibleForRescheduling(departure, received)).toBe(false);
  });

  it("is NOT eligible when the request arrives after the originally scheduled departure", () => {
    const received = new Date(new Date(departure).getTime() + 60 * 60 * 1000).toISOString();
    expect(noticeHours(departure, received)).toBeLessThan(0);
    expect(isEligibleForRescheduling(departure, received)).toBe(false);
  });
});

describe("airportVipPolicy: evaluateRescheduleRequest", () => {
  it("returns the eligible outcome with the computed notice hours", () => {
    const departure = "2026-06-15T00:00:00.000Z";
    const received = new Date(new Date(departure).getTime() - 150 * 60 * 60 * 1000).toISOString();
    const result = evaluateRescheduleRequest(departure, received);
    expect(result.eligible).toBe(true);
    expect(result.outcome).toBe(POLICY_OUTCOMES.ELIGIBLE_SUBJECT_TO_AVAILABILITY);
    expect(result.noticeHours).toBeCloseTo(150, 6);
  });

  it("returns the not-eligible outcome under 120 hours", () => {
    const departure = "2026-06-15T00:00:00.000Z";
    const received = new Date(new Date(departure).getTime() - 50 * 60 * 60 * 1000).toISOString();
    const result = evaluateRescheduleRequest(departure, received);
    expect(result.eligible).toBe(false);
    expect(result.outcome).toBe(POLICY_OUTCOMES.NOT_ELIGIBLE_INSUFFICIENT_NOTICE);
  });
});
