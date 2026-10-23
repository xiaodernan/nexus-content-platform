package dev.nexus.api.social;

import dev.nexus.api.ops.AuditService;
import dev.nexus.api.social.ReportDtos.ReportClaim;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
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
 *   <li><b>The same account cannot report the same publication for the same reason twice while the
 *       first report STANDS.</b> v383 made the rule time-aware: a report stands for a period and then
 *       expires, and an expired one no longer constrains a second — so the same account may say the same
 *       thing again once the first has lapsed. The service asks the repository first so the refusal can
 *       be a NAMED refusal, and the standing check is the service's own rule: a UNIQUE index cannot
 *       express "only while standing" (see {@link ReportEntry} for what that move costs and what it
 *       does not).
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

    /**
     * v383 — how long a report STANDS, as this service files them today.
     *
     * <p>A month: long enough that a complaint is seen and acted on, short enough that a publication
     * which was since fixed is not held down forever by a report about its old state. The ROW remembers
     * its own period (see {@link ReportEntry#getPeriod()}), so changing this constant changes what is
     * filed NEXT, never what already stands.
     */
    static final String STANDING_PERIOD = ReportDtos.PERIOD_MONTH;

    private final ReportRepository repository;
    private final Clock clock;
    /**
     * v311 — the TRAIL.
     *
     * <p>A report is something that HAPPENED to a publication — it is filed, and it can be withdrawn — so
     * it is written down. It is also the one social act that asks somebody else to do something, which is
     * exactly why a reader of the trail should be able to see that it was filed.
     */
    private final AuditService audit;

    public ReportService(ReportRepository repository, Clock clock, AuditService audit) {
        this.repository = repository;
        this.clock = clock;
        this.audit = audit;
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
        // v383 — before rejecting as a duplicate, check whether the existing report still STANDS. A report
        // that has expired is no longer constrained by the rule: the same account may say the same thing
        // again, and the new row is the one that stands.
        Instant now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        if (existing.isPresent() && isStanding(existing.get(), now)) {
            throw new InvalidReport(
                    "this account has already reported this publication as " + why + "; a second report would be the same report");
        }
        ReportEntry row = new ReportEntry(
                UUID.randomUUID().toString(),
                target,
                reporter,
                claim == null ? null : claim.handle(),
                claim == null ? null : claim.assurance(),
                why,
                words,
                ReportDtos.STATUS_OPEN,
                STANDING_PERIOD,
                AuditService.TARGET_PUBLICATION,
                now);
        ReportEntry saved = repository.save(row);
        // v311 — the trail, INSIDE this transaction: a rolled-back report leaves no entry claiming a
        // report happened. And only for a report that was actually filed — a refused duplicate is an
        // attempt, not a fact.
        // v384 — the trail entry names the KIND of thing it happened to. A report is about a PUBLICATION
        // (the request names a project id), and that is DECLARED here rather than sniffed out of the id's
        // spelling: a prefix rule would misread a project a creator happened to name "plan-for-tuesday".
        audit.record(
                "report",
                reporter,
                claim == null ? null : claim.handle(),
                claim == null ? null : claim.assurance(),
                target,
                AuditService.TARGET_PUBLICATION);
        return saved;
    }

    /**
     * v383 — whether a report still STANDS at {@code now}.
     *
     * <p>A report expires at its own {@code createdAt + period}, read off the ROW rather than off today's
     * policy (a row filed under one period expires by that period even after the policy moves). The closed
     * set is two; the service writes {@code month} today, and a period this build does not know expires by
     * the month rather than standing forever — an unreadable period must not read as "never expires".
     *
     * <p>The addition is CALENDAR arithmetic in UTC, not {@code Instant.plus}: an Instant has no months or
     * years (they are not a fixed number of seconds), and a "month" that was really thirty days would make
     * a report filed on the 31st expire on the 30th of the next month — a day early, every time.
     */
    private static boolean isStanding(ReportEntry row, Instant now) {
        ZonedDateTime filed = row.getCreatedAt().atZone(ZoneOffset.UTC);
        ZonedDateTime expires = switch (row.getPeriod()) {
            case ReportDtos.PERIOD_YEAR -> filed.plusYears(1);
            default -> filed.plusMonths(1);
        };
        return now.isBefore(expires.toInstant());
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
        // v311 — and the withdrawal is written down too. It is a DIFFERENT fact from the filing (the
        // reporter no longer stands by it), and a trail that recorded only the filing would leave the
        // complaint standing forever in the record.
        // v384 — and the entry names the kind of thing the report was ABOUT, read off the row: the
        // withdrawal happened to the same kind of target the filing did.
        audit.record(
                "withdraw-report",
                reporter,
                claim == null ? null : claim.handle(),
                claim == null ? null : claim.assurance(),
                row.getTargetProjectId(),
                row.getTargetType());
        return true;
    }

    /** The reports about one publication, newest first, and how many the answer carried. */
    @Transactional(readOnly = true)
    public List<ReportEntry> reportsOf(String targetProjectId, int limit) {
        String target = requireUsableProjectId(targetProjectId);
        int asked = limit <= 0 ? DEFAULT_REPORT_LIMIT : Math.min(limit, MAX_REPORT_LIMIT);
        return repository.findByTargetProjectIdOrderByCreatedAtDesc(target, PageRequest.of(0, asked));
    }

    /**
     * v305 — the reports ONE ACCOUNT filed, newest first.
     *
     * <p>The other direction of the report, and a different question from "what has been reported about
     * this publication": a reporter is owed an answer, and the only way they can learn where their
     * complaint stands is to ask for it. The repository has had the finder since v295; what was missing was
     * the door.
     */
    /**
     * v305 — the reports ONE ACCOUNT filed, newest first.
     *
     * <p>The other direction of the report, and a different question from "what has been reported about
     * this publication": a reporter is owed an answer, and the only way they can learn where their
     * complaint stands is to ask for it. The repository has had the finder since v295; what was missing
     * was the door.
     *
     * <p>v382 — {@code offset} pages past the window's newest rows, so a reporter with more complaints
     * than the cap can reach the older ones. v384 — {@code targetType} narrows the window to one KIND of
     * target IN THE QUERY (the v326 lesson: the window is "the newest N of that kind", not "the newest N,
     * of which these are of that kind").
     */
    @Transactional(readOnly = true)
    public List<ReportEntry> reportsFiledBy(String reporterAccountId, int offset, int limit, String targetType) {
        String reporter = requireReporter(reporterAccountId);
        int asked = limit <= 0 ? DEFAULT_REPORT_LIMIT : Math.min(limit, MAX_REPORT_LIMIT);
        int from = Math.max(offset, 0);
        String wanted = requireTargetType(targetType);
        return wanted == null
                ? repository.findByReporterAccountIdOrderByCreatedAtDesc(reporter, PageRequest.of(from, asked))
                : repository.findByReporterAccountIdAndTargetTypeOrderByCreatedAtDesc(
                        reporter, wanted, PageRequest.of(from, asked));
    }

    /**
     * v384 — the KIND of target the filed list is narrowed to, or null for every kind.
     *
     * <p>The kinds are a CLOSED SET of three — the audit trail's own set — and a kind this build does not
     * know is REFUSED BY NAME rather than ignored: a caller that asked for one kind and was answered with
     * the whole list would read the answer as "nothing of that kind", which is a different fact, and the
     * one that matters. The same rule the desk's reason filter keeps (v326).
     */
    private static String requireTargetType(String targetType) {
        if (targetType == null || targetType.isBlank()) {
            return null;
        }
        String trimmed = targetType.trim();
        switch (trimmed) {
            case AuditService.TARGET_ACCOUNT:
            case AuditService.TARGET_PLAN:
            case AuditService.TARGET_PUBLICATION:
                return trimmed;
            default:
                throw new InvalidReport(
                        "a filed list can be narrowed to one of " + AuditService.TARGET_ACCOUNT + ", "
                                + AuditService.TARGET_PLAN + ", " + AuditService.TARGET_PUBLICATION + " — not \"" + trimmed + "\"");
        }
    }

    /** v380 — total reports filed by this account (the whole table, not the window). */
    @Transactional(readOnly = true)
    public long countFiledBy(String reporterAccountId) {
        String reporter = requireReporter(reporterAccountId);
        return repository.countByReporterAccountId(reporter);
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

    /** The account whose reports are being read. A reader must name one. */
    private static String requireReporter(String reporterAccountId) {
        if (reporterAccountId == null || reporterAccountId.isBlank()) {
            throw new InvalidReport("the reports an account filed need that account to be named");
        }
        String trimmed = reporterAccountId.trim();
        if (trimmed.length() > MAX_ACCOUNT_ID_LENGTH) {
            throw new InvalidReport(
                    "reporterAccountId must be at most " + MAX_ACCOUNT_ID_LENGTH + " characters, got " + trimmed.length());
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
