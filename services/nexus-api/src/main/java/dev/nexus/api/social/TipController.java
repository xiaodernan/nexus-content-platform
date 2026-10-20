package dev.nexus.api.social;

import dev.nexus.api.social.TipDtos.Tip;
import dev.nexus.api.social.TipDtos.TipAnswer;
import dev.nexus.api.social.TipDtos.TipClaim;
import dev.nexus.api.social.TipDtos.TipRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * M7 v297 — the HTTP surface for TIPS.
 *
 * <p>Two doors: give one, and read the ones an account received (with the total, which the DATABASE
 * sums). The refusals are translated into the status codes that carry the difference — 400 for a request
 * that broke a rule, and nothing else.
 */
@RestController
@RequestMapping("/tips")
public class TipController {

    private final TipService service;

    public TipController(TipService service) {
        this.service = service;
    }

    /** Give a tip. 201 when it was recorded. */
    @PostMapping
    public ResponseEntity<TipAnswer> tip(@RequestBody TipRequest request) {
        TipEntry row = service.tip(
                request == null ? null : request.recipientAccountId(),
                request == null ? null : request.claim(),
                request == null || request.amountCents() == null ? 0L : request.amountCents(),
                request == null ? null : request.message(),
                request != null && Boolean.TRUE.equals(request.anonymous()));
        return ResponseEntity.status(201).body(new TipAnswer(
                row.getRecipientAccountId(),
                List.of(toWire(row)),
                row.getAmountCents(),
                1,
                TipService.DEFAULT_TIP_LIMIT));
    }

    /** The tips an account received, and how much they came to. */
    @GetMapping
    public ResponseEntity<TipAnswer> list(
            @RequestParam(name = "recipient") String recipientAccountId,
            @RequestParam(name = "limit", required = false) Integer limit) {
        int asked = limit == null ? TipService.DEFAULT_TIP_LIMIT : limit;
        List<TipEntry> rows = service.tipsReceived(recipientAccountId, asked);
        List<Tip> tips = rows.stream().map(TipController::toWire).toList();
        return ResponseEntity.ok(new TipAnswer(
                recipientAccountId,
                tips,
                service.totalReceived(recipientAccountId),
                tips.size(),
                asked));
    }

    /** The service's row, as the wire's shape. */
    private static Tip toWire(TipEntry row) {
        return new Tip(
                row.getRecipientAccountId(),
                row.getAmountCents(),
                row.getMessage(),
                row.isAnonymous(),
                row.getTipId(),
                row.getPayerAccountId(),
                row.getCurrency(),
                row.getCreatedAt().toEpochMilli(),
                row.getPayerHandle(),
                row.getPayerAssurance());
    }

    /**
     * A rule the caller broke is a 400 that NAMES it. Anything else is a 500 and says nothing.
     */
    @ExceptionHandler(InvalidTip.class)
    public ResponseEntity<Map<String, String>> invalid(InvalidTip e) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid-tip", "message", e.getMessage()));
    }
}
