package dev.nexus.api.social;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.social.LikeDtos.Like;
import dev.nexus.api.social.LikeDtos.LikeAnswer;
import dev.nexus.api.social.LikeDtos.LikeClaim;
import dev.nexus.api.social.LikeDtos.LikeRequest;
import dev.nexus.api.social.LikeDtos.LikesAnswer;
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
 * M7 v419 - the HTTP surface for LIKES, graded directly.
 *
 * <p>The controller owns only HTTP; the like rules live in {@link LikeService}. What THIS file grades is
 * the translation and the three things the controller decides on its own: the status a like answers with
 * (201 when the like was NEW, 200 when it was already there - the same distinction the publish receipt
 * makes, visible without reading the body), the claim the DELETE door builds out of a query parameter
 * (the account id and nothing else), and the window arithmetic on the list (a cap over the max is the
 * max, a non-positive cap is the default, a negative offset is the first window), with the window echoed
 * on the answer beside the whole count.
 *
 * <p>No Spring context and no database here on purpose, the same rule the service tests and the comments
 * controller test follow: these cases are about what the controller decides.
 */
@ExtendWith(MockitoExtension.class)
class LikeControllerTest {

    private static final Instant AT = Instant.parse("2026-10-20T12:00:00Z");

    @Mock
    private LikeService service;

    private LikeController controller;

    @BeforeEach
    void setUp() {
        controller = new LikeController(service);
    }

    private static LikeClaim claim(String accountId) {
        return new LikeClaim(accountId, "ada", "unsigned-local", 1_700_000_000_000L);
    }

    private static LikeEntry row(String account) {
        return new LikeEntry("pub-1", account, "ada", "unsigned-local", AT);
    }

    @Test
    void aNewLikeAnswers201() {
        when(service.like("pub-1", claim("acct-ada")))
                .thenReturn(new LikeService.LikeResult("pub-1", true, 1L, List.of(row("acct-ada"))));

        ResponseEntity<LikeAnswer> res = controller.like(new LikeRequest("pub-1", claim("acct-ada")));

        assertThat(res.getStatusCode().value()).isEqualTo(201);
        LikeAnswer answer = res.getBody();
        assertThat(answer).isNotNull();
        assertThat(answer.projectId()).isEqualTo("pub-1");
        assertThat(answer.liked()).isTrue();
        // The count AFTER the like, so a caller never adds one itself and gets it wrong.
        assertThat(answer.count()).isEqualTo(1L);
        assertThat(answer.likes()).hasSize(1);
        Like wire = answer.likes().get(0);
        assertThat(wire.accountId()).isEqualTo("acct-ada");
        assertThat(wire.projectId()).isEqualTo("pub-1");
        assertThat(wire.createdAt()).isEqualTo(AT.toEpochMilli());
        assertThat(wire.handle()).isEqualTo("ada");
        assertThat(wire.assurance()).isEqualTo("unsigned-local");
    }

    @Test
    void anAlreadyThereLikeAnswers200() {
        // The same distinction the publish receipt makes: liked twice is not an error, and the
        // difference is visible without reading the body.
        when(service.like("pub-1", claim("acct-ada")))
                .thenReturn(new LikeService.LikeResult("pub-1", false, 1L, List.of(row("acct-ada"))));

        ResponseEntity<LikeAnswer> res = controller.like(new LikeRequest("pub-1", claim("acct-ada")));

        assertThat(res.getStatusCode().value()).isEqualTo(200);
        assertThat(res.getBody()).isNotNull();
        assertThat(res.getBody().liked()).isFalse();
        assertThat(res.getBody().count()).isEqualTo(1L);
    }

