package dev.nexus.api.moderation;

import dev.nexus.api.ops.AuditService;
import dev.nexus.api.publish.PublishedProject;
import dev.nexus.api.publish.PublishedProjectRepository;
import dev.nexus.api.social.ReportDtos;
import dev.nexus.api.social.ReportEntry;
import dev.nexus.api.social.ReportRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * M7 v304 — the OWNER'S DESK: the reports filed against the work an account owns, and one way to
 * dispose of them.
 *
 * <p>v295 gave the report its four rules and v296 gave it a face on the artifact page: the COUNT and the
 * reasons. What was missing is the other half. <b>The person whose work is reported never learns what was
 * said about it</b>, and the only status a report could reach was the reporter withdrawing it. A
 * complaint with nobody to answer it is not a moderation system — it is a counter.
 *
 * <p><b>Who moderates here.</b> The plan asked for {@code reviewed} and {@code resolved} and named the
 * reason they do not exist: <em>there is no moderator in this build</em>, and the service does not invent
 * a role it has no policy for. So this increment looks for the actor that DOES exist — <b>the owner of
 * the publication the report is about</b>, which is the one relation the service already keeps and the
 * one the take-down already uses — and gives that actor exactly one power: to say the report has been
 * seen. The status is called {@code acknowledged} and NOT {@code reviewed} or {@code resolved}, because
 * those two words belong to a moderator's verdict, and this build has no moderator to render one.
 *
 * <p><b>And what the desk does NOT say — the load-bearing decision.</b> The reporter's identity is not
 * on the desk, even though the service stores it and even though v296 pointed at the moderator as the
 * one who may see it. The reason is stated rather than left implied: <b>a claim is not a key</b>. The
 * desk is opened by naming an account id, and account ids are PUBLIC (every publication carries its owner
 * in its byline), so whatever the desk shows can be read by a caller who knows whose work it is. A name
 * cannot be un-said, and the reporter is the person most harmed by being named to a stranger; so the desk
 * shows the REASON and the reporter's WORDS — the substance of the complaint — and keeps the identity for
 * the reporter's own view, which is the only place showing it is safe.
 *
 * <p><b>What this service does NOT do:</b> it does not check that the claim names a real account, it
 * does not verify anything about the claim (ADR 0018 — the same posture the publish service takes), and
 * it does not notify anybody. A desk that e-mailed the owner would need an address, and there is none.
 */
@Service
public class ModerationService {

    /** The most desk rows one answer may carry. The cap is CLAMPED rather than refused, like every cap here. */
    public static final int MAX_DESK_LIMIT = 100;

    /** How many desk rows an answer carries when the caller names no limit. */
    public static final int DEFAULT_DESK_LIMIT = 20;

    /**
     * How many of the owner's publications the desk looks at.
     *
     * <p>The desk finds the owner's publications through the publish package's windowed finder, so there
     * has to be a window. It is generous, and the bound is recorded rather than hidden: a desk that
     * covered the owner's most recent two hundred publications would not cover an owner with more.
     */
    static final int OWNED_PUBLICATIONS_WINDOW = 200;

    /** Long enough for a real account id, short enough that it cannot be used to fill the table with one row. */
    static final int MAX_ACCOUNT_ID_LENGTH = 200;

    private final ReportRepository reports;
    private final PublishedProjectRepository publications;
    private final AuditService audit;

    public ModerationService(
            ReportRepository reports, PublishedProjectRepository publications, AuditService audit) {
        this.reports = reports;
        this.publications = publications;
        this.audit = audit;
    }

    /**
     * THE DESK: the reports against the publications this account owns, newest first.
     *
     * <p>The rows are the reports themselves, with the publication they are about named beside them (the
     * title as well as the id, because an owner with twenty publications should not have to remember
     * which id is which) and with the reporter's words.
     */
    @Transactional(readOnly = true)
    public List<ModerationDtos.DeskEntry> deskOf(String ownerAccountId, int limit, String reason) {
        String owner = requireOwner(ownerAccountId);
        int asked = limit <= 0 ? DEFAULT_DESK_LIMIT : Math.min(limit, MAX_DESK_LIMIT);
        String wanted = requireReason(reason);
        List<PublishedProject> owned =
                publications.findByOwnerAccountIdOrderByPublishedAtDesc(owner, PageRequest.of(0, OWNED_PUBLICATIONS_WINDOW));
        if (owned.isEmpty()) {
            return List.of();
        }
        List<String> ids = new ArrayList<>();
        Map<String, String> titles = new HashMap<>();
        for (PublishedProject publication : owned) {
            ids.add(publication.getProjectId());
            titles.put(publication.getProjectId(), publication.getTitle());
        }
        List<ReportEntry> window = wanted == null
                ? reports.findByTargetProjectIdInOrderByCreatedAtDesc(ids, PageRequest.of(0, asked))
                : reports.findByTargetProjectIdInAndReasonOrderByCreatedAtDesc(ids, wanted, PageRequest.of(0, asked));
        return window.stream()
                .map(row -> new ModerationDtos.DeskEntry(
                        row.getReportId(),
                        row.getTargetProjectId(),
                        titles.getOrDefault(row.getTargetProjectId(), row.getTargetProjectId()),
                        row.getReason(),
                        row.getDetail(),
                        row.getStatus(),
                        row.getCreatedAt().toEpochMilli()))
                .toList();
    }

