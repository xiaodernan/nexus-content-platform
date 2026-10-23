package dev.nexus.api.ops;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * v271 — the AUDIT TRAIL: what happened to the publications, in order.
 *
 * <p>This is M9's first server-side half. The ROADMAP has carried "observability" as a planned milestone
 * since M6, and an audit trail is the piece of it that needs no agent, no incident and no patch: a record of
 * what each publication verb did, in the order it did it.
 *
 * <p>Two rules, both stated rather than assumed:
 *
 * <ul>
 *   <li>Only SUCCESSFUL mutations are recorded. A refused take-down throws before anything is written, and
 *       the refusal is already in the response the caller received. This trail says what happened, not what
 *       was attempted.
 *   <li>An entry with no actor is a real entry, not a missing one. An anonymous publish names nobody, and the
 *       trail says so rather than inventing an actor.
 * </ul>
 *
 * <p>The write JOINS the caller's transaction (the default propagation, not {@code REQUIRES_NEW}), and that
 * is the choice that makes the first rule true: an entry written in its own transaction would SURVIVE a
 * publish that was rolled back afterwards, and the trail would then record a publication that never happened.
 * A trail that says what happened must not say it about a thing that did not.
 */
@Service
public class AuditService {

    /** The most a caller may ask for. An audit trail only grows, so an uncapped listing would grow with it. */
    public static final int MAX_LIST_LIMIT = 100;

    /** The default number of entries a listing answers with. */
    public static final int DEFAULT_LIST_LIMIT = 20;

    /**
     * v384 — the kinds of thing an entry can happen to. A CLOSED SET of three, because a reader must be
     * able to count by kind and a caller must not be able to invent a fourth.
     */
    public static final String TARGET_ACCOUNT = "account";

    /** @see #TARGET_ACCOUNT */
    public static final String TARGET_PLAN = "plan";

    /** @see #TARGET_ACCOUNT */
    public static final String TARGET_PUBLICATION = "publication";

    // ── v385: the verbs this build RECORDS, as a closed set ──────────────────────────────────────────
    // The filter asks the trail in the trail's own language, and the language is a CLOSED SET for the
    // same reason the desk's reasons are (v326): a caller that asked for a verb this service has never
    // recorded, and was answered with an empty window, would read the answer as "nothing of that action
    // ever happened" — which is a different fact from "this service does not know that verb", and the
    // one that matters when the trail is the only witness.
    //
    // A verb joins this set in the SAME commit that records it. The set is the service's vocabulary;
    // a vocabulary that grew silently would be a filter that lied quietly.
    public static final String ACTION_PUBLISH = "publish";
    public static final String ACTION_UNPUBLISH = "unpublish";
    public static final String ACTION_LIKE = "like";
    public static final String ACTION_UNLIKE = "unlike";
    public static final String ACTION_COMMENT = "comment";
    public static final String ACTION_UNCOMMENT = "uncomment";
    public static final String ACTION_REPORT = "report";
    public static final String ACTION_WITHDRAW_REPORT = "withdraw-report";
    public static final String ACTION_ACKNOWLEDGE = "acknowledge";

    /** Every verb this build records, in the order a reader meets them. */
    public static final List<String> ACTIONS =
            List.of(ACTION_PUBLISH, ACTION_UNPUBLISH, ACTION_LIKE, ACTION_UNLIKE, ACTION_COMMENT,
                    ACTION_UNCOMMENT, ACTION_REPORT, ACTION_WITHDRAW_REPORT, ACTION_ACKNOWLEDGE);

    private final AuditEntryRepository repository;
    private final Clock clock;

