package com.nexus.domain.community;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.fail;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.nexus.domain.project.Project;
import org.springframework.context.ApplicationEventPublisher;
import com.nexus.domain.project.ProjectRepository;
import com.nexus.domain.user.User;
import com.nexus.domain.user.UserRepository;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * The community rules, graded without a database (SC-17). The policy is the REAL loaded export, not a mock:
 * a mocked policy would let these tests pass while the service enforced something else.
 *
 * <p>Every refusal arm asserts that NOTHING was written. That is the assertion that matters — a service that
 * inserts the row and then returns "blocked" looks identical in a status-code test and doubles the like count
 * in production. The web layer's own suite makes the same point ("被拉黑之后评论不入库、点赞不改计数").
 *
 * <p>What this class cannot prove: that the native ON CONFLICT insert really is idempotent on PostgreSQL, and
 * that the two services answer identically on the same rows. Those are the live run's claim.
 */
@ExtendWith(MockitoExtension.class)
class CommunityServiceTest {

    private static final UUID ACTOR = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001");
    private static final UUID OWNER = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000002");
    private static final UUID PROJECT = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000003");
    private static final UUID PUBLICATION = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000004");

    @Mock private PublicationRepository publications;
    @Mock private ProjectRepository projects;
    @Mock private UserRepository users;
    @Mock private LikeRepository likes;
    @Mock private FollowRepository follows;
    @Mock private UserBlockRepository blocks;
    @Mock private ApplicationEventPublisher events;

    private CommunityPolicy policy;
    private CommunityService service;

    @BeforeEach
    void setUp() {
        policy = new CommunityPolicy();
        service = new CommunityService(policy, publications, projects, users, likes, follows, blocks, events);
    }

    // ---- like ----

    @Test
    void aFirstLikeWritesOnceAndReportsTheRealCount() {
        givenPublication("public", "pending", false);
        when(likes.existsByUserIdAndProjectId(ACTOR, PROJECT)).thenReturn(false);
        when(likes.countByProjectId(PROJECT)).thenReturn(1L);

        CommunityService.LikeState state = service.toggleLike(ACTOR, PUBLICATION);

        assertThat(state.liked()).isTrue();
        assertThat(state.count()).isEqualTo(1L);
        assertThat(state.blocked()).isNull();
        assertThat(state.reason()).isNull();
        verify(likes).insertIgnoringConflict(ACTOR, PROJECT);
        verify(likes, never()).deleteRow(any(), any());
    }

    @Test
    void aSecondLikeFromTheSamePersonRemovesIt() {
        givenPublication("public", "approved", false);
        when(likes.existsByUserIdAndProjectId(ACTOR, PROJECT)).thenReturn(true);
        when(likes.countByProjectId(PROJECT)).thenReturn(0L);

        CommunityService.LikeState state = service.toggleLike(ACTOR, PUBLICATION);

        assertThat(state.liked()).isFalse();
        verify(likes).deleteRow(ACTOR, PROJECT);
        verify(likes, never()).insertIgnoringConflict(any(), any());
    }

    @Test
    void whenTheyBlockedMeTheLikeIsRefusedAndNothingIsWritten() {
        givenPublication("public", "pending", false);
        when(blocks.kindOf(OWNER, ACTOR)).thenReturn(Optional.of("block"));
        when(likes.countByProjectId(PROJECT)).thenReturn(7L);

        CommunityService.LikeState state = service.toggleLike(ACTOR, PUBLICATION);

        assertThat(state.liked()).isFalse();
        assertThat(state.blocked()).isEqualTo("them");
        assertThat(state.reason()).isEqualTo(policy.interactionRefusal("them"));
        assertThat(state.count()).isEqualTo(7L);
        verifyNoWriteToLikes();
    }

    @Test
    void whenIBlockedThemTheLikeIsAlsoRefused_andTheSentenceSaysSo() {
        givenPublication("public", "pending", false);
        when(blocks.kindOf(OWNER, ACTOR)).thenReturn(Optional.empty());
        when(blocks.kindOf(ACTOR, OWNER)).thenReturn(Optional.of("block"));
        when(likes.countByProjectId(PROJECT)).thenReturn(7L);

        CommunityService.LikeState state = service.toggleLike(ACTOR, PUBLICATION);

        assertThat(state.blocked()).isEqualTo("me");
        assertThat(state.reason()).isEqualTo(policy.interactionRefusal("me"));
        verifyNoWriteToLikes();
    }

