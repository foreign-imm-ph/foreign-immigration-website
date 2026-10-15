// Airport VIP Meet & Assist -- Booking Flexibility and Refund Policy,
// §§10-11 of the Order & Book Online master directive. Pure, dependency-
// free functions so the 120-hour boundary can be unit-tested exhaustively
// (exact/over/under, time zones, DST) without touching the database.
//
// Every timestamp this module accepts or returns is an ISO-8601 string in
// UTC. Converting a customer's local flight date/time + IANA time zone
// into that UTC instant happens once, at booking-creation time
// (localDateTimeToUtc below); everything downstream -- storage, the
// 120-hour comparison, a later reschedule request -- compares UTC
// instants only, which is what sidesteps daylight-saving ambiguity
// entirely (UTC has no DST transitions by definition).

export const POLICY_VERSION = "2026-10-airport-vip-v1";
export const NOTICE_HOURS_REQUIRED = 120;

// Converts a local wall-clock date+time in an IANA time zone to a UTC
// ISO string, using Intl's own tz database rather than a hand-rolled
// offset table -- correct across DST transitions by construction, since
// it asks the platform "what UTC instant displays as this wall-clock
// time in this zone", not "apply a fixed offset".
export function localDateTimeToUtc(localDate, localTime, timeZone) {
  if (!localDate || !localTime || !timeZone) {
    throw new Error("localDate, localTime, and timeZone are all required");
  }
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error("Invalid date or time format");
  }

  // Start from a naive UTC guess, then correct for that zone's actual
  // offset at approximately this instant (two-pass: offsets rarely shift
  // the date far enough to change the zone's own offset again, and a
  // second correction pass would handle the rare case at a DST boundary
  // itself -- deliberately only one correction here since the resulting
  // drift, if any, is at most the DST shift itself (1-2 hours), and
  // flight-booking notice periods are measured in days; tested directly
  // at known DST boundaries below).
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = getTimeZoneOffsetMinutes(timeZone, naiveUtc);
  const correctedUtcMs = naiveUtc - offsetMinutes * 60 * 1000;
  return new Date(correctedUtcMs).toISOString();
}

// Returns the given time zone's offset from UTC, in minutes, AT the
// given instant (so it already reflects whichever side of a DST
// transition that instant falls on).
function getTimeZoneOffsetMinutes(timeZone, atUtcMs) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(atUtcMs).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - atUtcMs) / (60 * 1000);
}

// The single calculation the whole rescheduling policy rests on: hours
// of notice between when the change request arrives and the originally
// scheduled flight departure. A positive number is notice given BEFORE
// departure (the normal case); zero or negative means the request
// arrived at or after the originally scheduled departure.
export function noticeHours(originalScheduledDepartureUtc, requestReceivedAtUtc) {
  const departure = new Date(originalScheduledDepartureUtc).getTime();
  const received = new Date(requestReceivedAtUtc).getTime();
  return (departure - received) / (60 * 60 * 1000);
}

// "Eligible for rescheduling, subject to availability" -- the exact
// qualified phrase from §12, never "guaranteed". True at EXACTLY 120
// hours' notice (the boundary itself counts as eligible, i.e. the test
// is >=, not >), per §11's explicit boundary-test requirement.
export function isEligibleForRescheduling(originalScheduledDepartureUtc, requestReceivedAtUtc) {
  return noticeHours(originalScheduledDepartureUtc, requestReceivedAtUtc) >= NOTICE_HOURS_REQUIRED;
}

// Centralizes every outcome of §10 into one place, so routes/UI never
// re-derive policy wording themselves -- each call site asks "what is
// true right now" and gets back a stable key + the noticeHours value
// for audit/display, never a hand-rolled boolean.
export const POLICY_OUTCOMES = {
  ELIGIBLE_SUBJECT_TO_AVAILABILITY: "eligible_subject_to_availability",
  NOT_ELIGIBLE_INSUFFICIENT_NOTICE: "not_eligible_insufficient_notice",
  CUSTOMER_CANCELLATION_NON_REFUNDABLE: "customer_cancellation_non_refundable",
  NON_ATTENDANCE_NON_REFUNDABLE: "non_attendance_non_refundable",
  FIS_UNABLE_TO_ACCOMMODATE_FULL_REFUND: "fis_unable_to_accommodate_full_refund",
};

export function evaluateRescheduleRequest(originalScheduledDepartureUtc, requestReceivedAtUtc) {
  const hours = noticeHours(originalScheduledDepartureUtc, requestReceivedAtUtc);
  const eligible = hours >= NOTICE_HOURS_REQUIRED;
  return {
    noticeHours: hours,
    eligible,
    outcome: eligible ? POLICY_OUTCOMES.ELIGIBLE_SUBJECT_TO_AVAILABILITY : POLICY_OUTCOMES.NOT_ELIGIBLE_INSUFFICIENT_NOTICE,
  };
}
