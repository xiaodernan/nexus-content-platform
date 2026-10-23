package dev.nexus.api.social;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.social.FollowDtos.FollowClaim;
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
 * The four rules {@link FollowService} owns, and the two behaviours that are not rules: the counts, and
 * the "already gone" answer.
 *
 * <p>No Spring context and no database here on purpose — these cases are about what the service decides.
 * The clock is PINNED, so the instant a follow records is asserted rather than read back and compared to
 * itself.
 */
@ExtendWith(MockitoExtension.class)
class FollowServiceTest {

    private static final Instant AT = Instant.parse("2026-10-20T12:00:00Z");

    @Mock
    private FollowRepository repository;

    private FollowService service;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(AT, ZoneOffset.UTC);
        service = new FollowService(repository, clock);
    }

    private static FollowClaim claim(String accountId) {
        return new FollowClaim(accountId, "ada", "unsigned-local", 1_700_000_000_000L);
    }

    // ── rule 1: a follow needs an ACCOUNT ─────────────────────────────────────────────────────────

    @Test
    void aFollowWithNoClaimIsREFUSEDByName() {
        assertThatThrownBy(() -> service.follow("acct-bob", null))
                .isInstanceOf(InvalidFollow.class)
                .hasMessageContaining("needs an account");
        verify(repository, never()).save(any());
    }

    @Test
    void aFollowOfNothingIsREFUSEDToo() {
        assertThatThrownBy(() -> service.follow("   ", claim("acct-ada")))
                .isInstanceOf(InvalidFollow.class)
                .hasMessageContaining("needs an account to follow");
    }

    // ── rule 2: an account cannot follow ITSELF ───────────────────────────────────────────────────

    @Test
    void anAccountCannotFollowItselfAndTheRefusalSaysWhy() {
        assertThatThrownBy(() -> service.follow("acct-ada", claim("acct-ada")))
                .isInstanceOf(InvalidFollow.class)
                .hasMessageContaining("cannot follow itself")
                .hasMessageContaining("not a relation");
        verify(repository, never()).save(any());
    }

    // ── rule 3: following twice is following once ─────────────────────────────────────────────────

    @Test
    void aSecondFollowFromTheSameAccountDoesNOTMoveTheCounts() {
        FollowEntry existing = new FollowEntry("acct-ada", "ada", "unsigned-local", "acct-bob", AT);
        when(repository.findByFollowerAccountIdAndFolloweeAccountId("acct-ada", "acct-bob")).thenReturn(Optional.of(existing));
        when(repository.countByFolloweeAccountId("acct-bob")).thenReturn(1L);
        when(repository.countByFollowerAccountId("acct-ada")).thenReturn(1L);

        FollowService.FollowResult result = service.follow("acct-bob", claim("acct-ada"));

        assertThat(result.following()).isTrue();
        assertThat(result.followerCount()).isEqualTo(1L);
        verify(repository, never()).save(any());
    }

    @Test
    void theFirstFollowWritesOneEdgeAndReportsTheCountsAfterIt() {
        when(repository.findByFollowerAccountIdAndFolloweeAccountId("acct-ada", "acct-bob")).thenReturn(Optional.empty());
        when(repository.save(any(FollowEntry.class))).thenAnswer(i -> i.getArgument(0));
        when(repository.countByFolloweeAccountId("acct-bob")).thenReturn(1L);
        when(repository.countByFollowerAccountId("acct-ada")).thenReturn(1L);

        FollowService.FollowResult result = service.follow("acct-bob", claim("acct-ada"));

        assertThat(result.following()).isTrue();
        assertThat(result.followerCount()).isEqualTo(1L);
        assertThat(result.followingCount()).isEqualTo(1L);
        ArgumentCaptor<FollowEntry> wrote = ArgumentCaptor.forClass(FollowEntry.class);
        verify(repository, times(1)).save(wrote.capture());
        assertThat(wrote.getValue().getFollowerAccountId()).isEqualTo("acct-ada");
        assertThat(wrote.getValue().getFolloweeAccountId()).isEqualTo("acct-bob");
        assertThat(wrote.getValue().getCreatedAt()).isEqualTo(AT);
    }

    @Test
    void theTwoEndsOfTheEdgeAreDIFFERENTColumns() {
        when(repository.findByFollowerAccountIdAndFolloweeAccountId("acct-ada", "acct-bob")).thenReturn(Optional.empty());
        when(repository.save(any(FollowEntry.class))).thenAnswer(i -> i.getArgument(0));
        when(repository.countByFolloweeAccountId("acct-bob")).thenReturn(1L);
        when(repository.countByFollowerAccountId("acct-ada")).thenReturn(1L);

        service.follow("acct-bob", claim("acct-ada"));

        ArgumentCaptor<FollowEntry> wrote = ArgumentCaptor.forClass(FollowEntry.class);
        verify(repository).save(wrote.capture());
        // A model that stored "a and b" would have to guess which end is which.
        assertThat(wrote.getValue().getFollowerAccountId()).isNotEqualTo(wrote.getValue().getFolloweeAccountId());
    }

    // ── rule 4: only the follower takes the edge back ─────────────────────────────────────────────

    @Test
    void takingBackAnEdgeThatIsNotThereIsALREADY_GONEAndNotAFailure() {
        when(repository.findByFollowerAccountIdAndFolloweeAccountId("acct-ada", "acct-bob")).thenReturn(Optional.empty());
        when(repository.countByFolloweeAccountId("acct-bob")).thenReturn(3L);

        FollowService.FollowResult result = service.unfollow("acct-bob", claim("acct-ada"));

        assertThat(result.following()).isFalse();
        assertThat(result.followerCount()).isEqualTo(3L);
        verify(repository, never()).delete(any());
    }

    @Test
    void takingBackYourOwnEdgeRemovesItAndLowersTheCount() {
        FollowEntry existing = new FollowEntry("acct-ada", "ada", "unsigned-local", "acct-bob", AT);
        when(repository.findByFollowerAccountIdAndFolloweeAccountId("acct-ada", "acct-bob")).thenReturn(Optional.of(existing));
        when(repository.countByFolloweeAccountId("acct-bob")).thenReturn(0L);

        FollowService.FollowResult result = service.unfollow("acct-bob", claim("acct-ada"));

        assertThat(result.following()).isFalse();
        assertThat(result.followerCount()).isZero();
        verify(repository, times(1)).delete(eq(existing));
    }

    @Test
    void takingBackAnEdgeNeedsAnAccount() {
        assertThatThrownBy(() -> service.unfollow("acct-bob", null)).isInstanceOf(InvalidFollow.class);
    }

    // ── the read ───────────────────────────────────────────────────────────────────────────────────

    @Test
    void theFollowersOfAnAccountCarryTheCountsAndWhetherTheViewerIsAmongThem() {
        FollowEntry one = new FollowEntry("acct-ada", "ada", "unsigned-local", "acct-bob", AT);
        when(repository.findByFolloweeAccountIdOrderByCreatedAtDesc(eq("acct-bob"), any(Pageable.class)))
                .thenReturn(List.of(one));
        when(repository.countByFolloweeAccountId("acct-bob")).thenReturn(1L);
        when(repository.countByFollowerAccountId("acct-ada")).thenReturn(2L);
        when(repository.findByFollowerAccountIdAndFolloweeAccountId("acct-ada", "acct-bob")).thenReturn(Optional.of(one));

        FollowService.FollowResult result = service.followersOf("acct-bob", "acct-ada", 20, 0);

        assertThat(result.followerCount()).isEqualTo(1L);
        assertThat(result.followingCount()).isEqualTo(2L);
        assertThat(result.following()).isTrue();
        assertThat(result.followers()).containsExactly(one);
    }

    @Test
    void aReaderWhoIsNobodyGetsATrueAnswer() {
        when(repository.findByFolloweeAccountIdOrderByCreatedAtDesc(eq("acct-bob"), any(Pageable.class)))
                .thenReturn(List.of());
        when(repository.countByFolloweeAccountId("acct-bob")).thenReturn(0L);

        FollowService.FollowResult result = service.followersOf("acct-bob", null, 20, 0);

        assertThat(result.following()).isFalse();
        assertThat(result.followerCount()).isZero();
        assertThat(result.followingCount()).isZero();
    }

    @Test
    void theLimitIsClampedRatherThanRefused() {
        when(repository.findByFolloweeAccountIdOrderByCreatedAtDesc(eq("acct-bob"), any(Pageable.class)))
                .thenReturn(List.of());
        when(repository.countByFolloweeAccountId("acct-bob")).thenReturn(0L);

        service.followersOf("acct-bob", null, 10_000, 0);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByFolloweeAccountIdOrderByCreatedAtDesc(eq("acct-bob"), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(FollowService.MAX_FOLLOW_LIMIT);
    }

    // ── v390: the following window can be PAGED, in rows ──────────────────────────────────────────

    @Test
    void theFollowingWindowCanBePagedInRows() {
        // v390 — the following list is a WINDOW (the most recent N), and a window nobody can page is
        // the whole list to a reader who follows more accounts than the cap. The offset is ROWS:
        // asking for the rows from 20 on is page 1 of a 20-row window, which is what the captor pins.
        when(repository.findByFollowerAccountIdOrderByCreatedAtDesc(eq("acct-ada"), any(Pageable.class)))
                .thenReturn(List.of());
        when(repository.countByFollowerAccountId("acct-ada")).thenReturn(37L);

        service.followingOf("acct-ada", 20, 20);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByFollowerAccountIdOrderByCreatedAtDesc(eq("acct-ada"), window.capture());
        assertThat(window.getValue().getPageNumber()).isEqualTo(1);
        assertThat(window.getValue().getPageSize()).isEqualTo(20);
    }

    @Test
    void theFollowingOffsetIsROWSNotAPageIndex() {
        // v387's lesson, applied from the start rather than discovered by the first pager: the offset
        // means ROWS, and Spring Data's PageRequest speaks PAGES. Asking for the rows from 40 on must
        // be answered with page 2 (rows 40–59) — not page 40 (rows 800–819), which is what handing
        // the raw number to PageRequest.of answers, and what a pager would then call "past the end".
        when(repository.findByFollowerAccountIdOrderByCreatedAtDesc(eq("acct-ada"), any(Pageable.class)))
                .thenReturn(List.of());
        when(repository.countByFollowerAccountId("acct-ada")).thenReturn(37L);

        service.followingOf("acct-ada", 20, 40);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByFollowerAccountIdOrderByCreatedAtDesc(eq("acct-ada"), window.capture());
        assertThat(window.getValue().getPageNumber()).isEqualTo(2);
        assertThat(window.getValue().getPageSize()).isEqualTo(20);
    }

    @Test
    void aNegativeFollowingOffsetIsTheFirstWindow() {
        // A page before the first does not exist; the newest rows are the honest answer, not a refusal.
        when(repository.findByFollowerAccountIdOrderByCreatedAtDesc(eq("acct-ada"), any(Pageable.class)))
                .thenReturn(List.of());
        when(repository.countByFollowerAccountId("acct-ada")).thenReturn(37L);

        service.followingOf("acct-ada", 20, -5);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByFollowerAccountIdOrderByCreatedAtDesc(eq("acct-ada"), window.capture());
        assertThat(window.getValue().getPageNumber()).isZero();
    }

    // ── v397: the FOLLOWERS window can be paged, in rows ────────────────────────────────────

    @Test
    void theFollowersWindowCanBePagedInRows() {
        // v397 — the followers list is a WINDOW (the most recent N), and until now it was the one
        // list on the profile page a reader could not page: a creator followed by more accounts than
        // the cap had the older followers out of reach entirely. The offset is ROWS, and asking for
        // the rows from 20 on is page 1 of a 20-row window.
        when(repository.findByFolloweeAccountIdOrderByCreatedAtDesc(eq("acct-bob"), any(Pageable.class)))
                .thenReturn(List.of());
        when(repository.countByFolloweeAccountId("acct-bob")).thenReturn(37L);

        service.followersOf("acct-bob", null, 20, 20);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByFolloweeAccountIdOrderByCreatedAtDesc(eq("acct-bob"), window.capture());
        assertThat(window.getValue().getPageNumber()).isEqualTo(1);
        assertThat(window.getValue().getPageSize()).isEqualTo(20);
    }

    @Test
    void theFollowersOffsetIsROWSNotAPageIndex() {
        // v387's lesson, carried over from the following direction rather than learned again: the
        // offset means ROWS, and PageRequest speaks PAGES. The rows from 40 on are page 2 — not
        // page 40, which is rows 800–819 and what a pager would then call "past the end".
        when(repository.findByFolloweeAccountIdOrderByCreatedAtDesc(eq("acct-bob"), any(Pageable.class)))
                .thenReturn(List.of());
        when(repository.countByFolloweeAccountId("acct-bob")).thenReturn(37L);

        service.followersOf("acct-bob", null, 20, 40);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByFolloweeAccountIdOrderByCreatedAtDesc(eq("acct-bob"), window.capture());
        assertThat(window.getValue().getPageNumber()).isEqualTo(2);
        assertThat(window.getValue().getPageSize()).isEqualTo(20);
    }

    @Test
    void aNegativeFollowersOffsetIsTheFirstWindow() {
        // A page before the first does not exist; the newest rows are the honest answer, not a refusal.
        when(repository.findByFolloweeAccountIdOrderByCreatedAtDesc(eq("acct-bob"), any(Pageable.class)))
                .thenReturn(List.of());
        when(repository.countByFolloweeAccountId("acct-bob")).thenReturn(37L);

        service.followersOf("acct-bob", null, 20, -5);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByFolloweeAccountIdOrderByCreatedAtDesc(eq("acct-bob"), window.capture());
        assertThat(window.getValue().getPageNumber()).isZero();
    }

    @Test
    void aWindowPastTheEndIsAnEmptyAnswerNotARefusal() {
        // The count still says 37, so the reader is told the whole number and shown none of it —
        // which is what "past the end" means, and the reason the count travels beside the window.
        when(repository.findByFolloweeAccountIdOrderByCreatedAtDesc(eq("acct-bob"), any(Pageable.class)))
                .thenReturn(List.of());
        when(repository.countByFolloweeAccountId("acct-bob")).thenReturn(37L);

        FollowService.FollowResult result = service.followersOf("acct-bob", null, 20, 100);

        assertThat(result.followers()).isEmpty();
        assertThat(result.followerCount()).isEqualTo(37L);
    }
}
