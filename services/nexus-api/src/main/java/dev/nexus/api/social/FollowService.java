package dev.nexus.api.social;

import dev.nexus.api.social.FollowDtos.FollowClaim;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * M7 v287 \u2014 FOLLOWS, as four rules.
 *
 * <p>A follow is the one social act here that is about a PERSON rather than a thing, and that is where
 * its rules come from: the two ends of the edge are different, and the service is careful about which is
 * which.
 *
 * <ol>
 *   <li><b>A follow needs an ACCOUNT.</b> The follower is the account the claim names; a follow with no
 *       follower has no edge to draw. The service refuses such a follow BY NAME.
 *   <li><b>An account cannot follow ITSELF.</b> A self-follow is not a relation \u2014 it is a no-op dressed as
 *       one \u2014 and it would put one account in its own follower count. The service refuses it by name,
 *       rather than counting a relation that does not exist.
 *   <li><b>Following twice is following once.</b> The second follow finds the edge the first one wrote
 *       and answers with it; the counts do not move. The UNIQUE constraint on (follower, followee) is
 *       what makes that the database's rule and not the service's hope.
 *   <li><b>Only the follower can take the edge back.</b> Somebody else\u2019s un-follow is REFUSED, and an
 *       edge that is already gone is \u201calready gone\u201d rather than a failure.
 * </ol>
 *
 * <p><b>What this service does NOT do, stated rather than implied:</b> it does not check that either
 * account EXISTS, because the service holds no account table (an account exists in it only as far as
 * publications NAME it). A follow of an account id nobody has ever published is a follow the service
 * records faithfully, and the PROFILE page \u2014 the place where a reader would learn the truth \u2014 is the
 * place that can say it. It does not verify the account either: the assurance travels with the claim
 * (ADR 0018).
 *
 * <p>{@link Clock} is injected rather than calling {@code Instant.now()} inline, so a test can pin the
 * instant it follows at.
 */
@Service
public class FollowService {

    /** Long enough for a real account id, short enough that it cannot be used to fill the table with one row. */
    static final int MAX_ACCOUNT_ID_LENGTH = 200;

    /** The most follows one answer may carry. The cap is CLAMPED rather than refused, like every cap here. */
    public static final int MAX_FOLLOW_LIMIT = 100;

    /** How many follows an answer carries when the caller names no limit. */
    public static final int DEFAULT_FOLLOW_LIMIT = 20;

    private final FollowRepository repository;
    private final Clock clock;

