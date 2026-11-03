package dev.nexus.api.patches;

import static dev.nexus.api.incidents.IncidentService.appliedOffset;
import static dev.nexus.api.incidents.IncidentService.effectiveLimit;

import dev.nexus.api.incidents.IncidentService;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * M9 v595 — the second word of M9's chain: a patch is a proposed change attached to one incident.
 *
 * <p>The service stores the diff and does nothing with it. It does not parse hunks, does not check that the
 * diff is well formed, does not apply it, and never asks a repository whether these bytes still fit. Those
 * are facts about a tree this service does not own, and claiming one would be a verdict it cannot defend.
 * What it CAN defend is the record: these bytes, this title, this author, this incident, this instant.
 *
 * <p>Rules, refused by name (400 {@code invalid-patch}):
 *
 * <ul>
 *   <li>The incident must exist (404 {@code unknown-incident}) — checked BEFORE the fields, because a
 *       proposal with no parent is not a malformed proposal, it is a question about nothing.
 *   <li>The title is one line, trimmed, 1..{@value #MAX_TITLE}.
 *   <li>The diff is the BYTES the author sent: never trimmed, never normalized, bounded at
 *       {@value #MAX_DIFF} characters and refused rather than cut when it is longer. A diff that is only
 *       whitespace is refused — zero bytes propose nothing.
 *   <li>The optional summary and author are trimmed, blank → null, and bounded by their columns.
 * </ul>
 *
 * <p>The listing is scoped to the incident and ordered {@code createdAt DESC, patchId DESC}. Both counts
 * are narrowed by the same incident: an incident's listing may not report the whole table's size. The
 * window rule (default 20, cap 100, floor 1, offset floored to the page that contains it) is the incident
 * listing's rule, CALLED rather than copied, so the two tables' caps cannot drift apart.
 *
 * <p>No audit entry and no webhook delivery: the patch table is the record, like the incident table. The
 * live proof reads zero and zero.
 */
@Service
public class PatchService {

    /** The title column's width. */
    public static final int MAX_TITLE = 120;

    /** The summary column's width. */
    public static final int MAX_SUMMARY = 2000;

    /** The diff column's width. A longer patch is refused by number, never truncated. */
    public static final int MAX_DIFF = 20000;

    /** The width of the author column. */
    public static final int MAX_ACTOR = 120;

    /** The only status this slice writes. The later words of the chain move it; this one does not. */
    public static final String PROPOSED = "proposed";

    private final PatchRepository repository;
    private final IncidentService incidents;
    private final Clock clock;

    public PatchService(PatchRepository repository, IncidentService incidents, Clock clock) {
        this.repository = repository;
        this.incidents = incidents;
        this.clock = clock;
    }

    /**
     * Propose one patch against one incident.
     *
     * @return the stored row, so the 201 answers with exactly what was written
     */
    @Transactional
    public IncidentPatch open(String incidentId, String title, String summary, String diff, String author) {
        incidents.read(incidentId);
        String cleanTitle = requireTitle(title);
        String cleanSummary = optionalBounded(summary, MAX_SUMMARY, "summary");
        String bytes = requireDiff(diff);
        String cleanAuthor = optionalBounded(author, MAX_ACTOR, "author");
        IncidentPatch row = new IncidentPatch(
                UUID.randomUUID().toString(),
                incidentId,
                cleanTitle,
                cleanSummary,
                bytes,
                cleanAuthor,
                PROPOSED,
                clock.instant().truncatedTo(ChronoUnit.MICROS));
        return repository.save(row);
    }

    /**
     * The incident's proposals, newest first.
     *
     * <p>The parent is read first so an unknown incident is 404 {@code unknown-incident} rather than an
     * empty window: "this incident has no patches" and "there is no such incident" are different answers,
     * and an empty list would erase the difference.
     */
    @Transactional(readOnly = true)
    public List<IncidentPatch> list(String incidentId, int limit, int offset) {
        incidents.read(incidentId);
        int effective = effectiveLimit(limit);
        PageRequest window = PageRequest.of(appliedOffset(offset, effective) / effective, effective);
        return repository.findByIncidentIdOrderByCreatedAtDescPatchIdDesc(incidentId, window);
    }

    /** How many patches that incident holds in total — the number the window cannot answer. */
    @Transactional(readOnly = true)
    public long count(String incidentId) {
        incidents.read(incidentId);
        return repository.countByIncidentId(incidentId);
    }

    /** One patch by id, bytes included. An id that names nothing is {@link NoSuchPatch}. */
    @Transactional(readOnly = true)
    public IncidentPatch read(String patchId) {
        String id = requireId(patchId);
        return repository.findById(id)
                .orElseThrow(() -> new NoSuchPatch("patch \"" + id + "\" does not exist"));
    }

    private static String requireTitle(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidPatch("a patch needs a title — the one line that says what it proposes");
        }
        String trimmed = raw.trim();
        if (trimmed.length() > MAX_TITLE) {
            throw new InvalidPatch("the patch title is at most " + MAX_TITLE
                    + " characters — this one is " + trimmed.length());
        }
        return trimmed;
    }

    /**
     * The diff, EXACTLY as sent. Whitespace is part of the format: leading spaces are context lines and a
     * trailing newline is the last line's end, so trimming would edit the bytes the author vouched for.
     * Only a diff with no non-whitespace character at all is refused, and only a diff longer than the
     * column is refused — never cut.
     */
    static String requireDiff(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidPatch("a patch needs bytes — a diff that is only whitespace proposes nothing");
        }
        if (raw.length() > MAX_DIFF) {
            throw new InvalidPatch("the patch diff is at most " + MAX_DIFF
                    + " characters — this one is " + raw.length() + "; a longer change is refused rather than cut");
        }
        return raw;
    }

    /** An optional word: trimmed, blank becomes null, and its column width is refused rather than cut. */
    static String optionalBounded(String raw, int max, String field) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.length() > max) {
            throw new InvalidPatch("the patch " + field + " is at most " + max
                    + " characters — this one is " + trimmed.length());
        }
        return trimmed;
    }

    /** An id is a value, not a spelling: no trimming, no case folding. */
    static String requireId(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidPatch("a patch id is required");
        }
        return raw;
    }
}
