package dev.nexus.api.social;

import java.util.List;

/**
 * M7 v285 — the wire shapes for COMMENTS.
 *
 * <p>The comment itself is the client's own declared shape, field for field: {@code id},
 * {@code accountId}, {@code projectId}, {@code body}, {@code createdAt} (epoch MILLISECONDS) and
 * {@code deleted}. The service sends the handle and the assurance as well \u2014 the same rule the like and
 * the audit trail follow: the assurance travels with the author so a reader is TOLD what the comment is
 * worth instead of having to infer it from the presence of a name. Extra fields do not break a client
 * that declares fewer.
 */
public final class CommentDtos {

    private CommentDtos() {
    }

    /**
     * WHO is commenting.
     *
     * <p>The shape is deliberately the one the Studio\u2019s own {@code ownerClaim} produces, so the same
     * claim-building code can be used for both. {@code claimedAt} is MILLISECONDS since the epoch, for
     * the reason v263 recorded: Jackson reads a bare JSON number as epoch SECONDS by default, and a
     * claim 53817 years in the future is what that mistake looks like.
     */
    public record CommentClaim(String accountId, String handle, String assurance, Long claimedAt) {
    }

    /** A comment request: which publication, who is saying it, and what they said. */
    public record CommentRequest(String projectId, CommentClaim claim, String body) {
    }

    /**
     * One comment. The client\u2019s own {@code Comment} shape, plus the two fields the service knows.
     */
    public record Comment(
            String id,
            String accountId,
            String projectId,
            String body,
            long createdAt,
            boolean deleted,
            String handle,
            String assurance) {
    }

    /**
     * The answer to a comment question.
     *
     * <p>{@code visible} is how many of the returned comments are NOT deleted \u2014 stated beside the list,
     * because a list of ten of which four were removed must not be read as \u201cthere are ten comments\u201d.
     */
    public record CommentAnswer(String projectId, List<Comment> comments, long visible, int limit) {
    }
}