    public FollowService(FollowRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    /**
     * The answer to a follow question.
     *
     * <p>{@code following} is whether THIS account follows the one named \u2014 a fact about the VIEWER, not
     * about the followee. {@code followerCount} is how many accounts follow the followee, and
     * {@code followingCount} is how many the followee follows. Both are asked for, never incremented, so
     * a lost update cannot inflate either.
     */
    public record FollowResult(
            String accountId,
            boolean following,
            long followerCount,
            long followingCount,
            List<FollowEntry> followers) {
    }

    /**
     * FOLLOW an account.
     *
     * <p>The answer carries the counts AFTER the follow, so a caller never has to add one itself and get
     * it wrong. A second follow from the same account answers {@code following = true} with the SAME
     * counts \u2014 the difference between \u201cyou follow them\u201d and \u201cyou follow them AGAIN\u201d is exactly the
     * difference between a count and a lie.
     */
    @Transactional
    public FollowResult follow(String followeeAccountId, FollowClaim claim) {
        String follower = requireAccount(claim == null ? null : claim.accountId(), "a follow needs an account");
        String followee = requireAccount(followeeAccountId, "a follow needs an account to follow");
        if (follower.equals(followee)) {
            throw new InvalidFollow("an account cannot follow itself: that is not a relation, it is a no-op");
        }
        Optional<FollowEntry> existing = repository.findByFollowerAccountIdAndFolloweeAccountId(follower, followee);
        if (existing.isPresent()) {
            return result(followee, follower, true, List.of(existing.get()));
        }
        Instant when = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        FollowEntry row = new FollowEntry(
                follower,
                claim == null ? null : claim.handle(),
                claim == null ? null : claim.assurance(),
                followee,
                when);
        FollowEntry saved = repository.save(row);
        return result(followee, follower, true, List.of(saved));
    }

    /**
     * TAKE the edge back \u2014 and only the follower\u2019s own.
     *
     * <p>Somebody else\u2019s un-follow is REFUSED, because a caller that asked to remove something and was
     * told \u201cfine\u201d would believe the edge is gone. And an edge that is already gone is \u201calready gone\u201d,
     * not a failure.
     */
    @Transactional
    public FollowResult unfollow(String followeeAccountId, FollowClaim claim) {
        String follower = requireAccount(claim == null ? null : claim.accountId(), "a follow needs an account");
        String followee = requireAccount(followeeAccountId, "a follow needs an account to follow");
        Optional<FollowEntry> existing = repository.findByFollowerAccountIdAndFolloweeAccountId(follower, followee);
        if (existing.isEmpty()) {
            return result(followee, follower, false, List.of());
        }
        repository.delete(existing.get());
        return result(followee, follower, false, List.of());
    }

    /**
     * v303 — the accounts an account FOLLOWS, newest first, and how many in all.
     *
     * <p>The other direction of the edge, and a DIFFERENT question from "who follows this one": the
     * repository has one finder per direction, because one query cannot answer both. The rows are called
     * `following` and not `followers` here, because a list of the accounts somebody watches is not a list
     * of their followers, and a wire field with the wrong name is a small lie that grows.
     */
    @Transactional(readOnly = true)
    public FollowingResult followingOf(String followerAccountId, int limit) {
        String follower = requireAccount(followerAccountId, "a follow needs an account");
        int asked = limit <= 0 ? DEFAULT_FOLLOW_LIMIT : Math.min(limit, MAX_FOLLOW_LIMIT);
        List<FollowEntry> rows = repository.findByFollowerAccountIdOrderByCreatedAtDesc(follower, PageRequest.of(0, asked));
        return new FollowingResult(follower, repository.countByFollowerAccountId(follower), rows);
    }

    /**
     * v303 — the service's own result for the OTHER direction of the edge.
     */
    public record FollowingResult(String accountId, long followingCount, List<FollowEntry> following) {
    }

    /**
     * WHO follows an account, and whether the VIEWER is among them.
     *
     * <p>{@code viewerAccountId} may be null: a reader who is nobody is a reader, and the counts do not
     * depend on who is asking.
     */
    @Transactional(readOnly = true)
    public FollowResult followersOf(String accountId, String viewerAccountId, int limit) {
        String followee = requireAccount(accountId, "a follow needs an account to follow");
        int asked = limit <= 0 ? DEFAULT_FOLLOW_LIMIT : Math.min(limit, MAX_FOLLOW_LIMIT);
        List<FollowEntry> followers = repository.findByFolloweeAccountIdOrderByCreatedAtDesc(followee, PageRequest.of(0, asked));
        boolean following = viewerAccountId != null
                && !viewerAccountId.isBlank()
                && repository.findByFollowerAccountIdAndFolloweeAccountId(viewerAccountId.trim(), followee).isPresent();
        return result(followee, viewerAccountId == null ? null : viewerAccountId.trim(), following, followers);
    }

    /** The counts and the rows, asked for \u2014 never incremented. */
    private FollowResult result(
            String followee, String follower, boolean following, List<FollowEntry> followers) {
        long followerCount = repository.countByFolloweeAccountId(followee);
        long followingCount = follower == null ? 0 : repository.countByFollowerAccountId(follower);
        return new FollowResult(followee, following, followerCount, followingCount, followers);
    }

    /** An account id must be usable: not blank, not absurdly long. */
    private static String requireAccount(String accountId, String because) {
        if (accountId == null || accountId.isBlank()) {
            throw new InvalidFollow(because);
        }
        String trimmed = accountId.trim();
        if (trimmed.length() > MAX_ACCOUNT_ID_LENGTH) {
            throw new InvalidFollow("accountId must be at most " + MAX_ACCOUNT_ID_LENGTH + " characters, got " + trimmed.length());
        }
        return trimmed;
    }
}
