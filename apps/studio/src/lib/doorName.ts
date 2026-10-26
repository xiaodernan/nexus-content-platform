/**
 * M7 v508 (ADR 0016 amendment 501) — the NAME a door asks about.
 *
 * v508 wrote this rule for a name read from a QUERY. v521 (ADR 0016 amendment 507) reads a name read
 * from a POST BODY through the same rule, because the two planes had drifted apart in one door: a
 * body’s name was checked by its LENGTH (`projectId.length === 0`), so three spaces was a publication,
 * and v511 then stripped the blank check off the claim’s account altogether — citing this file as its
 * reason, which is the opposite of what the rule says.
 *
 * What the drift costs a caller is measured, not argued. A door that forwards a blank name asks the
 * service; the service refuses BY NAME; the lib’s refusal branch carries no `failure`, so
 * `serviceFailureStatus` answers for the MACHINE and the caller gets a 502 with the service’s own words
 * about a field they sent empty. The query-side doors refuse the same ask at a 400 with their own
 * sentence — the difference `door-contract.test.ts` pins — and a caller cannot tell from a 502 whether
 * to fix the request or wait for the service.
 *
 * The rule, written once so a door written tomorrow keeps it without being told twice: **a door asks
 * about the name the caller MEANT — the bytes they sent, trimmed — and a name that is blank after
 * trimming is not a name at all.** A name is an address, and a door that asks about the trimmed address
 * says back the same thing the record keeps. What the caller SENT ABOUT a thing — a comment body, a
 * report’s detail, a tip’s message, a claimed handle — is DATA, and it travels as the caller wrote it.
 *
 * v508 justified the rule by saying the service never trims. That was wrong in the bytes it cited: the
 * social services read a name through `isBlank()` and then `trim()` — `CommentService`, `LikeService`,
 * `ReportService.requireReason` and the rest — since the first comment write, before this rule existed.
 * The rule survives the correction because it was never about what the service does with the padding:
 * trimming is how the DOOR decides whether it was asked about a real account or about nothing, and the
 * decision has to be made before the ask, because the answer a door gives a malformed ask is the
 * caller’s next move.
 */

/** The name a door asks about: the caller’s own bytes, with the accidental space around them gone. */
export function doorName(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}