    @Test
    void bothDirectionsBlocked_themWins_theSamePrecedenceAsTheWebLayer() {
        givenPublication("public", "pending", false);
        when(blocks.kindOf(OWNER, ACTOR)).thenReturn(Optional.of("block"));
        when(likes.countByProjectId(PROJECT)).thenReturn(0L);

        assertThat(service.toggleLike(ACTOR, PUBLICATION).blocked()).isEqualTo("them");
        verify(blocks, never()).kindOf(ACTOR, OWNER);
    }

    @Test
    void muteDoesNotStopALike_itOnlyHidesPeopleFromLists() {
        givenPublication("public", "pending", false);
        when(blocks.kindOf(OWNER, ACTOR)).thenReturn(Optional.of("mute"));
        when(likes.existsByUserIdAndProjectId(ACTOR, PROJECT)).thenReturn(false);
        when(likes.countByProjectId(PROJECT)).thenReturn(1L);

        CommunityService.LikeState state = service.toggleLike(ACTOR, PUBLICATION);

        assertThat(state.liked()).isTrue();
        assertThat(state.blocked()).isNull();
        verify(likes).insertIgnoringConflict(ACTOR, PROJECT);
    }

    @Test
    void anUnrecognisedKindIsTreatedAsNoRelation() {
        givenPublication("public", "pending", false);
        when(blocks.kindOf(OWNER, ACTOR)).thenReturn(Optional.of("shadow-ban"));
        when(likes.existsByUserIdAndProjectId(ACTOR, PROJECT)).thenReturn(false);
        when(likes.countByProjectId(PROJECT)).thenReturn(1L);

        assertThat(service.toggleLike(ACTOR, PUBLICATION).liked()).isTrue();
        verify(likes).insertIgnoringConflict(ACTOR, PROJECT);
    }

    @Test
    void aMissingPublicationIsNotFound() {
        when(publications.findById(PUBLICATION)).thenReturn(Optional.empty());

        try {
            service.toggleLike(ACTOR, PUBLICATION);
            fail("a missing publication must be refused");
        } catch (CommunityRefusal refusal) {
            assertThat(refusal.getCode()).isEqualTo("not_found");
            assertThat(refusal.getMessage()).isEqualTo(policy.refusal("noSuchPublication"));
        }
        verifyNoInteractions(likes);
    }

    @Test
    void privateRejectedAndDeletedVersionsDoNotExistForInteraction() {
        givenPublication("private", "approved", false);
        assertThatThrownBy(() -> service.toggleLike(ACTOR, PUBLICATION))
                .isInstanceOf(CommunityRefusal.class)
                .hasMessage(policy.refusal("publicationGone"));
        verifyNoInteractions(likes);
    }

    @Test
    void aHumanRejectedVersionIsNotPublicEvenWhenVisibilitySaysPublic() {
        givenPublication("public", "rejected", false);
        assertThatThrownBy(() -> service.toggleLike(ACTOR, PUBLICATION)).isInstanceOf(CommunityRefusal.class);
        verifyNoInteractions(likes);
    }

    @Test
    void aSoftDeletedProjectTakesItsPublicationWithIt() {
        givenPublication("public", "approved", true);
        assertThatThrownBy(() -> service.toggleLike(ACTOR, PUBLICATION)).isInstanceOf(CommunityRefusal.class);
        verifyNoInteractions(likes);
    }

    @Test
    void aPublicationWhoseProjectRowIsGoneIsAlsoUnavailable() {
        Publication publication = mock(Publication.class);
        when(publication.getProjectId()).thenReturn(PROJECT);
        when(publications.findById(PUBLICATION)).thenReturn(Optional.of(publication));
        when(projects.findById(PROJECT)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.toggleLike(ACTOR, PUBLICATION)).isInstanceOf(CommunityRefusal.class);
        verifyNoInteractions(likes);
    }

