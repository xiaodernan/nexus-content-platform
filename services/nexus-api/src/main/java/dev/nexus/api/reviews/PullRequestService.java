package dev.nexus.api.reviews;

import static dev.nexus.api.incidents.IncidentService.appliedOffset;
import static dev.nexus.api.incidents.IncidentService.effectiveLimit;

import dev.nexus.api.patches.IncidentPatch;
import dev.nexus.api.patches.PatchService;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * M9 v868 — the third word of M9's chain: a patch put up for review.
 *
 * <p>The service records the REQUEST and moves the chain's cursor. It does not review, approve, reject,
 * merge or deploy anything: those are the chain's later words, and a door that looked like them and did
 * nothing would be worse than an absent one.
 *
 * <p>Rules, refused by name:
 *
 * <ul>
 *   <li>The patch must exist — 404 {@code unknown-patch}, checked BEFORE the fields, because a request with
 *       no patch is not a malformed request, it is a question about nothing.
 *   <li>The title is one line, trimmed, 1..{@value #MAX_TITLE}.
 *   <li>The optional summary and opener are trimmed, blank → null, and bounded by their columns.
 *   <li>A patch may have at most ONE open request — 409 {@code already-open}. Two open requests would make
 *       "which one is being reviewed" a question with no answer. The gate reads the request table, not the
 *       patch's status word, so the invariant is local to the table that owns it.
 * </ul>
 *
 * <p>When the request is written, {@link PatchService#submit} moves the patch {@code proposed → submitted}
 * in the SAME transaction: a request can never exist against a patch still marked proposed, and a patch is
 * never marked submitted without one. The diff is not copied here — the patch row is its only home.
 *
 * <p>The listing is scoped to the patch and ordered {@code openedAt DESC, pullRequestId DESC}. The window
 * rule (default 20, cap 100, floor 1, offset floored to the page that contains it) is the incident listing's
 * rule, CALLED rather than copied, so the caps cannot drift apart. No audit entry and no webhook delivery:
 * the request table is the record, like the two tables before it.
 */
@Service
public class PullRequestService {

    /** The title column's width. */
    public static final int MAX_TITLE = 120;

    /** The summary column's width. */
    public static final int MAX_SUMMARY = 2000;

    /** The width of the opener column. */
    public static final int MAX_ACTOR = 120;

    /** The only status this slice writes. The later words move it; this one does not. */
    public static final String OPEN = "open";

    /** The status a decision leaves behind when the review said yes — the deployment gate's reading. */
    public static final String APPROVED = "approved";

    /** The status a decision leaves behind when the review said no. */
    public static final String REJECTED = "rejected";

    private final PullRequestRepository repository;
    private final PatchService patches;
    private final Clock clock;

    public PullRequestService(PullRequestRepository repository, PatchService patches, Clock clock) {
        this.repository = repository;
        this.patches = patches;
        this.clock = clock;
    }

    /**
     * Put one patch up for review.
     *
     * @return the stored request, so the 201 answers with exactly what was written
     */
    @Transactional
    public PatchPullRequest open(String patchId, String title, String summary, String openedBy) {
        IncidentPatch patch = patches.read(patchId);
        String cleanTitle = requireTitle(title);
        String cleanSummary = optionalBounded(summary, MAX_SUMMARY, "summary");
        String cleanOpener = optionalBounded(openedBy, MAX_ACTOR, "openedBy");
        long alreadyOpen = repository.countByPatchIdAndStatus(patch.getPatchId(), OPEN);
        if (alreadyOpen > 0) {
            throw new AlreadyOpenPullRequest("patch \"" + patch.getPatchId()
                    + "\" already has an open review request — read it instead of opening a second");
        }
        patches.submit(patch.getPatchId());
        PatchPullRequest row = new PatchPullRequest(
                UUID.randomUUID().toString(),
                patch.getPatchId(),
                cleanTitle,
                cleanSummary,
                OPEN,
                cleanOpener,
                clock.instant().truncatedTo(ChronoUnit.MICROS));
        return repository.save(row);
    }

    /**
     * The patch's review requests, newest first.
     *
     * <p>The patch is read first so an unknown patch is 404 {@code unknown-patch} rather than an empty
     * window: "this patch was never reviewed" and "there is no such patch" are different answers.
     */
    @Transactional(readOnly = true)
    public List<PatchPullRequest> list(String patchId, int limit, int offset) {
        patches.read(patchId);
        int effective = effectiveLimit(limit);
        PageRequest window = PageRequest.of(appliedOffset(offset, effective) / effective, effective);
        return repository.findByPatchIdOrderByOpenedAtDescPullRequestIdDesc(patchId, window);
    }

    /** How many review requests that patch holds in total — the number the window cannot answer. */
    @Transactional(readOnly = true)
    public long count(String patchId) {
        patches.read(patchId);
        return repository.countByPatchId(patchId);
    }

    /** One request by id. An id that names nothing is {@link NoSuchPullRequest}. */
    @Transactional(readOnly = true)
    public PatchPullRequest read(String pullRequestId) {
        String id = requireId(pullRequestId);
        return repository.findById(id)
                .orElseThrow(() -> new NoSuchPullRequest("pull request \"" + id + "\" does not exist"));
    }

    /**
     * The chain's fourth word, from this table's side: close one OPEN request with a verdict. The predicate
     * lives in the UPDATE ({@link PullRequestRepository#closeIfOpen}), so the answer is 1 for the caller who
     * closed it and 0 for everyone else — a check-then-write gate cannot give that answer. Delegated so the
     * request table keeps one owner of its own status word.
     */
    @Transactional
    public int closeIfOpen(String pullRequestId, String status) {
        return repository.closeIfOpen(pullRequestId, status);
    }

    private static String requireTitle(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidPullRequest("a review request needs a title — the one line that says what is being reviewed");
        }
        String trimmed = raw.trim();
        if (trimmed.length() > MAX_TITLE) {
            throw new InvalidPullRequest("the review request title is at most " + MAX_TITLE
                    + " characters — this one is " + trimmed.length());
        }
        return trimmed;
    }

    /** An optional word: trimmed, blank becomes null, and its column width is refused rather than cut. */
    static String optionalBounded(String raw, int max, String field) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.length() > max) {
            throw new InvalidPullRequest("the review request " + field + " is at most " + max
                    + " characters — this one is " + trimmed.length());
        }
        return trimmed;
    }

    /** An id is a value, not a spelling: no trimming, no case folding. */
    static String requireId(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidPullRequest("a review request id is required");
        }
        return raw;
    }
}
