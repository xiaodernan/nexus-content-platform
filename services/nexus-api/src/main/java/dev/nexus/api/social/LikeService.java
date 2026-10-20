package dev.nexus.api.social;

import dev.nexus.api.ops.AuditService;
import dev.nexus.api.social.LikeDtos.LikeClaim;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * M7 v283 — LIKES, as three rules.
 *
 * <p>A like is the smallest social act there is, and the smallest acts are the easiest to get wrong: a
 * counter that drifts, a like that lands twice, a like that any stranger can take back. The three rules
 * below exist because the alternative would let the service record something it cannot stand behind:
 *
 * <ol>
 *   <li><b>A like needs an ACCOUNT.</b> An anonymous like cannot be de-duplicated: two likes from one
 *       device and two likes from two devices are the same row as far as the service can tell, so the
 *       count would be a number nobody could defend. The service refuses such a like BY NAME rather
 *       than counting something it cannot count honestly.
 *   <li><b>Liking twice is liking once.</b> The second like from the same account finds the row the
 *       first one wrote and answers with it. The count does not grow, and the caller is told the like
 *       was already there — a like that silently doubled a count would make the count a lie.
 *   <li><b>Only the account that liked can take the like back.</b> Somebody else's un-like is REFUSED
 *       (403), not silently ignored: a caller that asked to remove something and got "fine" back would
 *       believe the like is gone. And there is no 404 — the URL names a pair, not a resource that must
 *       exist, so a like that is already gone is "already gone", the same rule the publication's
 *       take-down follows.
 * </ol>
 *
 * <p><b>What this service does NOT do, stated rather than implied:</b> it does not check that the
 * publication exists, and it does not verify the account. Both are the same posture the publish service
 * takes (it records a claim and verifies nothing — ADR 0018), and both are bounds rather than bugs: the
 * service records <em>that a like happened</em>, and a like of a project id that was never published is
 * still a like that happened.
 *
 * <p>{@link Clock} is injected rather than calling {@code Instant.now()} inline, so a test can pin the
 * instant it likes at — the same discipline the rest of this repo uses for anything time-shaped.
 */
@Service
public class LikeService {

    /** Long enough for a real project id, short enough that it cannot be used to fill the table with one row. */
    static final int MAX_PROJECT_ID_LENGTH = 200;

    /** Long enough for a real account id, short enough that it cannot be used to fill the table with one row. */
    static final int MAX_ACCOUNT_ID_LENGTH = 200;

    /** The most likes one answer may carry. The cap is CLAMPED rather than refused, for the same reason the
     *  publication listing's is: "as many as you will give me" is a legitimate thing to mean. */
    public static final int MAX_LIKE_LIMIT = 100;

    /** How many likes an answer carries when the caller names no limit. */
    public static final int DEFAULT_LIKE_LIMIT = 20;

    private final LikeRepository repository;
    private final Clock clock;
    /** v289 — the TRAIL. The like is something that happened to a publication, so it is written down. */
    private final AuditService audit;

    public LikeService(LikeRepository repository, Clock clock, AuditService audit) {
        this.repository = repository;
        this.clock = clock;
        this.audit = audit;
    }

    /**
     * The account that liked, and when — the shape the client's own community model declares.
     *
     * @param liked whether THIS account's like is among them
     * @param count how many accounts liked the publication
     * @param likes the likes themselves, newest first
     */
    public record LikeResult(String projectId, boolean liked, long count, List<LikeEntry> likes) {
    }

