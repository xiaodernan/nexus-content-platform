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
import dev.nexus.api.social.CommentDtos.CommentClaim;
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
 * The four rules {@link CommentService} owns, and the two behaviours that are not rules: the visible
 * count, and the \u201calready removed\u201d answer.
 *
 * <p>No Spring context and no database here on purpose \u2014 these cases are about what the service decides.
 * The clock is PINNED, so the instant a comment records is asserted rather than read back and compared
 * to itself.
 */
@ExtendWith(MockitoExtension.class)
class CommentServiceTest {

    private static final Instant AT = Instant.parse("2026-10-20T12:00:00Z");

    @Mock
    private CommentRepository repository;

    /** v289 — the TRAIL the social verbs write into. A mock, because these cases grade the social rules;
     *  the trail's own rules are graded in {@code AuditServiceTest}. */
    @Mock
    private AuditService audit;

    private CommentService service;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(AT, ZoneOffset.UTC);
        service = new CommentService(repository, clock, audit);
    }

    private static CommentClaim claim(String accountId) {
        return new CommentClaim(accountId, "ada", "unsigned-local", 1_700_000_000_000L);
    }

    private static CommentEntry row(String id, String account, boolean deleted) {
        CommentEntry entry = new CommentEntry(id, "pub-1", account, "ada", "unsigned-local", "nice work", AT);
        if (deleted) entry.markDeleted();
        return entry;
    }

    // ── rule 1: a comment needs an ACCOUNT ──────────────────────────────────────────────────────────

    @Test
    void aCommentWithNoClaimIsREFUSEDByName() {
        assertThatThrownBy(() -> service.comment("pub-1", null, "nice work"))
                .isInstanceOf(InvalidComment.class)
                .hasMessageContaining("needs an account")
                .hasMessageContaining("nobody to take it back");
        verify(repository, never()).save(any());
    }

    @Test
    void aCommentWithABlankAccountIsREFUSEDTheSameWay() {
        assertThatThrownBy(() -> service.comment("pub-1", claim("   "), "nice work"))
                .isInstanceOf(InvalidComment.class)
                .hasMessageContaining("needs an account");
    }

    // ── rule 2: the body must be a body ────────────────────────────────────────────────────────────

    @Test
    void aBlankBodyIsREFUSEDByName() {
        assertThatThrownBy(() -> service.comment("pub-1", claim("acct-ada"), "   "))
                .isInstanceOf(InvalidComment.class)
                .hasMessageContaining("must say something");
        verify(repository, never()).save(any());
    }

    @Test
    void anAbsurdlyLongBodyIsREFUSEDWithTheLimitNamed() {
        String huge = "x".repeat(CommentService.MAX_BODY_LENGTH + 1);
        assertThatThrownBy(() -> service.comment("pub-1", claim("acct-ada"), huge))
                .isInstanceOf(InvalidComment.class)
                .hasMessageContaining("at most " + CommentService.MAX_BODY_LENGTH + " characters");
    }

    @Test
    void theBodyIsStoredVERBATIM_andTheServiceDoesNotEscapeIt() {
        when(repository.save(any(CommentEntry.class))).thenAnswer(i -> i.getArgument(0));
        // The client\u2019s own model says the body arrives already escaped. A service that escaped on the way
        // in would store something a reader sees twice-escaped.
        String escaped = "&lt;script&gt;x&lt;/script&gt;";

        CommentEntry row = service.comment("pub-1", claim("acct-ada"), escaped);

        assertThat(row.getBody()).isEqualTo(escaped);
    }

    @Test
    void theBodyIsTrimmed() {
        when(repository.save(any(CommentEntry.class))).thenAnswer(i -> i.getArgument(0));
        CommentEntry row = service.comment("pub-1", claim("acct-ada"), "  nice work  ");
        assertThat(row.getBody()).isEqualTo("nice work");
    }

    @Test
    void theCommentRecordsTheSERVICEsInstant() {
        when(repository.save(any(CommentEntry.class))).thenAnswer(i -> i.getArgument(0));
        CommentEntry row = service.comment("pub-1", claim("acct-ada"), "nice work");
        assertThat(row.getCreatedAt()).isEqualTo(AT);
    }

    @Test
    void theCommentIdIsTheSERVICEsOwn() {
        when(repository.save(any(CommentEntry.class))).thenAnswer(i -> i.getArgument(0));
        CommentEntry row = service.comment("pub-1", claim("acct-ada"), "nice work");
        // A caller that named its own comment id could overwrite another account\u2019s comment.
        assertThat(row.getCommentId()).isNotBlank();
        assertThat(row.getCommentId()).isNotEqualTo("pub-1");
    }

    // ── rule 3: only the author takes it back, and the take-back is SOFT ───────────────────────────

    @Test
    void takingBackSomebodyElsesCommentIsREFUSEDAndChangesNothing() {
        when(repository.findByCommentId("c-1")).thenReturn(Optional.of(row("c-1", "acct-someone-else", false)));

        assertThatThrownBy(() -> service.delete("c-1", claim("acct-ada")))
                .isInstanceOf(NotYourComment.class)
                .hasMessageContaining("only its author may take it back");
        verify(repository, never()).save(any());
    }

    @Test
    void takingBackYourOwnCommentMARKSItDeletedAndKeepsTheRow() {
        CommentEntry mine = row("c-1", "acct-ada", false);
        when(repository.findByCommentId("c-1")).thenReturn(Optional.of(mine));
        when(repository.save(any(CommentEntry.class))).thenAnswer(i -> i.getArgument(0));

        boolean removed = service.delete("c-1", claim("acct-ada"));

        assertThat(removed).isTrue();
        assertThat(mine.isDeleted()).isTrue();
        // The row stays: \u201cremoved\u201d and \u201cnever existed\u201d are different facts.
        verify(repository, times(1)).save(mine);
    }

    @Test
    void takingBackACommentThatIsAlreadyGoneIsALREADY_GONEAndNotAFailure() {
        when(repository.findByCommentId("c-1")).thenReturn(Optional.of(row("c-1", "acct-ada", true)));

        boolean removed = service.delete("c-1", claim("acct-ada"));

        assertThat(removed).isFalse();
        verify(repository, never()).save(any());
    }

    @Test
    void takingBackACommentThatDoesNotExistIsALREADY_GONE() {
        when(repository.findByCommentId("c-none")).thenReturn(Optional.empty());
        assertThat(service.delete("c-none", claim("acct-ada"))).isFalse();
    }

    @Test
    void takingBackACommentNeedsAnAccount() {
        assertThatThrownBy(() -> service.delete("c-1", null)).isInstanceOf(InvalidComment.class);
    }

    // ── rule 4: the list says how many are VISIBLE ────────────────────────────────────────────────

    @Test
    void theListCarriesTheRowsAndTheVisibleCount() {
        when(repository.findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), any(Pageable.class)))
                .thenReturn(List.of(row("c-1", "acct-ada", false), row("c-2", "acct-bob", true), row("c-3", "acct-ada", false)));
        when(repository.countByTargetProjectIdAndDeletedFalse("pub-1")).thenReturn(2L);
        when(repository.countByTargetProjectId("pub-1")).thenReturn(3L);

        CommentService.CommentResult result = service.commentsOf("pub-1", 20, 0);

        assertThat(result.comments()).hasSize(3);
        // A list of three of which one was removed must not be read as "there are three comments".
        assertThat(result.visible()).isEqualTo(2);
        // v354 — and the WINDOW's own count, beside the whole thread's: the two are different sizes and
        // the caller needs both to say which is which.
        assertThat(result.shownVisible()).isEqualTo(2);
        // v399 — and the thread's ROW count, the removed ones included: the number a pager pages by.
        assertThat(result.total()).isEqualTo(3L);
    }

    // ── v354: the visible count is the WHOLE THREAD's, not the window's ────────────────────────────

    @Test
    void theVisibleCountIsTheWholeThreadsNotTheWindows() {
        // The window holds three rows, of which one was taken back; the thread itself holds thirty-four
        // visible comments. A page that quoted the window would say "2 comments" about a thread of
        // thirty-four, and that is the kind of small lie this house does not tell.
        when(repository.findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), any(Pageable.class)))
                .thenReturn(List.of(row("c-1", "acct-ada", false), row("c-2", "acct-bob", true), row("c-3", "acct-ada", false)));
        when(repository.countByTargetProjectIdAndDeletedFalse("pub-1")).thenReturn(34L);
        when(repository.countByTargetProjectId("pub-1")).thenReturn(50L);

        CommentService.CommentResult result = service.commentsOf("pub-1", 20, 0);

        assertThat(result.visible()).isEqualTo(34L);
        assertThat(result.shownVisible()).isEqualTo(2);
        // v399 — and the rows are not the visible ones: thirty-four visible in a thread of fifty
        // rows, because sixteen of them were taken back. A pager that used the visible count as its
        // end would stop a reader sixteen rows short of it.
        assertThat(result.total()).isEqualTo(50L);
    }

    @Test
    void aBlankProjectIdIsRefusedByName() {
        assertThatThrownBy(() -> service.commentsOf("   ", 20, 0))
                .isInstanceOf(InvalidComment.class)
                .hasMessageContaining("projectId must not be blank");
    }

    @Test
    void theLimitIsClampedRatherThanRefused() {
        when(repository.findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), any(Pageable.class)))
                .thenReturn(List.of());

        when(repository.countByTargetProjectId("pub-1")).thenReturn(0L);

        service.commentsOf("pub-1", 10_000, 0);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(CommentService.MAX_COMMENT_LIMIT);
    }

    @Test
    void aNonPositiveLimitIsTheDefaultRatherThanZero() {
        when(repository.findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), any(Pageable.class)))
                .thenReturn(List.of());

        when(repository.countByTargetProjectId("pub-1")).thenReturn(0L);

        service.commentsOf("pub-1", 0, 0);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(CommentService.DEFAULT_COMMENT_LIMIT);
    }

    // ── v399: the THREAD can be PAGED, in rows ────────────────────────────────────────────

    @Test
    void theThreadCanBePagedInRows() {
        // v399 — the thread has been a WINDOW since v286 (the service caps at a hundred comments), and a
        // window nobody can page is the whole thread to a reader on a longer one. The offset is ROWS:
        // asking for the rows from 20 on is page 1 of a 20-row window, which is what the captor pins.
        when(repository.findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), any(Pageable.class)))
                .thenReturn(List.of());
        when(repository.countByTargetProjectId("pub-1")).thenReturn(50L);

        service.commentsOf("pub-1", 20, 20);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), window.capture());
        assertThat(window.getValue().getPageNumber()).isEqualTo(1);
        assertThat(window.getValue().getPageSize()).isEqualTo(20);
    }

    @Test
    void theThreadOffsetIsROWSNotAPageIndex() {
        // v387’s lesson, carried over rather than learned again: the offset means ROWS, and PageRequest
        // speaks PAGES. The rows from 40 on are page 2 — not page 40 (rows 800–819), which is what handing the
        // raw number to PageRequest.of answers, and what a pager would then call “past the end”.
        when(repository.findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), any(Pageable.class)))
                .thenReturn(List.of());
        when(repository.countByTargetProjectId("pub-1")).thenReturn(50L);

        service.commentsOf("pub-1", 20, 40);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), window.capture());
        assertThat(window.getValue().getPageNumber()).isEqualTo(2);
        assertThat(window.getValue().getPageSize()).isEqualTo(20);
    }

    @Test
    void aNegativeThreadOffsetIsTheFirstWindow() {
        // A page before the first does not exist; the newest comments are the honest answer to a
        // question about one, not a refusal.
        when(repository.findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), any(Pageable.class)))
                .thenReturn(List.of());
        when(repository.countByTargetProjectId("pub-1")).thenReturn(50L);

        service.commentsOf("pub-1", 20, -5);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), window.capture());
        assertThat(window.getValue().getPageNumber()).isZero();
    }

    @Test
    void theTotalCountsTheRemovedRowsThePagerPagesBy() {
        // v399 — the pager pages by ROWS, so the answer carries the thread’s ROW count, the removed ones
        // included. Thirty-four visible comments in a thread of fifty rows: a pager that used the visible
        // count as its end would stop a reader sixteen rows short of it.
        when(repository.findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), any(Pageable.class)))
                .thenReturn(List.of(row("c-1", "acct-ada", false), row("c-2", "acct-bob", true), row("c-3", "acct-ada", false)));
        when(repository.countByTargetProjectIdAndDeletedFalse("pub-1")).thenReturn(34L);
        when(repository.countByTargetProjectId("pub-1")).thenReturn(50L);

        CommentService.CommentResult result = service.commentsOf("pub-1", 20, 0);

        assertThat(result.total()).isEqualTo(50L);
        assertThat(result.visible()).isEqualTo(34L);
    }
    // ── v335: the comments one account WROTE ───────────────────────────

    @Test
    void theCommentsOneAccountWroteAreReadNewestFirst() {
        // The other side of the same relation: the repository has had the finder for the author's side
        // since v285 without a service method or a door for it.
        CommentEntry mine = new CommentEntry(
                "c-1", "pub-1", "acct-bob", "bob", "unsigned-local", "nice", AT);
        when(repository.findByAuthorAccountIdOrderByCreatedAtDesc(eq("acct-bob"), any(Pageable.class)))
                .thenReturn(List.of(mine));

        assertThat(service.commentsWritten("acct-bob", 20)).containsExactly(mine);
    }

    @Test
    void aCommentQuestionWithNoAuthorIsREFUSEDByName() {
        assertThatThrownBy(() -> service.commentsWritten("  ", 20))
                .isInstanceOf(InvalidComment.class)
                .hasMessageContaining("needs an account");
    }

    // ── v289: the trail ───────────────────────────────────────────────────────────────────────────

    @Test
    void aNEWCommentIsWRITTENToTheTrail() {
        when(repository.save(any(CommentEntry.class))).thenAnswer(i -> i.getArgument(0));

        service.comment("pub-1", claim("acct-ada"), "nice work");

        // A comment is something that happened to a publication, so the trail says it happened.
        verify(audit).record("comment", "acct-ada", "ada", "unsigned-local", "pub-1", AuditService.TARGET_PUBLICATION);
    }

    @Test
    void aREFUSEDCommentIsNOTWrittenToTheTrail() {
        assertThatThrownBy(() -> service.comment("pub-1", claim("acct-ada"), "   ")).isInstanceOf(InvalidComment.class);

        verify(audit, never()).record(any(), any(), any(), any(), any(), any());
    }
}

