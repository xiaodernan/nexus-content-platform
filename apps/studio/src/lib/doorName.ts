/**
 * M7 v508 (ADR 0016 amendment 501) — the NAME a door asks about.
 *
 * v499 asked every door the same question about a blank account and found the house split down the
 * middle: twelve doors refuse a name that is blank (or trim it away) before the service is asked, and
 * four forward whatever bytes arrived — the likes read, the tips read, and the two take-back segments.
 * The audit behind this amendment read every comment on both sides: none of them defends the split, and
 * git dates it exactly the way it dates the 502/503 split — the trimming doors are the v305–v335 wave,
 * the forwarding doors are the v284–v298 originals. Another accident of authoring order, and this one
 * has a consequence a reader can feel: the service NEVER trims (zero `.trim()` in all of `services/`),
 * so a door that forwards `“ pub-1 ”` asks about a publication that does not exist and answers with an
 * empty list — which reads as “this publication has no likes” when the truth is that nobody asked about
 * the publication the caller meant.
 *
 * The rule, written once so a door written tomorrow keeps it without being told twice: **a door asks
 * about the name the caller MEANT — the bytes they sent, trimmed — and a name that is blank after
 * trimming is not a name at all.** The service is asked about a real account or not asked at all; never
 * about the space in front of one.
 */

/** The name a door asks about: the caller’s own bytes, with the accidental space around them gone. */
export function doorName(raw: string | null): string {
  return (raw ?? '').trim();
}
