package dev.nexus.api.social;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.social.FollowDtos.Follow;
import dev.nexus.api.social.FollowDtos.FollowAnswer;
import dev.nexus.api.social.FollowDtos.FollowClaim;
import dev.nexus.api.social.FollowDtos.FollowRequest;
import dev.nexus.api.social.FollowDtos.FollowersAnswer;
import dev.nexus.api.social.FollowDtos.FollowingAnswer;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

/**
 * M7 v420 - the HTTP surface for FOLLOWS, graded directly.
 *
 * <p>The third controller, and the first with TWO read directions on one door: {@code follower=} asks
 * "who do I watch" and {@code accountId=} asks "who watches me", and one query cannot answer both. What
 * THIS file grades is the routing between them, the window arithmetic before each ask, the claim the
 * DELETE door builds out of a query parameter, and two honest edges the module carries: the POST answers
 * 201 for a repeat follow too (the door's own comment says otherwise, and the code is pinned as it
 * reads), and the following direction's answer echoes its cap but not its start row, because that
 * answer's window is a size and not a page.
 *
 * <p>No Spring context and no database here on purpose, the same rule the service tests and the two
 * controller tests before this one follow.
 */
@ExtendWith(MockitoExtension.class)
class FollowControllerTest {

    private static final Instant AT = Instant.parse("2026-10-20T12:00:00Z");

    @Mock
    private FollowService service;

    private FollowController controller;

    @BeforeEach
    void setUp() {
        controller = new FollowController(service);
    }

    private static FollowClaim claim(String accountId) {
        return new FollowClaim(accountId, "ada", "unsigned-local", 1_700_000_000_000L);
    }

    private static FollowEntry edge(String follower, String followee) {
        return new FollowEntry(follower, "ada", "unsigned-local", followee, AT);
    }

    @Test
    void aFollowAnswers201EvenWhenTheEdgeWasAlreadyThere() {
        // Pinned as the code reads: this door answers 201 for a repeat follow too. The door's own comment
        // promises "200 when it was already there" - the divergence is stated here rather than smoothed,
        // so making the comment true is a decision somebody takes on purpose.
        when(service.follow("acct-b", claim("acct-ada")))
                .thenReturn(new FollowService.FollowResult("acct-b", true, 3L, 2L, List.of(edge("acct-ada", "acct-b"))));

        ResponseEntity<FollowAnswer> res = controller.follow(new FollowRequest("acct-b", claim("acct-ada")));

        assertThat(res.getStatusCode().value()).isEqualTo(201);
        FollowAnswer answer = res.getBody();
        assertThat(answer).isNotNull();
        assertThat(answer.accountId()).isEqualTo("acct-b");
        assertThat(answer.following()).isTrue();
        assertThat(answer.followerCount()).isEqualTo(3L);
        assertThat(answer.followingCount()).isEqualTo(2L);
        assertThat(answer.followers()).hasSize(1);
        Follow wire = answer.followers().get(0);
        assertThat(wire.followerId()).isEqualTo("acct-ada");
        assertThat(wire.followeeId()).isEqualTo("acct-b");
        assertThat(wire.createdAt()).isEqualTo(AT.toEpochMilli());
        assertThat(wire.handle()).isEqualTo("ada");
        assertThat(wire.assurance()).isEqualTo("unsigned-local");
    }

    @Test
    void aNullRequestBodyIsAskedAsNullsRatherThanThrownIntoA500() {
        when(service.follow(null, null))
                .thenReturn(new FollowService.FollowResult(null, false, 0L, 0L, List.of()));

        controller.follow(null);

        verify(service).follow(null, null);
    }

