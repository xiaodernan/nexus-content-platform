package com.nexus.domain.community;

import com.nexus.domain.UnimplementedOperation;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Community domain service — likes, comments, follows, remixes, saves.
 *
 * <p><b>This service does not own these writes yet, and it says so instead of pretending.</b> Every
 * method below used to be a <b>silent no-op</b>:
 *
 * <pre>{@code
 * public void likeProject(String projectId, String userId) { }   // success; nothing was liked
 * public void unlikeProject(String projectId, String userId) { }
 * public void addComment(String projectId, String userId, String content) { }
 * public void followUser(String followerId, String followingId) { }
 * public void unfollowUser(String followerId, String followingId) { }
 * }</pre>
 *
 * <p>A void method that does nothing is the most dangerous shape a fake can take: the caller
 * receives SUCCESS. A caller that believes a like was recorded has a like count it cannot explain,
 * and the row it would have to look at does not exist.
 *
 * <p>These writes are NOT unimplemented in the platform — they are implemented somewhere else. The
 * {@code nexus-api} service carries a real social surface with real tests ({@code LikeService},
 * {@code CommentService}, {@code FollowService}, {@code ReportService}, {@code SubscriptionService}
 * and {@code TipService} — 901 passing cases across the service). This service is the SECOND
 * candidate for the same writes, and having both would create two answers to one question.
 *
 * <p>So each method refuses with {@link UnimplementedOperation}, which names the operation and the
 * boundary. Until this service owns these writes — or the decision is taken that it never will —
 * it says so instead of reporting a success that did not happen.
 *
 * @see com.nexus.domain.UnimplementedOperation
 */
@Service
@Transactional(readOnly = true)
public class CommunityService {

    private static final String OWNERSHIP =
            "the social writes are implemented in nexus-api's social surface (like / comment / follow), "
                    + "which carries the real tables and the real rules; this service does not own them, "
                    + "so it will not report a success that did not happen";

    /**
     * Like a published project.
     *
     * @throws UnimplementedOperation always — a silent no-op would report a like that was never
     *     recorded.
     */
    @Transactional
    public void likeProject(String projectId, String userId) {
        throw new UnimplementedOperation("community.likeProject", OWNERSHIP);
    }

    /**
     * Unlike a published project.
     *
     * @throws UnimplementedOperation always.
     */
    @Transactional
    public void unlikeProject(String projectId, String userId) {
        throw new UnimplementedOperation("community.unlikeProject", OWNERSHIP);
    }

    /**
     * Add a comment to a published project.
     *
     * @throws UnimplementedOperation always.
     */
    @Transactional
    public void addComment(String projectId, String userId, String content) {
        throw new UnimplementedOperation("community.addComment", OWNERSHIP);
    }

    /**
     * Follow a user.
     *
     * @throws UnimplementedOperation always.
     */
    @Transactional
    public void followUser(String followerId, String followingId) {
        throw new UnimplementedOperation("community.followUser", OWNERSHIP);
    }

    /**
     * Unfollow a user.
     *
     * @throws UnimplementedOperation always.
     */
    @Transactional
    public void unfollowUser(String followerId, String followingId) {
        throw new UnimplementedOperation("community.unfollowUser", OWNERSHIP);
    }
}
