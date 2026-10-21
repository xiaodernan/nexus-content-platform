package dev.nexus.api.social;

import dev.nexus.api.ops.AuditService;
import dev.nexus.api.social.CommentDtos.CommentClaim;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * M7 v285 — COMMENTS, as four rules.
 *
 * <p>A comment is the first social act here that says something, and saying something is where the
 * rules get sharp: a comment with no author is unattributable, a comment with an unbounded body is a
 * way to fill the table, a comment that can be deleted by anybody is a comment nobody can stand behind,
 * and a comment that vanishes when it is removed is a comment nobody can audit.
 *
 * <ol>
 *   <li><b>A comment needs an ACCOUNT.</b> The same reason a like does (v283): an authorless comment
 *       has nobody to take it back and nobody to answer to. The service refuses such a comment BY NAME.
 *   <li><b>The body must be a body.</b> A blank body is refused (there is no honest reading of "a
 *       comment that says nothing"), and an ABSURDLY LONG one is refused too, with the limit named \u2014
 *       "as much as you will give me" is a legitimate thing to say about a like, and not about a
 *       paragraph. The body is stored VERBATIM: the service is a record, not an interpreter, and the
 *       client\u2019s own model says the body arrives already escaped.
 *   <li><b>Only the author takes their comment back</b> \u2014 and the take-back is SOFT. The row stays with
 *       {@code deleted = true}, because \u201cthis comment was removed\u201d and \u201cthis comment never existed\u201d
 *       are different facts, and a hard delete would make the first indistinguishable from the second.
 *   <li><b>Reading a comment list says how many are VISIBLE.</b> The service reports the rows and the
 *       visible count together, because a list of ten of which four were removed must not be read as
 *       \u201cthere are ten comments\u201d.
 * </ol>
 *
 * <p><b>What this service does NOT do, stated rather than implied:</b> it does not check that the
 * publication exists, and it does not verify the account \u2014 the same posture the publish service takes
 * (it records a claim and verifies nothing \u2014 ADR 0018).
 *
 * <p>{@link Clock} is injected rather than calling {@code Instant.now()} inline, so a test can pin the
 * instant it comments at.
 */
@Service
public class CommentService {

    /** Long enough for a real project id, short enough that it cannot be used to fill the table with one row. */
    static final int MAX_PROJECT_ID_LENGTH = 200;

    /** Long enough for a real account id, short enough that it cannot be used to fill the table with one row. */
    static final int MAX_ACCOUNT_ID_LENGTH = 200;

    /**
     * The longest body the service accepts. A comment is a paragraph, not a document: this is generous
     * for a remark and absurd for a paste, and the limit is NAMED in the refusal so the caller knows
     * which rule it broke.
     */
    public static final int MAX_BODY_LENGTH = 4000;

    /** The most comments one answer may carry. The cap is CLAMPED rather than refused, like every cap here. */
    public static final int MAX_COMMENT_LIMIT = 100;

    /** How many comments an answer carries when the caller names no limit. */
    public static final int DEFAULT_COMMENT_LIMIT = 20;

    private final CommentRepository repository;
    private final Clock clock;
    /** v289 — the TRAIL. The comment is something that happened to a publication, so it is written down. */
    private final AuditService audit;

    public CommentService(CommentRepository repository, Clock clock, AuditService audit) {
        this.repository = repository;
        this.clock = clock;
        this.audit = audit;
    }

    /**
     * The comments of one publication, and how many of them are VISIBLE.
     *
     * <p>Deleted comments are returned too \u2014 with their flag set \u2014 because a reader who can see that a
     * comment was removed is better served than a reader who cannot tell a quiet thread from a deleted
     * one. The visible count is stated beside the rows so the two cannot be confused.
     */
    public record CommentResult(
            String projectId,
            List<CommentEntry> comments,
            /**
             * v354 — how many comments are VISIBLE, over the WHOLE table. The window's own count is a
             * fact about the window; this is a fact about the thread.
             */
            long visible,
            /** How many of the SHOWN rows are visible — the window's own count, beside the whole one. */
            long shownVisible) {
    }

    /**
     * WRITE a comment.
     *
     * <p>The id is the service\u2019s own: a caller that named its own comment id could overwrite another
     * account\u2019s comment, and a comment is a thing that happened once.
     */
    @Transactional
    public CommentEntry comment(String targetProjectId, CommentClaim claim, String body) {
        String target = requireUsableProjectId(targetProjectId);
        String account = requireAccount(claim);
        String text = requireBody(body);
        Instant when = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        CommentEntry row = new CommentEntry(
                UUID.randomUUID().toString(),
                target,
                account,
                claim == null ? null : claim.handle(),
                claim == null ? null : claim.assurance(),
                text,
                when);
        CommentEntry saved = repository.save(row);
        // v289 — the trail, INSIDE this transaction: a rolled-back comment leaves no entry claiming a
        // comment was made.
        audit.record("comment", account, claim == null ? null : claim.handle(), claim == null ? null : claim.assurance(), target);
        return saved;
    }

    /**
     * TAKE a comment back \u2014 and only the author\u2019s own.
     *
     * <p>Somebody else\u2019s take-back is REFUSED, not silently ignored: a caller that asked to remove
     * something and was told \u201cfine\u201d would believe it is gone. And a comment that is already removed is
     * \u201calready removed\u201d, not a failure: the URL names a comment, not a resource that must exist.
     */
    @Transactional
    public boolean delete(String commentId, CommentClaim claim) {
        if (commentId == null || commentId.isBlank()) {
            throw new InvalidComment("commentId must not be blank");
        }
        String account = requireAccount(claim);
        Optional<CommentEntry> found = repository.findByCommentId(commentId.trim());
        if (found.isEmpty()) {
            return false;
        }
        CommentEntry row = found.get();
        if (!row.getAuthorAccountId().equals(account)) {
            throw new NotYourComment("comment " + commentId.trim() + " was written by another account, and only its author may take it back");
        }
        if (row.isDeleted()) {
            return false;
        }
        row.markDeleted();
        repository.save(row);
        // v289 — the trail says the comment was removed by its author.
        audit.record("uncomment", account, claim == null ? null : claim.handle(), claim == null ? null : claim.assurance(), row.getTargetProjectId());
        return true;
    }

    /** The comments of one publication, newest first, and how many of them are visible. */
    @Transactional(readOnly = true)
    public CommentResult commentsOf(String targetProjectId, int limit) {
        String target = requireUsableProjectId(targetProjectId);
        int asked = limit <= 0 ? DEFAULT_COMMENT_LIMIT : Math.min(limit, MAX_COMMENT_LIMIT);
        List<CommentEntry> comments = repository.findByTargetProjectIdOrderByCreatedAtDesc(target, PageRequest.of(0, asked));
        // v354 — the WHOLE thread's visible count (the database's count) beside the window's own.
        // Quoting the window as if it were the thread would be the same kind of lie the bars were just
        // fixed for: a page that says "3 comments" when the thread holds thirty-four.
        long shownVisible = comments.stream().filter(c -> !c.isDeleted()).count();
        long visible = repository.countByTargetProjectIdAndDeletedFalse(target);
        return new CommentResult(target, comments, visible, shownVisible);
    }

    /**
     * v335 — the comments one account WROTE, newest first.
     *
     * <p>The other side of the same relation, and the same shape the tip had (v332): the repository has
     * had the finder for the author's side since v285 without a service method or a door for it. A reader
     * who wrote a comment could not see what they had written — and a comment is a thing a person might
     * want to find again, or take back.
     */
    @Transactional(readOnly = true)
    public List<CommentEntry> commentsWritten(String authorAccountId, int limit) {
        if (authorAccountId == null || authorAccountId.isBlank()) {
            throw new InvalidComment("a comment needs an account to be from");
        }
        String author = authorAccountId.trim();
        int asked = limit <= 0 ? DEFAULT_COMMENT_LIMIT : Math.min(limit, MAX_COMMENT_LIMIT);
        return repository.findByAuthorAccountIdOrderByCreatedAtDesc(author, PageRequest.of(0, asked));
    }

    /** A project id must be a usable path segment: not blank, not absurdly long. */
    private static String requireUsableProjectId(String projectId) {
        if (projectId == null || projectId.isBlank()) {
            throw new InvalidComment("projectId must not be blank");
        }
        String trimmed = projectId.trim();
        if (trimmed.length() > MAX_PROJECT_ID_LENGTH) {
            throw new InvalidComment("projectId must be at most " + MAX_PROJECT_ID_LENGTH + " characters, got " + trimmed.length());
        }
        return trimmed;
    }

    /** Rule 1: a comment needs an account. */
    private static String requireAccount(CommentClaim claim) {
        if (claim == null) {
            throw new InvalidComment("a comment needs an account: a comment with no author has nobody to take it back and nobody to answer to");
        }
        String account = claim.accountId();
        if (account == null || account.isBlank()) {
            throw new InvalidComment("a comment needs an account: a comment with no author has nobody to take it back and nobody to answer to");
        }
        String trimmed = account.trim();
        if (trimmed.length() > MAX_ACCOUNT_ID_LENGTH) {
            throw new InvalidComment("accountId must be at most " + MAX_ACCOUNT_ID_LENGTH + " characters, got " + trimmed.length());
        }
        return trimmed;
    }

    /**
     * Rule 2: the body must be a body \u2014 not blank, and not absurdly long.
     *
     * <p>The body is stored VERBATIM. The client\u2019s own model says the body arrives already escaped, and
     * the service does not escape it: a service that escaped on the way in would store something a
     * reader sees twice-escaped, and the caller that escaped it cannot un-escape it.
     */
    private static String requireBody(String body) {
        if (body == null || body.isBlank()) {
            throw new InvalidComment("a comment must say something: a blank body is not a comment");
        }
        String text = body.trim();
        if (text.length() > MAX_BODY_LENGTH) {
            throw new InvalidComment("a comment must be at most " + MAX_BODY_LENGTH + " characters, got " + text.length());
        }
        return text;
    }
}