    @Test
    void unlistedIsReachable_byLink_notByDiscovery() {
        givenPublication("unlisted", "pending", false);
        when(likes.existsByUserIdAndProjectId(ACTOR, PROJECT)).thenReturn(false);
        when(likes.countByProjectId(PROJECT)).thenReturn(1L);

        assertThat(service.toggleLike(ACTOR, PUBLICATION).liked()).isTrue();
    }

    // ---- follow ----

    @Test
    void followingYourselfIsRefusedBeforeAnythingElse() {
        try {
            service.toggleFollow(ACTOR, ACTOR);
            fail("following yourself must be refused");
        } catch (CommunityRefusal refusal) {
            assertThat(refusal.getCode()).isEqualTo("self_follow");
            assertThat(refusal.getMessage()).isEqualTo(policy.refusal("selfFollow"));
        }
        verifyNoInteractions(follows, blocks, users);
    }

    @Test
    void followingNobodyIsRefused_withThePolicySentence() {
        when(users.existsById(OWNER)).thenReturn(false);

        assertThatThrownBy(() -> service.toggleFollow(ACTOR, OWNER))
                .isInstanceOf(CommunityRefusal.class)
                .hasMessage(policy.refusal("noSuchUser"));
        verifyNoInteractions(follows);
    }

    @Test
    void aFirstFollowWritesOnce() {
        when(users.existsById(OWNER)).thenReturn(true);
        when(follows.existsByFollowerIdAndFolloweeId(ACTOR, OWNER)).thenReturn(false);
        when(follows.countByFolloweeId(OWNER)).thenReturn(4L);

        CommunityService.FollowState state = service.toggleFollow(ACTOR, OWNER);

        assertThat(state.following()).isTrue();
        assertThat(state.followers()).isEqualTo(4L);
        assertThat(state.blocked()).isNull();
        verify(follows).insertIgnoringConflict(ACTOR, OWNER);
    }

    @Test
    void aSecondFollowRemovesTheEdge() {
        when(users.existsById(OWNER)).thenReturn(true);
        when(follows.existsByFollowerIdAndFolloweeId(ACTOR, OWNER)).thenReturn(true);
        when(follows.countByFolloweeId(OWNER)).thenReturn(3L);

        assertThat(service.toggleFollow(ACTOR, OWNER).following()).isFalse();
        verify(follows).deleteRow(ACTOR, OWNER);
        verify(follows, never()).insertIgnoringConflict(any(), any());
    }

    @Test
    void aBlockedPairCannotStartFollowingAndNothingIsWritten() {
        when(users.existsById(OWNER)).thenReturn(true);
        when(blocks.kindOf(OWNER, ACTOR)).thenReturn(Optional.of("block"));
        when(follows.countByFolloweeId(OWNER)).thenReturn(9L);

        CommunityService.FollowState state = service.toggleFollow(ACTOR, OWNER);

        assertThat(state.following()).isFalse();
        assertThat(state.blocked()).isEqualTo("them");
        assertThat(state.followers()).isEqualTo(9L);
        verify(follows, never()).insertIgnoringConflict(any(), any());
        verify(follows, never()).deleteRow(any(), any());
    }

    @Test
    void aMutedPersonCanStillFollowYou() {
        when(users.existsById(OWNER)).thenReturn(true);
        when(blocks.kindOf(OWNER, ACTOR)).thenReturn(Optional.of("mute"));
        when(follows.existsByFollowerIdAndFolloweeId(ACTOR, OWNER)).thenReturn(false);
        when(follows.countByFolloweeId(OWNER)).thenReturn(1L);

        assertThat(service.toggleFollow(ACTOR, OWNER).following()).isTrue();
        verify(follows).insertIgnoringConflict(ACTOR, OWNER);
    }

    // ---- §SC-54 domain events ----