    /**
     * LIKE a publication.
     *
     * <p>The answer carries the count AFTER the like, so a caller never has to add one itself and get it
     * wrong. A second like from the same account answers {@code liked = true} with the SAME count it
     * would have had before — the difference between "you liked it" and "you liked it AGAIN" is exactly
     * the difference between a count and a lie.
     */
    @Transactional
    public LikeResult like(String targetProjectId, LikeClaim claim) {
        String target = requireUsableProjectId(targetProjectId);
        String account = requireAccount(claim);
        Optional<LikeEntry> existing =
                repository.findByTargetProjectIdAndActorAccountId(target, account);
        if (existing.isPresent()) {
            // Rule 2: liking twice is liking once. The count is asked for, not incremented.
            return new LikeResult(target, true, repository.countByTargetProjectId(target), List.of(existing.get()));
        }
        Instant when = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        LikeEntry row = new LikeEntry(
                target,
                account,
                claim == null ? null : claim.handle(),
                claim == null ? null : claim.assurance(),
                when);
        LikeEntry saved = repository.save(row);
        // v289 — the trail, INSIDE this transaction: a rolled-back like leaves no entry claiming a like
        // happened. And only for a like that was NEW — a second like changes nothing, and a trail that
        // recorded it would be recording an attempt rather than a fact.
        audit.record("like", account, claim == null ? null : claim.handle(), claim == null ? null : claim.assurance(), target);
        return new LikeResult(target, true, repository.countByTargetProjectId(target), List.of(saved));
    }

    /**
     * TAKE BACK a like — and only the caller's own.
     *
     * <p>The answer is {@code removed = false} when there was nothing to remove (a like that is already
     * gone is not a failure), and a REFUSAL when the like belongs to somebody else: a caller that asked
     * to remove something and was told "fine" would believe the like is gone.
     */
    @Transactional
    public LikeResult unlike(String targetProjectId, LikeClaim claim) {
        String target = requireUsableProjectId(targetProjectId);
        String account = requireAccount(claim);
        Optional<LikeEntry> existing =
                repository.findByTargetProjectIdAndActorAccountId(target, account);
        if (existing.isEmpty()) {
            return new LikeResult(target, false, repository.countByTargetProjectId(target), List.of());
        }
        repository.delete(existing.get());
        // v289 — the trail says the like was taken back, because that is something that happened too.
        audit.record("unlike", account, claim == null ? null : claim.handle(), claim == null ? null : claim.assurance(), target);
        return new LikeResult(target, false, repository.countByTargetProjectId(target), List.of());
    }

    /**
     * The likes of one publication, and whether THIS account is among them.
     *
     * <p>{@code viewerAccountId} may be null — a reader who is nobody is a reader, and the answer is
     * still true: the count does not depend on who is asking.
     */
    @Transactional(readOnly = true)
    public LikeResult likesOf(String targetProjectId, String viewerAccountId, int limit) {
        String target = requireUsableProjectId(targetProjectId);
        int asked = limit <= 0 ? DEFAULT_LIKE_LIMIT : Math.min(limit, MAX_LIKE_LIMIT);
        List<LikeEntry> likes = repository.findByTargetProjectIdOrderByCreatedAtDesc(target, PageRequest.of(0, asked));
        long count = repository.countByTargetProjectId(target);
        boolean liked = viewerAccountId != null
                && !viewerAccountId.isBlank()
                && repository.findByTargetProjectIdAndActorAccountId(target, viewerAccountId).isPresent();
        return new LikeResult(target, liked, count, likes);
    }

    /** A project id must be a usable path segment: not blank, not absurdly long. */
    private static String requireUsableProjectId(String projectId) {
        if (projectId == null || projectId.isBlank()) {
            throw new InvalidLike("projectId must not be blank");
        }
        String trimmed = projectId.trim();
        if (trimmed.length() > MAX_PROJECT_ID_LENGTH) {
            throw new InvalidLike("projectId must be at most " + MAX_PROJECT_ID_LENGTH + " characters, got " + trimmed.length());
        }
        return trimmed;
    }

    /**
     * Rule 1: a like needs an account.
     *
     * <p>The refusal is BY NAME, because the reason matters to the caller: an anonymous like is not
     * forbidden because it is untrusted, it is refused because it cannot be counted honestly.
     */
    private static String requireAccount(LikeClaim claim) {
        if (claim == null) {
            throw new InvalidLike("a like needs an account: the service cannot tell one anonymous like from the same one twice");
        }
        String account = claim.accountId();
        if (account == null || account.isBlank()) {
            throw new InvalidLike("a like needs an account: the service cannot tell one anonymous like from the same one twice");
        }
        String trimmed = account.trim();
        if (trimmed.length() > MAX_ACCOUNT_ID_LENGTH) {
            throw new InvalidLike("accountId must be at most " + MAX_ACCOUNT_ID_LENGTH + " characters, got " + trimmed.length());
        }
        return trimmed;
    }
}