    /**
     * v326 — the REASON the desk is narrowed to, or null for the whole desk.
     *
     * <p>The reasons are a CLOSED SET of four (the social package's own set — v295), and a reason this
     * build does not know is REFUSED BY NAME rather than ignored: a caller that asked for a reason this
     * service does not have, and was answered with the whole desk, would read the answer as "there was
     * nothing of that reason" — which is a different fact, and the one that matters.
     */
    private static String requireReason(String reason) {
        if (reason == null || reason.isBlank()) {
            return null;
        }
        String trimmed = reason.trim();
        switch (trimmed) {
            case ReportDtos.REASON_SPAM:
            case ReportDtos.REASON_HARASSMENT:
            case ReportDtos.REASON_ILLEGAL:
            case ReportDtos.REASON_OTHER:
                return trimmed;
            default:
                throw new InvalidModeration(
                        "a desk can be narrowed to one of spam, harassment, illegal, other — not \"" + trimmed + "\"");
        }
    }

    /**
     * v312 — the TALLY: how many reports against this account's work, by reason and by status.
     *
     * <p>The reasons are a CLOSED SET of four (v295), and the tally counts them: a creator who has two
     * spam reports and one harassment report should see that, and not only that there are three. The
     * counts come from a GROUPED query over every report against the account's work — not from the desk's
     * window, which is a window.
     */
    @Transactional(readOnly = true)
    public ModerationDtos.TallyAnswer tallyOf(String ownerAccountId) {
        String owner = requireOwner(ownerAccountId);
        List<PublishedProject> owned =
                publications.findByOwnerAccountIdOrderByPublishedAtDesc(owner, PageRequest.of(0, OWNED_PUBLICATIONS_WINDOW));
        if (owned.isEmpty()) {
            return new ModerationDtos.TallyAnswer(owner, 0L, 0L, Map.of(), Map.of());
        }
        List<String> ids = new ArrayList<>();
        for (PublishedProject publication : owned) {
            ids.add(publication.getProjectId());
        }
        Map<String, Long> byReason = new LinkedHashMap<>();
        Map<String, Long> byStatus = new LinkedHashMap<>();
        long total = 0L;
        for (Object[] row : reports.countByTargetsGroupedByReasonAndStatus(ids)) {
            String reason = String.valueOf(row[0]);
            String status = String.valueOf(row[1]);
            long count = ((Number) row[2]).longValue();
            byReason.merge(reason, count, Long::sum);
            byStatus.merge(status, count, Long::sum);
            total += count;
        }
        long open = byStatus.getOrDefault(ReportDtos.STATUS_OPEN, 0L);
        return new ModerationDtos.TallyAnswer(owner, total, open, byReason, byStatus);
    }

    /**
     * ACKNOWLEDGE a report: the owner of the publication says they have seen it.
     *
     * <p>The status moves FORWARD and the row STAYS, because a report that was acknowledged is a fact
     * that happened — exactly as a withdrawn report and a taken-down publication stay.
     *
     * <p>A report that is already disposed of is not an error: the answer says the status it is at and
     * that it did not move. A caller that acknowledged twice is told the truth the second time, not a
     * failure for asking.
     */
    @Transactional
    public ModerationDtos.DispositionAnswer acknowledge(String reportId, String ownerAccountId) {
        String owner = requireOwner(ownerAccountId);
        if (reportId == null || reportId.isBlank()) {
            throw new InvalidModeration("reportId must not be blank");
        }
        Optional<ReportEntry> found = reports.findByReportId(reportId.trim());
        if (found.isEmpty()) {
            throw new InvalidModeration("no report carries the id " + reportId.trim());
        }
        ReportEntry row = found.get();
        // The desk is the OWNER's: the report has to be about one of the publications this account owns.
        // The check is the same one the take-down makes — the claim NAMES the owner and the service
        // compares it with the row — and it is exactly as strong as that one, and no stronger.
        if (!isOwnedBy(owner, row.getTargetProjectId())) {
            throw new NotYourPublication(
                    "report " + row.getReportId() + " is about a publication this account does not own, and only its owner may dispose of it");
        }
        if (!ReportDtos.STATUS_OPEN.equals(row.getStatus())) {
            return new ModerationDtos.DispositionAnswer(row.getReportId(), row.getStatus(), false);
        }
        row.markAcknowledged();
        reports.save(row);
        audit.record("acknowledge", owner, null, null, row.getTargetProjectId(), AuditService.TARGET_PUBLICATION);
        return new ModerationDtos.DispositionAnswer(row.getReportId(), row.getStatus(), true);
    }

    /** Whether this account owns that publication — the take-down's own rule, reused rather than reinvented. */
    private boolean isOwnedBy(String ownerAccountId, String projectId) {
        return publications.findById(projectId).map(row -> row.isOwnedBy(ownerAccountId)).orElse(false);
    }

    /** The desk belongs to an ACCOUNT: a caller that names nobody is nobody's owner. */
    private static String requireOwner(String ownerAccountId) {
        if (ownerAccountId == null || ownerAccountId.isBlank()) {
            throw new InvalidModeration(
                    "the desk belongs to an account: a caller that names no account owns nothing, and the desk would be everybody's");
        }
        String trimmed = ownerAccountId.trim();
        if (trimmed.length() > MAX_ACCOUNT_ID_LENGTH) {
            throw new InvalidModeration(
                    "ownerAccountId must be at most " + MAX_ACCOUNT_ID_LENGTH + " characters, got " + trimmed.length());
        }
        return trimmed;
    }
}
