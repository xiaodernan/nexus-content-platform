package com.nexus.domain.billing;

import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The billing HTTP surface (SC-20), reachable through the gateway's {@code /domain/**} route as
 * {@code GET /domain/api/v1/billing/balance?kind=ai} and {@code GET /domain/api/v1/billing/plan}.
 *
 * <p><b>Identity comes from the door, never from the body.</b> The caller's id is {@code X-Nexus-Subject},
 * which nexus-gateway's AuthFilter OVERWRITES after verifying a signed token. A direct hit on this port is
 * anonymous — this service is not published, and a request without the header is answered with a 401 that
 * says exactly that, rather than with a guessed identity.
 *
 * <p><b>Reading is all that is here.</b> The ledger is append-only and its only writer is the web layer's
 * {@code finishTask}; nothing on this surface changes a balance, a plan or a row. The kinds are checked
 * by the service, not by this controller — the refusal for a wrong kind comes from the same place that
 * answers the question so both doors agree on the sentence.
 */
@RestController
@RequestMapping("/api/v1/billing")
public class BillingController {

    /** Must match the gateway's AuthFilter.SUBJECT_HEADER. */
    static final String SUBJECT_HEADER = "X-Nexus-Subject";

    private final BillingService billing;

    public BillingController(BillingService billing) {
        this.billing = billing;
    }

    /** The caller's own balance for one kind — the number the §134 ledger answers as a SUM. */
    @GetMapping("/balance")
    public Map<String, Object> balance(@RequestHeader(SUBJECT_HEADER) UUID userId,
                                       @RequestParam(defaultValue = "ai") String kind) {
        long balance = billing.getCreditBalance(userId, kind);
        return Map.of("userId", userId.toString(), "kind", kind, "balance", balance);
    }

    /** The caller's own plan as the schema stores it — lowercase ({@code users.plan} CHECK). */
    @GetMapping("/plan")
    public Map<String, Object> plan(@RequestHeader(SUBJECT_HEADER) UUID userId) {
        String plan = billing.getSubscriptionPlan(userId);
        return Map.of("userId", userId.toString(), "plan", plan);
    }

    /** An unknown kind, or a plan read against an id nobody holds — refuse by name (§60). */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> refuse(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
    }
}