    @Test
    void theUnfollowClaimCarriesOnlyTheAccountIdTheQueryParameterNamed() {
        when(service.unfollow("acct-b", new FollowClaim("acct-ada", null, null, null)))
                .thenReturn(new FollowService.FollowResult("acct-b", false, 2L, 1L, List.of()));

        ResponseEntity<FollowAnswer> res = controller.unfollow("acct-b", "acct-ada");

        ArgumentCaptor<FollowClaim> captor = ArgumentCaptor.forClass(FollowClaim.class);
        verify(service).unfollow(eq("acct-b"), captor.capture());
        FollowClaim asked = captor.getValue();
        assertThat(asked.accountId()).isEqualTo("acct-ada");
        assertThat(asked.handle()).isNull();
        assertThat(asked.assurance()).isNull();
        assertThat(asked.claimedAt()).isNull();
        assertThat(res.getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void anUnfollowWithNoClaimerAsksWithNoClaim() {
        when(service.unfollow("acct-b", null))
                .thenReturn(new FollowService.FollowResult("acct-b", false, 2L, 1L, List.of()));

        controller.unfollow("acct-b", null);

        verify(service).unfollow("acct-b", null);
    }

    @Test
    void theFollowerDirectionAsksTheFollowingWindowAndEchoesTheCapOnly() {
        when(service.followingOf("acct-ada", FollowService.MAX_FOLLOW_LIMIT, 0))
                .thenReturn(new FollowService.FollowingResult("acct-ada", 42L, List.of(edge("acct-ada", "acct-b"))));

        ResponseEntity<?> res = controller.list(null, "acct-ada", null, 500, -3);

        verify(service).followingOf("acct-ada", FollowService.MAX_FOLLOW_LIMIT, 0);
        assertThat(res.getBody()).isInstanceOf(FollowingAnswer.class);
        FollowingAnswer answer = (FollowingAnswer) res.getBody();
        assertThat(answer.accountId()).isEqualTo("acct-ada");
        assertThat(answer.followingCount()).isEqualTo(42L);
        assertThat(answer.following()).hasSize(1);
        // The cap is echoed; the start row is not on this answer - its window is a size, not a page.
        assertThat(answer.limit()).isEqualTo(FollowService.MAX_FOLLOW_LIMIT);
    }

    @Test
    void theAccountDirectionAsksTheFollowersWindowWithTheViewer() {
        when(service.followersOf("acct-b", "acct-v", FollowService.DEFAULT_FOLLOW_LIMIT, 40))
                .thenReturn(new FollowService.FollowResult("acct-b", true, 57L, 3L, List.of(edge("acct-c", "acct-b"))));

        ResponseEntity<?> res = controller.list("acct-b", null, "acct-v", null, 40);

        verify(service).followersOf("acct-b", "acct-v", FollowService.DEFAULT_FOLLOW_LIMIT, 40);
        assertThat(res.getBody()).isInstanceOf(FollowersAnswer.class);
        FollowersAnswer answer = (FollowersAnswer) res.getBody();
        assertThat(answer.following()).isTrue();
        assertThat(answer.followerCount()).isEqualTo(57L);
        assertThat(answer.limit()).isEqualTo(FollowService.DEFAULT_FOLLOW_LIMIT);
        assertThat(answer.offset()).isEqualTo(40);
        assertThat(answer.followers()).hasSize(1);
    }

    @Test
    void theAccountDirectionClampsTheCapAndTheWindowBeforeAsking() {
        when(service.followersOf("acct-b", null, FollowService.MAX_FOLLOW_LIMIT, 0))
                .thenReturn(new FollowService.FollowResult("acct-b", false, 0L, 0L, List.of()));

        controller.list("acct-b", null, null, 500, -1);

        verify(service).followersOf("acct-b", null, FollowService.MAX_FOLLOW_LIMIT, 0);
    }

    @Test
    void aNonPositiveCapIsTheDefaultNotARefusal() {
        when(service.followersOf("acct-b", null, FollowService.DEFAULT_FOLLOW_LIMIT, 0))
                .thenReturn(new FollowService.FollowResult("acct-b", false, 0L, 0L, List.of()));

        controller.list("acct-b", null, null, 0, 0);

        verify(service).followersOf("acct-b", null, FollowService.DEFAULT_FOLLOW_LIMIT, 0);
    }

    @Test
    void aBlankFollowerFallsThroughToTheAccountDirection() {
        when(service.followersOf("acct-b", null, FollowService.DEFAULT_FOLLOW_LIMIT, 0))
                .thenReturn(new FollowService.FollowResult("acct-b", false, 0L, 0L, List.of()));

        controller.list("acct-b", "   ", null, null, null);

        verify(service).followersOf("acct-b", null, FollowService.DEFAULT_FOLLOW_LIMIT, 0);
    }

    @Test
    void aQuestionThatNamesNeitherAccountNorFollowerIsA400ThatNamesBoth() {
        // The controller answers this one ITSELF rather than throwing: the ask is missing a parameter,
        // which is the caller's to fix, and the message names both doors so the fix is findable.
        ResponseEntity<?> res = controller.list(null, null, null, null, null);

        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(res.getBody()).isInstanceOf(Map.class);
        @SuppressWarnings("unchecked")
        Map<String, String> body = (Map<String, String>) res.getBody();
        assertThat(body).containsEntry("error", "invalid-follow");
        assertThat(body.get("message")).contains("accountId").contains("follower");
    }

    @Test
    void aBrokenRuleIsA400ThatNamesIt() {
        ResponseEntity<Map<String, String>> res = controller.invalid(new InvalidFollow("a follow needs an account"));

        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(res.getBody())
                .containsEntry("error", "invalid-follow")
                .containsEntry("message", "a follow needs an account");
    }
}
