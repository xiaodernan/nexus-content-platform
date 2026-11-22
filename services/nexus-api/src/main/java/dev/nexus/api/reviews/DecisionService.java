package dev.nexus.api.reviews;

import static dev.nexus.api.incidents.IncidentService.appliedOffset;
import static dev.nexus.api.incidents.IncidentService.effectiveLimit;

import dev.nexus.api.patches.PatchService;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * M9 v869 — the chain's fourth word: a review request gets a verdict.
 *
 * <p>The service records ONE decision and moves the chain's cursor. It does not merge, does not apply the
 * patch, does not deploy anything, and does not decide whether the bytes fit a tree it does not own. What it
 * can defend is the record: this verdict, this reason, this reviewer, this request, this instant.
 *
 * <p>Rules, refused by name:
 *
 * <ul>
 *   <li>The request must exist — 404 {@code unknown-pull-request}, checked BEFORE the fields.
 *   <li>The verdict is exactly one of {@value #APPROVED} / {@value #REJECTED}. No case folding: {@code
 *       Approved} is a different value and is refused with the vocabulary named.
 *   <li>The optional reason and reviewer are trimmed, blank → null, and bounded by their columns.
 *   <li>A request may be decided ONCE — 409 {@code already-decided}. The gate is NOT a count-then-write:
 *       {@link PullRequestRepository#closeIfOpen} puts {@code status = 'open'} in the UPDATE itself, so two
 *       concurrent verdicts cannot both move the row. The request that loses the race reads 0 moved rows.
 * </ul>
 *
 * <p>In ONE transaction the request's status becomes the verdict word, the patch moves with it ({@code
 * approved}, or back to {@code proposed} on a rejection so it can be revised and resubmitted), and this row
 * is written. Three records cannot disagree because no reader can see a state between them.
 *
 * <p>No audit entry and no webhook delivery: the decision table is the record, like the three tables before
 * it. The listing is scoped to the request and uses the same window rule, CALLED rather than copied.
 */
@Service
public class DecisionService {

    /** The reason column's width. */
    public static final int MAX_REASON = 2000;

    /** The width of the reviewer column. */
    public static final int MAX_ACTOR = 120;

    /** The two words a verdict may be — and the two statuses the request may become. */
    public static final String APPROVED = "approved";

    /** The other verdict. */
    public static final String REJECTED = "rejected";

    /** The closed vocabulary, in the order the refusal prints it. */
    public static final List<String> VERDICTS = List.of(APPROVED, REJECTED);

    private final DecisionRepository repository;
    private final PullRequestService requests;
    private final PatchService patches;
    private final Clock clock;

    public DecisionService(
            DecisionRepository repository,
            PullRequestService requests,
            PatchService patches,
            Clock clock) {
        this.repository = repository;
        this.requests = requests;
        this.patches = patches;
        this.clock = clock;
    }

    /**
     * Decide one open review request.
     *
     * @return the stored decision, so the 201 answers with exactly what was written
     */
    @Transactional
    public PullRequestDecision decide(String pullRequestId, String verdict, String reason, String decidedBy) {
        PatchPullRequest request = requests.read(pullRequestId);
        String cleanVerdict = requireVerdict(verdict);
        String cleanReason = optionalBounded(reason, MAX_REASON, "reason");
        String cleanActor = optionalBounded(decidedBy, MAX_ACTOR, "decidedBy");

        int moved = requests.closeIfOpen(request.getPullRequestId(), cleanVerdict);
        if (moved == 0) {
            throw new AlreadyDecided("pull request \"" + request.getPullRequestId()
                    + "\" is no longer open — a verdict was already recorded for it");
        }
        if (APPROVED.equals(cleanVerdict)) {
            patches.approve(request.getPatchId());
        } else {
            patches.revise(request.getPatchId());
        }
        PullRequestDecision row = new PullRequestDecision(
                UUID.randomUUID().toString(),
                request.getPullRequestId(),
                cleanVerdict,
                cleanReason,
                cleanActor,
                clock.instant().truncatedTo(ChronoUnit.MICROS));
        return repository.save(row);
    }

    /**
     * The request's decisions, newest first.
     *
     * <p>The request is read first so an unknown id is 404 {@code unknown-pull-request} rather than an empty
     * window: "nobody decided" and "there is no such request" are different answers.
     */
    @Transactional(readOnly = true)
    public List<PullRequestDecision> list(String pullRequestId, int limit, int offset) {
        requests.read(pullRequestId);
        int effective = effectiveLimit(limit);
        PageRequest window = PageRequest.of(appliedOffset(offset, effective) / effective, effective);
        return repository.findByPullRequestIdOrderByDecidedAtDescDecisionIdDesc(pullRequestId, window);
    }

    /** How many decisions that request holds in total — the number the window cannot answer. */
    @Transactional(readOnly = true)
    public long count(String pullRequestId) {
        requests.read(pullRequestId);
        return repository.countByPullRequestId(pullRequestId);
    }

    /** One decision by id. An id that names nothing is {@link NoSuchDecision}. */
    @Transactional(readOnly = true)
    public PullRequestDecision read(String decisionId) {
        String id = requireId(decisionId);
        return repository.findById(id)
                .orElseThrow(() -> new NoSuchDecision("decision \"" + id + "\" does not exist"));
    }

    private static String requireVerdict(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidDecision("a decision needs a verdict — one of " + String.join(" / ", VERDICTS));
        }
        if (!VERDICTS.contains(raw)) {
            throw new InvalidDecision("the verdict \"" + raw + "\" is not one of " + String.join(" / ", VERDICTS)
                    + " — the vocabulary is closed and is matched exactly");
        }
        return raw;
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
            throw new InvalidDecision("the decision " + field + " is at most " + max
                    + " characters — this one is " + trimmed.length());
        }
        return trimmed;
    }

    /** An id is a value, not a spelling: no trimming, no case folding. */
    static String requireId(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidDecision("a decision id is required");
        }
        return raw;
    }
}
