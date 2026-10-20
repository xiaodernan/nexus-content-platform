package dev.nexus.api.social;

import dev.nexus.api.social.ReportDtos.ReportClaim;
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
 * M7 v295 — REPORTS, as four rules.
 *
 * <p>A report is the one social act here that asks somebody else to do something, and that is why its
 * rules are about restraint as much as about recording:
 *
 * <ol>
 *   <li><b>A report needs an ACCOUNT.</b> The reporter is the claim's account, and a report with no
 *       reporter cannot be followed up — nobody can ask the person who filed it what they meant. The
 *       service refuses such a report BY NAME.
 *   <li><b>The reason is one of FOUR.</b> A closed set, so a reader can count by reason and a caller
 *       cannot invent a fifth. The refusal NAMES the four, because a caller that is told only "no" has
 *       to guess.
 *   <li><b>The detail is bounded.</b> The reason alone is a report; the detail is the reporter's words,
 *       and words have a length.
 *   <li><b>The same account cannot report the same publication for the same reason twice.</b> The
 *       UNIQUE constraint is the DATABASE's rule, and the service asks the repository first so the
 *       refusal can be a NAMED refusal rather than a constraint violation.
 * </ol>
 *
 * <p><b>What this service does NOT do:</b> it does not check that the publication exists, and it does
 * not verify the account — the same posture the publish service takes (it records a claim and verifies
 * nothing — ADR 0018).
 *
 * <p><b>The statuses:</b> a report is filed `open`. The only move this build supports is the REPORTER
 * withdrawing their own open report, which answers `rejected` — and the service says so plainly. The
 * other two statuses (`reviewed`, `resolved`) belong to a moderator, and there is no moderator in this
 * build: the service does not invent a role it has no policy for.
 */
@Service
public class ReportService {

    /** Long enough for a real project id, short enough that it cannot be used to fill the table with one row. */
    static final int MAX_PROJECT_ID_LENGTH = 200;

    /** Long enough for a real account id, short enough that it cannot be used to fill the table with one row. */
    static final int MAX_ACCOUNT_ID_LENGTH = 200;

    /** The longest detail the service accepts. A report's detail is a remark, not a document. */
    public static final int MAX_DETAIL_LENGTH = 2000;

    /** The most reports one answer may carry. The cap is CLAMPED rather than refused, like every cap here. */
    public static final int MAX_REPORT_LIMIT = 100;

    /** How many reports an answer carries when the caller names no limit. */
    public static final int DEFAULT_REPORT_LIMIT = 20;

    private final ReportRepository repository;
    private final Clock clock;

    public ReportService(ReportRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    /**
     * FILE a report.
     *
     * @throws InvalidReport when a rule is broken
     */
    @Transactional
    public ReportEntry report(String targetProjectId, ReportClaim claim, String reason, String detail) {
        String target = requireUsableProjectId(targetProjectId);
        String reporter = requireAccount(claim == null ? null : claim.accountId());
        String why = requireReason(reason);
        String words = requireDetail(detail);
        Optional<ReportEntry> existing =
                repository.findByReporterAccountIdAndTargetProjectIdAndReason(reporter, target, why);
        if (existing.isPresent()) {
            throw new InvalidReport(
                    "this account has already reported this publication as " + why + "; a second report would be the same report");
        }
        Instant when = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        ReportEntry row = new ReportEntry(
                UUID.randomUUID().toString(),
                target,
                reporter,
                claim == null ? null : claim.handle(),
                claim == null ? null : claim.assurance(),
                why,
                words,
                ReportDtos.STATUS_OPEN,
                when);
        return repository.save(row);
    }

    /**
     * WITHDRAW a report — and only the reporter's own.
     *
     * <p>Somebody else's withdrawal is REFUSED, because a caller that asked to withdraw something and was
     * told "fine" would believe it was withdrawn. A report that is already withdrawn is "already
     * withdrawn", not a failure.
     */
    @Transactional
    public boolean withdraw(String reportId, ReportClaim claim) {
        if (reportId == null || reportId.isBlank()) {
            throw new InvalidReport("reportId must not be blank");
        }
        String reporter = requireAccount(claim == null ? null : claim.accountId());
        Optional<ReportEntry> found = repository.findByReportId(reportId.trim());
        if (found.isEmpty()) {
            return false;
        }
        ReportEntry row = found.get();
        if (!row.getReporterAccountId().equals(reporter)) {
            throw new NotYourReport(
                    "report " + reportId.trim() + " was filed by another account, and only its reporter may withdraw it");
        }
        if (!ReportDtos.STATUS_OPEN.equals(row.getStatus())) {
            return false;
        }
        // The status moves FORWARD and the row stays: a report that was withdrawn is a fact that happened.
        row.markRejected();
        repository.save(row);
        return true;
    }

    /** The reports about one publication, newest first, and how many the answer carried. */
    @Transactional(readOnly = true)
    public List<ReportEntry> reportsOf(String targetProjectId, int limit) {
        String target = requireUsableProjectId(targetProjectId);
        int asked = limit <= 0 ? DEFAULT_REPORT_LIMIT : Math.min(limit, MAX_REPORT_LIMIT);
        return repository.findByTargetProjectIdOrderByCreatedAtDesc(target, PageRequest.of(0, asked));
    }

    /** How many reports a publication has. */
    @Transactional(readOnly = true)
    public long countOf(String targetProjectId) {
        return repository.countByTargetProjectId(requireUsableProjectId(targetProjectId));
    }

    private static String requireUsableProjectId(String projectId) {
        if (projectId == null || projectId.isBlank()) {
            throw new InvalidReport("projectId must not be blank");
        }
        String trimmed = projectId.trim();
        if (trimmed.length() > MAX_PROJECT_ID_LENGTH) {
            throw new InvalidReport("projectId must be at most " + MAX_PROJECT_ID_LENGTH + " characters, got " + trimmed.length());
        }
        return trimmed;
    }

    /** Rule 1: a report needs an account. */
    private static String requireAccount(String accountId) {
        if (accountId == null || accountId.isBlank()) {
            throw new InvalidReport("a report needs an account: a report with no reporter cannot be followed up");
        }
        String trimmed = accountId.trim();
        if (trimmed.length() > MAX_ACCOUNT_ID_LENGTH) {
            throw new InvalidReport("accountId must be at most " + MAX_ACCOUNT_ID_LENGTH + " characters, got " + trimmed.length());
        }
        return trimmed;
    }

    /** Rule 2: the reason is one of FOUR, and the refusal names them. */
    private static String requireReason(String reason) {
        if (reason == null || reason.isBlank()) {
            throw new InvalidReport(
                    "a report needs a reason: one of spam, harassment, illegal, other");
        }
        String trimmed = reason.trim();
        switch (trimmed) {
            case ReportDtos.REASON_SPAM:
            case ReportDtos.REASON_HARASSMENT:
            case ReportDtos.REASON_ILLEGAL:
            case ReportDtos.REASON_OTHER:
                return trimmed;
            default:
                throw new InvalidReport(
                        "a report's reason is one of spam, harassment, illegal, other — got " + trimmed);
        }
    }

    /** Rule 3: the detail is bounded. Empty is allowed: the reason alone is a report. */
    private static String requireDetail(String detail) {
        if (detail == null) {
            return "";
        }
        String trimmed = detail.trim();
        if (trimmed.length() > MAX_DETAIL_LENGTH) {
            throw new InvalidReport("a report's detail must be at most " + MAX_DETAIL_LENGTH + " characters, got " + trimmed.length());
        }
        return trimmed;
    }
}