    @Test
    void aLikeThatDidNotLandIsNotA201() {
        // The status reads the COUNT as well as the flag: a liked=true with nothing behind it is not a
        // like that was written, and a 201 would say it was.
        when(service.like("pub-1", claim("acct-ada")))
                .thenReturn(new LikeService.LikeResult("pub-1", true, 0L, List.of()));

        ResponseEntity<LikeAnswer> res = controller.like(new LikeRequest("pub-1", claim("acct-ada")));

        assertThat(res.getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void aNullRequestBodyIsAskedAsNullsRatherThanThrownIntoA500() {
        when(service.like(null, null)).thenReturn(new LikeService.LikeResult(null, false, 0L, List.of()));

        controller.like(null);

        verify(service).like(null, null);
    }

    @Test
    void theUnlikeClaimCarriesOnlyTheAccountIdTheQueryParameterNamed() {
        when(service.unlike("pub-1", new LikeClaim("acct-ada", null, null, null)))
                .thenReturn(new LikeService.LikeResult("pub-1", false, 0L, List.of()));

        ResponseEntity<LikeAnswer> res = controller.unlike("pub-1", "acct-ada");

        ArgumentCaptor<LikeClaim> captor = ArgumentCaptor.forClass(LikeClaim.class);
        verify(service).unlike(eq("pub-1"), captor.capture());
        LikeClaim asked = captor.getValue();
        assertThat(asked.accountId()).isEqualTo("acct-ada");
        assertThat(asked.handle()).isNull();
        assertThat(asked.assurance()).isNull();
        assertThat(asked.claimedAt()).isNull();
        assertThat(res.getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void anUnlikeWithNoClaimerAsksWithNoClaim() {
        when(service.unlike("pub-1", null)).thenReturn(new LikeService.LikeResult("pub-1", false, 0L, List.of()));

        controller.unlike("pub-1", null);

        verify(service).unlike("pub-1", null);
    }

    @Test
    void theListClampsTheCapAndTheWindowBeforeAsking() {
        when(service.likesOf("pub-1", null, LikeService.MAX_LIKE_LIMIT, 0))
                .thenReturn(new LikeService.LikeResult("pub-1", false, 0L, List.of()));

        controller.list("pub-1", null, 500, -3);

        verify(service).likesOf("pub-1", null, LikeService.MAX_LIKE_LIMIT, 0);
    }

    @Test
    void aNonPositiveCapIsTheDefaultNotARefusal() {
        when(service.likesOf("pub-1", null, LikeService.DEFAULT_LIKE_LIMIT, 0))
                .thenReturn(new LikeService.LikeResult("pub-1", false, 0L, List.of()));

        controller.list("pub-1", null, 0, 0);

        verify(service).likesOf("pub-1", null, LikeService.DEFAULT_LIKE_LIMIT, 0);
    }

    @Test
    void theListAnswerCarriesTheWindowBesideTheWholeCount() {
        when(service.likesOf("pub-1", null, LikeService.DEFAULT_LIKE_LIMIT, 40))
                .thenReturn(new LikeService.LikeResult("pub-1", true, 57L, List.of(row("acct-b"))));

        ResponseEntity<?> res = controller.list("pub-1", null, null, 40);

        assertThat(res.getBody()).isInstanceOf(LikesAnswer.class);
        LikesAnswer answer = (LikesAnswer) res.getBody();
        assertThat(answer.liked()).isTrue();
        // The whole count and the window it came from, side by side: which likers this is showing,
        // and how many there are in all.
        assertThat(answer.count()).isEqualTo(57L);
        assertThat(answer.limit()).isEqualTo(LikeService.DEFAULT_LIKE_LIMIT);
        assertThat(answer.offset()).isEqualTo(40);
        assertThat(answer.likes()).hasSize(1);
    }

    @Test
    void theViewerDecidesTheLikedFlagAndNothingElse() {
        when(service.likesOf("pub-1", "acct-b", LikeService.DEFAULT_LIKE_LIMIT, 0))
                .thenReturn(new LikeService.LikeResult("pub-1", true, 7L, List.of()));

        ResponseEntity<?> res = controller.list("pub-1", "acct-b", null, null);

        // The viewer travels with the ask, and the count does not depend on who is asking: a reader who
        // is nobody still gets a true answer.
        verify(service).likesOf("pub-1", "acct-b", LikeService.DEFAULT_LIKE_LIMIT, 0);
        assertThat(((LikesAnswer) res.getBody()).count()).isEqualTo(7L);
    }

    @Test
    void aBrokenRuleIsA400ThatNamesIt() {
        ResponseEntity<Map<String, String>> res = controller.invalid(new InvalidLike("a like needs an account"));

        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(res.getBody())
                .containsEntry("error", "invalid-like")
                .containsEntry("message", "a like needs an account");
    }
}
