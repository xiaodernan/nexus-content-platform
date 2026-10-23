package dev.nexus.api.social;

import java.util.List;

/**
 * M7 v283 — the wire shapes for LIKES.
 *
 * <p>The like itself is the client's own declared shape, field for field: {@code accountId},
 * {@code projectId}, and {@code createdAt} in epoch MILLISECONDS. The client says nothing about a handle
 * or an assurance, and the service sends both anyway — the same rule the audit trail follows: the
 * assurance travels with the actor so a reader is TOLD what the like is worth instead of having to infer
 * it from the presence of a name. Extra fields do not break a client that declares fewer.
 */
public final class LikeDtos {

    private LikeDtos() {
    }

    /**
     * WHO is liking.
     *
     * <p>The shape is deliberately the one the Studio's own {@code ownerClaim} produces, so the same
     * claim-building code can be used for both, and so a service-side check is the only thing that can
     * ever widen {@code assurance}. {@code claimedAt} is MILLISECONDS since the epoch, because that is
     * what the client's own claim carries — Jackson reads a bare JSON number as epoch SECONDS by default,
     * and the v263 incident (a claim 53817 years in the future) is the reason that unit is stated here
     * rather than assumed.
     */
    public record LikeClaim(String accountId, String handle, String assurance, Long claimedAt) {
    }

    /** A like request: which publication, and who is doing it. */
    public record LikeRequest(String projectId, LikeClaim claim) {
    }

    /**
     * One like. The client's own {@code Like} shape, plus the two fields the service knows and the
     * client does not need.
     */
    public record Like(String accountId, String projectId, long createdAt, String handle, String assurance) {
    }

    /**
     * The answer to every like question.
     *
     * <p>{@code liked} is whether THIS account's like is among them — it is the one field that depends on
     * who is asking, and it is a field about the VIEWER, not about the publication. {@code count} is how
     * many accounts liked it. {@code likes} is the list itself, newest first, capped.
     */
    public record LikeAnswer(
            String projectId,
            boolean liked,
            long count,
            List<Like> likes) {
    }

    /**
     * v400 — the answer to “who liked this”, as a WINDOW beside the whole count.
     *
     * <p>{@code limit} is the cap the service applied, {@code offset} is the ROW this window starts at and
     * {@code count} is how many accounts liked the publication. The three together are what a pager needs:
     * which rows it is showing, how big a window is, and where the end is. A like is never taken back out
     * of the count (an un-like DELETES its row), so the count IS the row count here — unlike the comment
     * thread’s answer (v399), which had to carry a separate total because removed comments keep their rows.
     *
     * <p>It is a SEPARATE record from {@link LikeAnswer} because the WRITE answers (a like, an un-like)
     * are not windows: putting the window’s fields on their answer would name a window that was never
     * asked for.
     */
    public record LikesAnswer(
            String projectId,
            boolean liked,
            long count,
            List<Like> likes,
            int limit,
            int offset) {
    }
}
