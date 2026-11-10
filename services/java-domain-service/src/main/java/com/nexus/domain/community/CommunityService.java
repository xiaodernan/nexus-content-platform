package com.nexus.domain.community;

import com.nexus.domain.project.Project;
import com.nexus.domain.project.ProjectRepository;
import com.nexus.domain.user.UserRepository;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Community interactions for the JVM write path (SC-17). This replaces five TODO bodies with the two
 * actions that can be implemented without inventing a second policy: like and follow.
 *
 * <p>What is deliberately NOT here:
 * <ul>
 *   <li><b>Comments.</b> A comment has to pass the same redline word list the publish machine-check uses
 *       ({@code apps/web/src/server/domain/moderation.ts}). That list is not exported yet, so implementing
 *       comments here would mean either a second, weaker list or no check at all. Both are worse than not
 *       building it. The README says so instead of this class pretending.</li>
 *   <li><b>Block / mute writes.</b> Creating a block also tears down both follow edges and suppresses
 *       notifications on the web side; a second writer of just the row would leave the hole open. This
 *       service reads the relation and never changes it.</li>
 *   <li><b>Notifications.</b> The web layer emits them after a successful action. Two emitters would double
 *       every inbox row, so the JVM path stays silent and the README names that as a known limit.</li>
 * </ul>
 *
 * <p>Every rule that decides an outcome comes from {@link CommunityPolicy}, which reads the web layer's
 * export. The order of the checks is the web layer's order: reachability first (a version that is not public
 * does not exist for interaction purposes), then the block verdict, then the write. A blocked action writes
 * nothing — not even a row that a later request would have to undo.
 */
@Service
@Transactional(readOnly = true)
public class CommunityService {

    private final CommunityPolicy policy;
    private final PublicationRepository publications;
    private final ProjectRepository projects;
    private final UserRepository users;
    private final LikeRepository likes;
    private final FollowRepository follows;
    private final UserBlockRepository blocks;

    public CommunityService(
            CommunityPolicy policy,
            PublicationRepository publications,
            ProjectRepository projects,
            UserRepository users,
            LikeRepository likes,
            FollowRepository follows,
            UserBlockRepository blocks) {
        this.policy = policy;
        this.publications = publications;
        this.projects = projects;
        this.users = users;
        this.likes = likes;
        this.follows = follows;
        this.blocks = blocks;
    }

    /** The wire shape is the contract's: packages/schemas → community-like-state.schema.json. */
    public record LikeState(boolean liked, long count, String blocked, String reason) { }

    public record FollowState(boolean following, long followers, String blocked, String reason) { }

    record Verdict(boolean allowed, String blockedBy, String reason) {
        static Verdict allow() { return new Verdict(true, null, null); }
        static Verdict refuse(String blockedBy, String reason) { return new Verdict(false, blockedBy, reason); }
    }

    /**
     * Toggle a like on the project behind a published version. Idempotent under a double click: the insert
     * is ON CONFLICT DO NOTHING, so two concurrent "like" clicks both answer "liked" and the row exists once.
     */
    @Transactional
    public LikeState toggleLike(UUID actorId, UUID publicationId) {
        Publication publication = publications.findById(publicationId)
                .orElseThrow(() -> new CommunityRefusal("not_found", policy.refusal("noSuchPublication")));
        Project project = projects.findById(publication.getProjectId()).orElse(null);
        // No project row and a soft-deleted project are the same answer: the public page is already 404.
        boolean deleted = project == null || project.getDeletedAt() != null;
        if (!policy.publicationReachable(publication.getVisibility(), publication.getModeration(), deleted)) {
            throw new CommunityRefusal("not_public", policy.refusal("publicationGone"));
        }

        Verdict verdict = canInteract(actorId, project.getOwnerId());
        if (!verdict.allowed()) {
            return new LikeState(false, likes.countByProjectId(publication.getProjectId()), verdict.blockedBy(), verdict.reason());
        }

        UUID projectId = publication.getProjectId();
        boolean existed = likes.existsByUserIdAndProjectId(actorId, projectId);
        if (existed) {
            likes.deleteRow(actorId, projectId);
        } else {
            likes.insertIgnoringConflict(actorId, projectId);
        }
        return new LikeState(!existed, likes.countByProjectId(projectId), null, null);
    }

    /** Toggle a follow. Following yourself is refused, never silently turned into "unfollow yourself". */
    @Transactional
    public FollowState toggleFollow(UUID actorId, UUID targetUserId) {
        if (actorId.equals(targetUserId)) {
            throw new CommunityRefusal("self_follow", policy.refusal("selfFollow"));
        }
        if (!users.existsById(targetUserId)) {
            throw new CommunityRefusal("not_found", policy.refusal("noSuchUser"));
        }
        Verdict verdict = canInteract(actorId, targetUserId);
        if (!verdict.allowed()) {
            return new FollowState(false, follows.countByFolloweeId(targetUserId), verdict.blockedBy(), verdict.reason());
        }
        boolean existed = follows.existsByFollowerIdAndFolloweeId(actorId, targetUserId);
        if (existed) {
            follows.deleteRow(actorId, targetUserId);
        } else {
            follows.insertIgnoringConflict(actorId, targetUserId);
        }
        return new FollowState(!existed, follows.countByFolloweeId(targetUserId), null, null);
    }

    /**
     * Can this action land on that person? Both directions are asked, and "them" is answered first — the
     * same precedence as the web layer, so the same pair gets the same sentence from either service.
     * Only the kinds the policy lists as interaction-blocking count; mute is not one of them.
     */
    Verdict canInteract(UUID actorId, UUID targetId) {
        String theyBlockedMe = relationOf(targetId, actorId);
        if (policy.blocksInteraction(theyBlockedMe)) {
            return Verdict.refuse("them", policy.interactionRefusal("them"));
        }
        String iBlockedThem = relationOf(actorId, targetId);
        if (policy.blocksInteraction(iBlockedThem)) {
            return Verdict.refuse("me", policy.interactionRefusal("me"));
        }
        return Verdict.allow();
    }

    /** What observer chose about subject; null when there is no row, when it is yourself, or an unknown kind. */
    private String relationOf(UUID observerId, UUID subjectId) {
        if (observerId == null || observerId.equals(subjectId)) {
            return null;
        }
        Optional<String> kind = blocks.kindOf(observerId, subjectId);
        // An unrecognised kind is "no relation", never "block": refusing somebody's normal interaction on
        // the strength of a row we cannot interpret is worse than letting it through.
        return kind.filter(policy.blockKinds()::contains).orElse(null);
    }

    public long likeCount(UUID projectId) {
        return likes.countByProjectId(projectId);
    }

    public long followerCount(UUID userId) {
        return follows.countByFolloweeId(userId);
    }
}