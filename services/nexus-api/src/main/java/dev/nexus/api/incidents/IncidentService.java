package dev.nexus.api.incidents;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * M9 v594 — the first word of M9's chain: an incident is a RECORD with a life.
 *
 * <p>M9's row reads "observability, incident→patch→PR→approve→deploy". Until this slice the word
 * "incident" appeared in the milestone and nowhere in the code. This service builds the first word only:
 * a caller OPENS a record, anyone may READ it, and anyone may RESOLVE it. The rest of the chain — a patch,
 * a pull request, an approval, a deployment — is deliberately absent, and saying so is part of the design:
 * this service does not detect incidents, does not assign them, does not comment on them, and does not
 * transition them any way other than the one resolve below.
 *
 * <p>Four rules, each refused BY NAME rather than silently repaired:
 *
 * <ul>
 *   <li>The TITLE is the one required sentence: trimmed, 1..{@value #MAX_TITLE}. A blank title is not an
 *       incident, because a record nobody can read in a list is a row that exists only to be counted.
 *   <li>The SEVERITY is a CLAIM the opener makes, drawn from the fixed vocabulary {@link #SEVERITIES}. It
 *       is not computed from evidence and nothing in this service re-grades it. Case is not folded: an
 *       opening that says {@code High} is refused rather than reinterpreted, the same rule the journal's
 *       kind words follow.
 *   <li>A TARGET is a pair or nothing. A kind with no id names nothing a reader could look up; an id with
 *       no kind cannot be interpreted. The service stores the pair and never dereferences it.
 *   <li>The optional words (summary, target, opener, resolver) are trimmed and bounded by their columns.
 *       A blank optional word becomes NULL rather than an empty string, so "the caller said nothing" has
 *       one representation.
 * </ul>
 *
 * <p>No audit entry and no webhook delivery is written: this table IS the record of an incident's life, and
 * a second copy in the trail would be a second answer to the same question. The live proof reads zero and
 * zero after four opens and one resolve.
 */
@Service
public class IncidentService {

    /** The default number of incidents a listing answers with. */
    public static final int DEFAULT_LIST_LIMIT = 20;

    /** The most a caller may ask for. */
    public static final int MAX_LIST_LIMIT = 100;

    /** The title column's width, refused by number rather than truncated silently. */
    public static final int MAX_TITLE = 120;

    /** The summary column's width. */
    public static final int MAX_SUMMARY = 2000;

    /** The target-kind column's width. */
    public static final int MAX_TARGET_KIND = 40;

    /** The target-id column's width. */
    public static final int MAX_TARGET_ID = 200;

    /** The width of every human name this service stores (opener, resolver). */
    public static final int MAX_ACTOR = 120;

    /** The two statuses an incident can hold, and the two words this service writes for them. */
    public static final String OPEN = "open";

    public static final String RESOLVED = "resolved";

    /**
     * The severities an incident may claim, in increasing order. Exactly these four words, no case folding:
     * an opener that feels "High" and types {@code High} is told the vocabulary rather than quietly
     * normalized into a severity it did not name.
     */
    public static final List<String> SEVERITIES = List.of("low", "medium", "high", "critical");

    /** Every status an incident can hold. This service writes both; nothing else may. */
    public static final List<String> STATUSES = List.of(OPEN, RESOLVED);

    private final IncidentRepository repository;
    private final Clock clock;

    public IncidentService(IncidentRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    /**
     * Open one incident: status {@code open}, the service's own instant, and the words the caller gave —
     * trimmed, bounded, and refused by name when they break a rule.
     *
     * @return the stored row, so the 201 can answer with exactly what was written
     */
    @Transactional
    public Incident open(
            String title,
            String summary,
            String severity,
            String targetKind,
            String targetId,
            String openedBy) {
        String cleanTitle = requireTitle(title);
        String cleanSummary = optionalBounded(summary, MAX_SUMMARY, "summary");
        String cleanSeverity = requireSeverity(severity);
        String[] target = requireTarget(targetKind, targetId);
        String cleanOpenedBy = optionalActor(openedBy, "openedBy");
        Incident row = new Incident(
                UUID.randomUUID().toString(),
                cleanTitle,
                cleanSummary,
                cleanSeverity,
                target[0],
                target[1],
                OPEN,
                cleanOpenedBy,
                clock.instant().truncatedTo(ChronoUnit.MICROS));
        return repository.save(row);
    }

    /**
     * The window of incidents, newest first.
     *
     * <p>The filters are applied IN THE QUERY, not after the window is read: "the newest five critical
     * incidents" is a different set from "the newest five incidents, of which some are critical" once the
     * table outgrows the window. {@code null} means "no narrowing"; a blank or unknown word is refused
     * rather than answered with an empty window, because an empty answer would read as "there are none".
     */
    @Transactional(readOnly = true)
    public List<Incident> list(int limit, int offset, String status, String severity) {
        String wantedStatus = requireFilter(status, STATUSES, "status");
        String wantedSeverity = requireFilter(severity, SEVERITIES, "severity");
        int effective = effectiveLimit(limit);
        PageRequest window = PageRequest.of(appliedOffset(offset, effective) / effective, effective);
        if (wantedStatus != null && wantedSeverity != null) {
            return repository.findByStatusAndSeverityOrderByOpenedAtDescIncidentIdDesc(
                    wantedStatus, wantedSeverity, window);
        }
        if (wantedStatus != null) {
            return repository.findByStatusOrderByOpenedAtDescIncidentIdDesc(wantedStatus, window);
        }
        if (wantedSeverity != null) {
            return repository.findBySeverityOrderByOpenedAtDescIncidentIdDesc(wantedSeverity, window);
        }
        return repository.findAllByOrderByOpenedAtDescIncidentIdDesc(window);
    }

    /**
     * How many incidents the WHOLE table holds under the same narrowing — the number the window cannot
     * answer, because the excluded rows never left the database.
     */
    @Transactional(readOnly = true)
    public long count(String status, String severity) {
        String wantedStatus = requireFilter(status, STATUSES, "status");
        String wantedSeverity = requireFilter(severity, SEVERITIES, "severity");
        if (wantedStatus != null && wantedSeverity != null) {
            return repository.countByStatusAndSeverity(wantedStatus, wantedSeverity);
        }
        if (wantedStatus != null) {
            return repository.countByStatus(wantedStatus);
        }
        if (wantedSeverity != null) {
            return repository.countBySeverity(wantedSeverity);
        }
        return repository.count();
    }

    /** One incident by id. An id that names nothing is {@link NoSuchIncident}. */
    @Transactional(readOnly = true)
    public Incident read(String incidentId) {
        String id = requireId(incidentId);
        return repository.findById(id)
                .orElseThrow(() -> new NoSuchIncident("incident \"" + id + "\" does not exist"));
    }

    /**
     * Close one incident: the resolver (when given) and the service's instant, written together.
     *
     * <p>A second resolve is {@link AlreadyResolved} (409), not a silent overwrite: the first resolver is a
     * fact that already happened, and a later caller does not get to replace it. The transition is the
     * whole life of this record — there is no reopen, no escalation, no assignment.
     */
    @Transactional
    public Incident resolve(String incidentId, String resolvedBy) {
        Incident row = read(incidentId);
        if (RESOLVED.equals(row.getStatus())) {
            throw new AlreadyResolved("incident \"" + row.getIncidentId() + "\" is already resolved at "
                    + row.getResolvedAt() + " — a second resolve would overwrite the resolver who closed it");
        }
        row.resolve(optionalActor(resolvedBy, "resolvedBy"), clock.instant().truncatedTo(ChronoUnit.MICROS));
        return repository.save(row);
    }

    /**
     * The cap actually applied to a listing. Shared with the controller so the answer's {@code limit} is
     * the one the query used rather than a second computation that must agree by hand.
     */
    public static int effectiveLimit(int asked) {
        return Math.min(Math.max(asked, 1), MAX_LIST_LIMIT);
    }

    /**
     * The offset actually applied: a row count floored DOWN to the window that contains it, because Spring's
     * {@code PageRequest} can only skip a whole number of pages. The answer reports this value, so a caller
     * that asked for row 15 with a window of 10 is told the service read from row 10.
     */
    public static int appliedOffset(int askedOffset, int effectiveLimit) {
        int from = Math.max(askedOffset, 0);
        return (from / effectiveLimit) * effectiveLimit;
    }

    private static String requireTitle(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidIncident("an incident needs a title — the one sentence that says what happened");
        }
        String trimmed = raw.trim();
        if (trimmed.length() > MAX_TITLE) {
            throw new InvalidIncident("the title field is at most " + MAX_TITLE
                    + " characters — this one is " + trimmed.length());
        }
        return trimmed;
    }

    /** A severity the vocabulary does not hold is refused, and the message names all four words. */
    static String requireSeverity(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidIncident("an incident needs a severity — one of " + SEVERITIES);
        }
        String trimmed = raw.trim();
        if (!SEVERITIES.contains(trimmed)) {
            throw new InvalidIncident("severity \"" + trimmed + "\" is not a severity this service knows — "
                    + "one of " + SEVERITIES + " (exactly, with no case folding)");
        }
        return trimmed;
    }

    /**
     * The target pair, or a pair of nulls. Returns {@code [kind, id]}.
     *
     * <p>Exactly one half is refused: a kind names what a reader should look at, an id names which one, and
     * either without the other is a pointer a reader cannot follow. Both halves are trimmed and bounded,
     * and the blank form of each counts as absent — the same rule the optional summary follows.
     */
    static String[] requireTarget(String kind, String id) {
        String cleanKind = optionalBounded(kind, MAX_TARGET_KIND, "targetKind");
        String cleanId = optionalBounded(id, MAX_TARGET_ID, "targetId");
        if (cleanKind == null && cleanId == null) {
            return new String[] {null, null};
        }
        if (cleanKind == null) {
            throw new InvalidIncident("a target id without a target kind cannot be interpreted — "
                    + "name what kind of thing \"" + cleanId + "\" is");
        }
        if (cleanId == null) {
            throw new InvalidIncident("a target kind \"" + cleanKind + "\" without a target id names nothing — "
                    + "name the one thing this incident is about");
        }
        return new String[] {cleanKind, cleanId};
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
            throw new InvalidIncident("the " + field + " field is at most " + max
                    + " characters — this one is " + trimmed.length());
        }
        return trimmed;
    }

    /** A person's name this service stores: trimmed, blank becomes null, bounded by its column. */
    static String optionalActor(String raw, String field) {
        return optionalBounded(raw, MAX_ACTOR, field);
    }

    /** An id is a value, not a spelling: no trimming, no case folding. */
    static String requireId(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidIncident("an incident id is required");
        }
        return raw;
    }

    /**
     * A listing's filter: {@code null} means no narrowing, so a caller that said nothing gets everything.
     * A blank string is a typo, not an absence, and a word outside the vocabulary is a question this
     * service cannot answer honestly — both are refused by name, and neither is case-folded.
     */
    static String requireFilter(String raw, List<String> vocabulary, String field) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            throw new InvalidIncident("the " + field + " filter is blank — omit it to list everything, or name one of "
                    + vocabulary);
        }
        if (!vocabulary.contains(trimmed)) {
            throw new InvalidIncident(field + " \"" + trimmed + "\" is not a " + field
                    + " this service knows — one of " + vocabulary);
        }
        return trimmed;
    }
}
