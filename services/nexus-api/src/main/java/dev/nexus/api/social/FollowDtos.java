package dev.nexus.api.social;

import java.util.List;

/**
 * M7 v287 — the wire shapes for FOLLOWS.
 *
 * <p>The follow itself is the client's own declared shape, field for field: {@code followerId},
 * {@code followeeId} and {@code createdAt} in epoch MILLISECONDS. The service sends the assurance
 * beside the follower as well — the same rule the like, the comment and the audit trail follow: the
 * assurance travels with the actor so a reader is TOLD what the follow is worth instead of having to
 * infer it from the presence of a name.
 */
public final class FollowDtos {

    private FollowDtos() {
    }

    /**
     * WHO is following.
     *
     * <p>The shape is deliberately the one the Studio’s own {@code ownerClaim} produces, so the same
     * claim-building code can be used for every social verb. {@code claimedAt} is MILLISECONDS since the
     * epoch, for the reason v263 recorded.
     */
    public record FollowClaim(String accountId, String handle, String assurance, Long claimedAt) {
    }

    /** A follow request: which account, and who is doing the following. */
    public record FollowRequest(String accountId, FollowClaim claim) {
    }

    /**
     * One follow. The client’s own {@code Follow} shape, plus the assurance the service knows.
     */
    public record Follow(
            String followerId,
            String followeeId,
            long createdAt,
            String handle,
            String assurance) {
    }

    /**
     * The answer to a follow question.
     *
     * <p>{@code following} is whether THIS account follows the one named — a fact about the VIEWER, not
     * about the followee. {@code followerCount} and {@code followingCount} are asked for, never
     * incremented, so a lost update cannot inflate either.
     */
    public record FollowAnswer(
            String accountId,
            boolean following,
            long followerCount,
            long followingCount,
            List<Follow> followers) {
    }

    /**
     * v303 — the OTHER direction of the edge: the accounts an account follows.
     *
     * <p>The rows are called {@code following} and not {@code followers}, because a list of the accounts
     * somebody watches is not a list of their followers, and a wire field with the wrong name is a small lie
     * that grows.
     */
    /**
     * v390 — and {@code limit} is the cap the service applied, the same field the filed read's answer
     * carries (v382): the client can say what it asked for and what it got, and a pager needs to know
     * the window's size to say which rows it is showing.
     */
    public record FollowingAnswer(String accountId, long followingCount, List<Follow> following, int limit) {
    }

    /**
     * v397 — the answer to WHO FOLLOWS an account, as a WINDOW beside the whole-table count.
     *
     * <p>{@code limit} is the cap the service applied and {@code offset} is the ROW this window starts
     * at — the same two numbers the following direction's answer carries (v390) and the plans answer
     * carries (v392). The answer names the window it is FOR, so a pager can say which followers it is
     * showing and offer the next page as a link instead of guessing from a URL it half remembers.
     *
     * <p>It is a SEPARATE record from {@link FollowAnswer} because a WRITE's answer is not a window at
     * all: the followers a follow carries are the edge it just made, and calling that a window of the
     * follower table would be a small lie that grows. A read and a write are different questions.
     */
    public record FollowersAnswer(
            String accountId,
            boolean following,
            long followerCount,
            long followingCount,
            List<Follow> followers,
            int limit,
            int offset) {
    }
}