    public AuditService(AuditEntryRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    /**
     * Record that something happened.
     *
     * @param action what happened — {@code publish}, {@code unpublish}, {@code report}, …
     * @param actorAccountId the account that did it, or null when nobody was named
     * @param actorHandle the handle a claim carried, or null
     * @param actorAssurance the assurance a claim carried, or null
     * @param targetId the id of the thing it happened to
     * @param targetType what KIND of thing that id names — one of {@link #TARGET_ACCOUNT},
     *     {@link #TARGET_PLAN}, {@link #TARGET_PUBLICATION}; a refusal names the three rather than
     *     guessing, because a caller that is told only "no" has to guess
     */
    @Transactional
    public void record(
            String action,
            String actorAccountId,
            String actorHandle,
            String actorAssurance,
            String targetId,
            String targetType) {
        if (action == null || action.isBlank()) {
            throw new IllegalArgumentException("an audit entry must name what happened");
        }
        if (targetId == null || targetId.isBlank()) {
            throw new IllegalArgumentException("an audit entry must name what it happened to");
        }
        String kind = requireTargetType(targetType);
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        repository.save(new AuditEntry(action, actorAccountId, actorHandle, actorAssurance, targetId, kind, now));
    }

    /**
     * v384 — the target's kind, or a refusal that names the three.
     *
     * <p>The kind is a fact the CALLER knows — it acted on an account, a plan or a publication — so it is
     * declared and validated here rather than sniffed back out of the id's spelling: a prefix rule would
     * misread a plan a creator happened to name "account-of-a-friend", and a trail that classified by
     * spelling would be a trail that was wrong quietly.
     */
    private static String requireTargetType(String targetType) {
        if (targetType == null || targetType.isBlank()) {
            throw new IllegalArgumentException(
                    "an audit entry must name what kind of thing it happened to: " + TARGET_ACCOUNT + ", "
                            + TARGET_PLAN + " or " + TARGET_PUBLICATION);
        }
        String trimmed = targetType.trim();
        switch (trimmed) {
            case TARGET_ACCOUNT:
            case TARGET_PLAN:
            case TARGET_PUBLICATION:
                return trimmed;
            default:
                throw new IllegalArgumentException(
                        "an audit entry's target is an " + TARGET_ACCOUNT + ", a " + TARGET_PLAN + " or a "
                                + TARGET_PUBLICATION + " — not \"" + trimmed + "\"");
        }
    }

    /**
     * v385 — the action a listing is narrowed to, or null for the whole trail.
     *
     * <p>The verbs are a CLOSED SET (this build's own), and one outside it is REFUSED BY NAME with the
     * set named in the refusal: a caller that asked for a verb this service has never recorded, and was
     * answered with an empty window, would read the answer as "nothing of that action ever happened" —
     * a different fact from "this service does not know that verb", and the one that matters when the
     * trail is the only witness. The desk's reasons are refused the same way (v326), and for the same
     * reason: an answer to a question the caller did not ask is worse than a refusal.
     */
    private static String requireAction(String action) {
        if (action == null || action.isBlank()) {
            return null;
        }
        String trimmed = action.trim();
        if (ACTIONS.contains(trimmed)) {
            return trimmed;
        }
        throw new IllegalArgumentException("a trail can be narrowed to one of " + String.join(", ", ACTIONS)
                + " — not \"" + trimmed + "\"");
    }

    /**
     * The trail, newest first, capped — narrowed to ONE action when one is named, and PAGED past the
     * newest rows when an offset is named.
     *
     * <p>v385 — the narrowing happens IN THE QUERY, not in the browser: the window is "the newest N
     * entries OF THAT ACTION", which is a different set from "the newest N entries that happen to be of
     * that action" once the trail outgrows the cap. The panel used to filter what it had already read
     * (v281), which was honest about the window it held and silent about everything past the cap; the
     * service now answers the question that was actually asked.
     *
     * <p>v388 — and the window can be PAGED: the trail is the one table that only grows, so a reader who
     * wants last month's entries has to be able to ask for them. The offset is ROWS, the same meaning the
     * filed read's offset has (v387) — and the same translation into the pages Spring Data speaks,
     * because handing a row count to {@code PageRequest.of} answers with the rows twenty windows further
     * on and calls them "past the end".
     */
    @Transactional(readOnly = true)
    public List<AuditEntry> list(int limit, int offset, String action) {
        int effective = Math.min(Math.max(limit, 1), MAX_LIST_LIMIT);
        int from = Math.max(offset, 0);
        String wanted = requireAction(action);
        PageRequest window = PageRequest.of(from / effective, effective);
        return wanted == null
                ? repository.findAllByOrderByOccurredAtDesc(window)
                : repository.findByActionOrderByOccurredAtDesc(wanted, window);
    }

    /**
     * v385 — how many entries the WHOLE trail holds, narrowed or not.
     *
     * <p>The panel states it beside the window it is showing, and that is what keeps a filter honest:
     * with the narrowing in the service, the browser never sees the rows the filter excluded, so the one
     * number that can still say "the filter is hiding something" has to come from the service too. The
     * desk's tally door (v312) is the same idea for the same reason.
     */
    @Transactional(readOnly = true)
    public long count() {
        return repository.count();
    }
}
