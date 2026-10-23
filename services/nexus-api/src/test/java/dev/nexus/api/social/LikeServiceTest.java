package dev.nexus.api.social;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.ops.AuditService;
import dev.nexus.api.social.LikeDtos.LikeClaim;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

/**
 * The three rules {@link LikeService} owns, and the two behaviours that are not rules: the count after
 * the like, and the "already gone" answer.
 *
 * <p>No Spring context and no database here on purpose. These cases are about what the service decides;
 * the real-browser proof is what drives the real jar against a real PostgreSQL. A test that needed a
 * database to check "a like needs an account" would be slow and would prove less.
 *
 * <p>The clock is PINNED, so the instant a like records is asserted rather than read back and compared
 * to itself.
 */
@ExtendWith(MockitoExtension.class)
class LikeServiceTest {

    private static final Instant LIKED_AT = Instant.parse("2026-10-20T12:00:00Z");

    @Mock
    private LikeRepository repository;

    /** v289 — the TRAIL the social verbs write into. A mock, because these cases grade the social rules;
     *  the trail's own rules are graded in {@code AuditServiceTest}. */
    @Mock
    private AuditService audit;

    private LikeService service;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(LIKED_AT, ZoneOffset.UTC);
        service = new LikeService(repository, clock, audit);
    }

    private static LikeClaim claim(String accountId) {
        return new LikeClaim(accountId, "ada", "unsigned-local", 1_700_000_000_000L);
    }

    private static LikeEntry row(String target, String account) {
        return new LikeEntry(target, account, "ada", "unsigned-local", LIKED_AT);
    }

    // ── rule 1: a like needs an ACCOUNT ─────────────────────────────────────────────────────────────

    @Test
    void aLikeWithNoClaimIsREFUSEDByName() {
        assertThatThrownBy(() -> service.like("pub-1", null))
                .isInstanceOf(InvalidLike.class)
                .hasMessageContaining("needs an account")
                .hasMessageContaining("cannot tell one anonymous like from the same one twice");
        verify(repository, never()).save(any());
    }

    @Test
    void aLikeWithABlankAccountIsREFUSEDTheSameWay() {
        assertThatThrownBy(() -> service.like("pub-1", claim("   ")))
                .isInstanceOf(InvalidLike.class)
                .hasMessageContaining("needs an account");
        verify(repository, never()).save(any());
    }

    @Test
    void theRefusalIsNotAVerificationFailure() {
        // The reason matters to the caller: an anonymous like is not refused because it is untrusted, it is
        // refused because it cannot be COUNTED. A message that said "unverified" would send the caller
        // looking for a signature instead of an account.
        assertThatThrownBy(() -> service.like("pub-1", null))
                .hasMessageContaining("cannot tell one anonymous like from the same one twice")
                .hasMessageNotContaining("verif");
    }

    // ── rule 2: liking twice is liking once ───────────────────────────────────────────────────────

    @Test
    void aSecondLikeFromTheSameAccountDoesNOTGrowTheCount() {
        LikeEntry existing = row("pub-1", "acct-ada");
        when(repository.findByTargetProjectIdAndActorAccountId("pub-1", "acct-ada")).thenReturn(Optional.of(existing));
        when(repository.countByTargetProjectId("pub-1")).thenReturn(1L);

        LikeService.LikeResult answer = service.like("pub-1", claim("acct-ada"));

        assertThat(answer.liked()).isTrue();
        assertThat(answer.count()).isEqualTo(1L);
        assertThat(answer.likes()).containsExactly(existing);
        verify(repository, never()).save(any());
    }

    @Test
    void theFirstLikeWritesOneRowAndReportsTheCountAfterIt() {
        when(repository.findByTargetProjectIdAndActorAccountId("pub-1", "acct-ada")).thenReturn(Optional.empty());
        when(repository.save(any(LikeEntry.class))).thenAnswer(i -> i.getArgument(0));
        when(repository.countByTargetProjectId("pub-1")).thenReturn(1L);

        LikeService.LikeResult answer = service.like("pub-1", claim("acct-ada"));

        assertThat(answer.liked()).isTrue();
        assertThat(answer.count()).isEqualTo(1L);
        ArgumentCaptor<LikeEntry> wrote = ArgumentCaptor.forClass(LikeEntry.class);
        verify(repository, times(1)).save(wrote.capture());
        assertThat(wrote.getValue().getTargetProjectId()).isEqualTo("pub-1");
        assertThat(wrote.getValue().getActorAccountId()).isEqualTo("acct-ada");
        assertThat(wrote.getValue().getActorHandle()).isEqualTo("ada");
        assertThat(wrote.getValue().getActorAssurance()).isEqualTo("unsigned-local");
        assertThat(wrote.getValue().getCreatedAt()).isEqualTo(LIKED_AT);
    }

    @Test
    void theLikeRecordsTheSERVICEsInstant() {
        when(repository.findByTargetProjectIdAndActorAccountId("pub-1", "acct-ada")).thenReturn(Optional.empty());
        when(repository.save(any(LikeEntry.class))).thenAnswer(i -> i.getArgument(0));
        when(repository.countByTargetProjectId("pub-1")).thenReturn(1L);

        service.like("pub-1", claim("acct-ada"));

        ArgumentCaptor<LikeEntry> wrote = ArgumentCaptor.forClass(LikeEntry.class);
        verify(repository).save(wrote.capture());
        // The service owns the clock: a client that sent its own instant would be asking the service to
        // believe a number it never checked.
        assertThat(wrote.getValue().getCreatedAt()).isEqualTo(LIKED_AT);
    }

    // ── rule 3: only the account that liked can take it back ─────────────────────────────────────

    @Test
    void takingBackALikeThatIsNotThereIsALREADY_GONEAndNotAFailure() {
        when(repository.findByTargetProjectIdAndActorAccountId("pub-1", "acct-ada")).thenReturn(Optional.empty());
        when(repository.countByTargetProjectId("pub-1")).thenReturn(3L);

        LikeService.LikeResult answer = service.unlike("pub-1", claim("acct-ada"));

        assertThat(answer.liked()).isFalse();
        assertThat(answer.count()).isEqualTo(3L);
        verify(repository, never()).delete(any());
    }

    @Test
    void takingBackYourOwnLikeRemovesTheRowAndLowersTheCount() {
        LikeEntry existing = row("pub-1", "acct-ada");
        when(repository.findByTargetProjectIdAndActorAccountId("pub-1", "acct-ada")).thenReturn(Optional.of(existing));
        when(repository.countByTargetProjectId("pub-1")).thenReturn(0L);

        LikeService.LikeResult answer = service.unlike("pub-1", claim("acct-ada"));

        assertThat(answer.liked()).isFalse();
        assertThat(answer.count()).isZero();
        verify(repository, times(1)).delete(eq(existing));
    }

    @Test
    void takingBackALikeNeedsAnAccountToo() {
        assertThatThrownBy(() -> service.unlike("pub-1", null)).isInstanceOf(InvalidLike.class);
        verify(repository, never()).delete(any());
    }

    // ── the read ───────────────────────────────────────────────────────────────────────────────────

    @Test
    void theLikesOfAPublicationCarryTheCountAndWhetherTheViewerIsAmongThem() {
        LikeEntry one = row("pub-1", "acct-ada");
        when(repository.findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), any(Pageable.class)))
                .thenReturn(List.of(one));
        when(repository.countByTargetProjectId("pub-1")).thenReturn(7L);
        when(repository.findByTargetProjectIdAndActorAccountId("pub-1", "acct-ada")).thenReturn(Optional.of(one));

        LikeService.LikeResult answer = service.likesOf("pub-1", "acct-ada", 20);

        assertThat(answer.count()).isEqualTo(7L);
        assertThat(answer.liked()).isTrue();
        assertThat(answer.likes()).containsExactly(one);
    }

    @Test
    void aReaderWhoIsNobodyGetsATrueAnswer() {
        // The count does not depend on who is asking, and a viewer who names no account is not an error.
        LikeEntry one = row("pub-1", "acct-ada");
        when(repository.findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), any(Pageable.class)))
                .thenReturn(List.of(one));
        when(repository.countByTargetProjectId("pub-1")).thenReturn(7L);

        LikeService.LikeResult answer = service.likesOf("pub-1", null, 20);

        assertThat(answer.count()).isEqualTo(7L);
        assertThat(answer.liked()).isFalse();
        verify(repository, never()).findByTargetProjectIdAndActorAccountId(eq("pub-1"), any());
    }

    @Test
    void aBlankProjectIdIsRefusedByName() {
        assertThatThrownBy(() -> service.likesOf("   ", "acct-ada", 20))
                .isInstanceOf(InvalidLike.class)
                .hasMessageContaining("projectId must not be blank");
    }

    @Test
    void theLimitIsClampedRatherThanRefused() {
        when(repository.findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), any(Pageable.class)))
                .thenReturn(List.of());
        when(repository.countByTargetProjectId("pub-1")).thenReturn(0L);

        service.likesOf("pub-1", null, 10_000);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(LikeService.MAX_LIKE_LIMIT);
    }

    @Test
    void aNonPositiveLimitIsTheDefaultRatherThanZero() {
        when(repository.findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), any(Pageable.class)))
                .thenReturn(List.of());
        when(repository.countByTargetProjectId("pub-1")).thenReturn(0L);

        service.likesOf("pub-1", null, 0);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(LikeService.DEFAULT_LIKE_LIMIT);
    }
    // ── v289: the trail ───────────────────────────────────────────────────────────────────────────

    @Test
    void aNEWLikeIsWRITTENToTheTrail() {
        when(repository.findByTargetProjectIdAndActorAccountId("pub-1", "acct-ada")).thenReturn(Optional.empty());
        when(repository.save(any(LikeEntry.class))).thenAnswer(i -> i.getArgument(0));
        when(repository.countByTargetProjectId("pub-1")).thenReturn(1L);

        service.like("pub-1", claim("acct-ada"));

        // A like is something that happened to a publication, so the trail says it happened.
        verify(audit).record("like", "acct-ada", "ada", "unsigned-local", "pub-1", AuditService.TARGET_PUBLICATION);
    }

    @Test
    void aSECONDLikeIsNOTWrittenToTheTrail() {
        LikeEntry existing = row("pub-1", "acct-ada");
        when(repository.findByTargetProjectIdAndActorAccountId("pub-1", "acct-ada")).thenReturn(Optional.of(existing));
        when(repository.countByTargetProjectId("pub-1")).thenReturn(1L);

        service.like("pub-1", claim("acct-ada"));

        // Nothing changed, so nothing is written: the trail records what HAPPENED, not what was attempted.
        verify(audit, never()).record(any(), any(), any(), any(), any(), any());
    }

    @Test
    void aREFUSEDLikeIsNOTWrittenToTheTrail() {
        assertThatThrownBy(() -> service.like("pub-1", null)).isInstanceOf(InvalidLike.class);

        // A refused mutation changed nothing, so the trail says nothing about it.
        verify(audit, never()).record(any(), any(), any(), any(), any(), any());
    }
}