    @Test
    void aFirstLikeAlsoFiresLikeAdded_withOwnerProjectAndActorName() {
        givenPublication("public", "pending", false);
        when(likes.existsByUserIdAndProjectId(ACTOR, PROJECT)).thenReturn(false);
        when(likes.countByProjectId(PROJECT)).thenReturn(1L);
        User actor = mock(User.class);
        when(actor.getDisplayName()).thenReturn("阿南");
        when(users.findById(ACTOR)).thenReturn(Optional.of(actor));

        service.toggleLike(ACTOR, PUBLICATION);

        org.mockito.ArgumentCaptor<CommunityEvents.LikeAdded> captor =
                org.mockito.ArgumentCaptor.forClass(CommunityEvents.LikeAdded.class);
        verify(events).publishEvent(captor.capture());
        CommunityEvents.LikeAdded e = captor.getValue();
        assertThat(e.ownerId()).isEqualTo(OWNER);
        assertThat(e.projectId()).isEqualTo(PROJECT);
        assertThat(e.actorName()).isEqualTo("阿南");
    }

    @Test
    void aSecondLikeRemovesItAndFiresNoEvent() {
        givenPublication("public", "approved", false);
        when(likes.existsByUserIdAndProjectId(ACTOR, PROJECT)).thenReturn(true);
        when(likes.countByProjectId(PROJECT)).thenReturn(0L);

        service.toggleLike(ACTOR, PUBLICATION);

        verify(events, never()).publishEvent(any());
    }

    @Test
    void aBlockedLikeFiresNoEvent() {
        givenPublication("public", "pending", false);
        when(blocks.kindOf(OWNER, ACTOR)).thenReturn(Optional.of("block"));
        when(likes.countByProjectId(PROJECT)).thenReturn(7L);

        service.toggleLike(ACTOR, PUBLICATION);

        verify(events, never()).publishEvent(any());
    }

    @Test
    void aFirstFollowFiresFollowAdded_withActorName() {
        when(users.existsById(OWNER)).thenReturn(true);
        when(follows.existsByFollowerIdAndFolloweeId(ACTOR, OWNER)).thenReturn(false);
        when(follows.countByFolloweeId(OWNER)).thenReturn(4L);
        User actor = mock(User.class);
        when(actor.getDisplayName()).thenReturn("阿南");
        when(users.findById(ACTOR)).thenReturn(Optional.of(actor));

        service.toggleFollow(ACTOR, OWNER);

        org.mockito.ArgumentCaptor<CommunityEvents.FollowAdded> captor =
                org.mockito.ArgumentCaptor.forClass(CommunityEvents.FollowAdded.class);
        verify(events).publishEvent(captor.capture());
        CommunityEvents.FollowAdded e = captor.getValue();
        assertThat(e.targetUserId()).isEqualTo(OWNER);
        assertThat(e.actorName()).isEqualTo("阿南");
    }

    @Test
    void aSecondFollowRemovesTheEdgeAndFiresNoEvent() {
        when(users.existsById(OWNER)).thenReturn(true);
        when(follows.existsByFollowerIdAndFolloweeId(ACTOR, OWNER)).thenReturn(true);
        when(follows.countByFolloweeId(OWNER)).thenReturn(3L);

        service.toggleFollow(ACTOR, OWNER);

        verify(events, never()).publishEvent(any());
    }

    @Test
    void aBlockedFollowFiresNoEvent() {
        when(users.existsById(OWNER)).thenReturn(true);
        when(blocks.kindOf(OWNER, ACTOR)).thenReturn(Optional.of("block"));
        when(follows.countByFolloweeId(OWNER)).thenReturn(9L);

        service.toggleFollow(ACTOR, OWNER);

        verify(events, never()).publishEvent(any());
    }

    // ---- helpers ----

    private void givenPublication(String visibility, String moderation, boolean deleted) {
        Publication publication = mock(Publication.class);
        when(publication.getProjectId()).thenReturn(PROJECT);
        when(publication.getVisibility()).thenReturn(visibility);
        when(publication.getModeration()).thenReturn(moderation);
        when(publications.findById(PUBLICATION)).thenReturn(Optional.of(publication));
        Project project = new Project();
        project.setId(PROJECT);
        project.setOwnerId(OWNER);
        project.setDeletedAt(deleted ? Instant.now() : null);
        when(projects.findById(PROJECT)).thenReturn(Optional.of(project));
    }

    private void verifyNoWriteToLikes() {
        verify(likes, never()).insertIgnoringConflict(any(), any());
        verify(likes, never()).deleteRow(any(), any());
    }
}
