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

    /** The trail, newest first, capped. */
    @Transactional(readOnly = true)
    public List<AuditEntry> list(int limit) {
        int effective = Math.min(Math.max(limit, 1), MAX_LIST_LIMIT);
        return repository.findAllByOrderByOccurredAtDesc(PageRequest.of(0, effective));
    }
}
