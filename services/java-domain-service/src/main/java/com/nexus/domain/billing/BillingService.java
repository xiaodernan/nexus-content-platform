package com.nexus.domain.billing;

import com.nexus.domain.user.User;
import com.nexus.domain.user.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Billing for the JVM path — a READER of the §134 credit ledger, not a second writer of it.
 *
 * <p>What is deliberately NOT here, because each write belongs to a path that writes MORE than the row
 * in question, and a second writer of the partial thing is the hole:
 * <ul>
 *   <li><b>Consumption rows.</b> A row must trace to a task that really happened ({@code task_id}, keyed
 *       by the (task_id, kind) partial unique index). The web layer's {@code finishTask} writes it; a JVM
 *       deduction keyed only by "user + amount" — like this service's first draft had it — is precisely
 *       the row the schema refuses: 追不到的就不该记账.</li>
 *   <li><b>Plan changes.</b> The web path writes {@code users.plan} AND the monthly {@code plan_grant}
 *       rows keyed by (user, kind, period). A JVM writer of just the column would leave a new plan with
 *       no entitlements behind it.</li>
 *   <li><b>The per-plan amounts.</b> {@code PLAN_MONTHLY_GRANTS} lives in
 *       {@code apps/web/src/server/domain/credits.ts} on purpose — prices change in one place, through
 *       types and tests, not by a second copy quietly going stale.</li>
 * </ul>
 */
@Service
@Transactional(readOnly = true)
public class BillingService {

    /**
     * The five ledger kinds. The DB CHECK (migration 0016) and the TS list
     * ({@code schema.ts CREDIT_LEDGER_KINDS}) are the other two spellings of the same list. This copy
     * refuses a misspelled kind BEFORE the query: an unknown kind would otherwise silently sum to zero
     * and be read as "this person has no credits" — an absence claim that hides the real answer.
     */
    public static final Set<String> CREDIT_KINDS = Set.of("ai", "image", "video", "compute", "marketplace");

    private final CreditLedgerRepository ledger;
    private final UserRepository users;

    public BillingService(CreditLedgerRepository ledger, UserRepository users) {
        this.ledger = ledger;
        this.users = users;
    }

    /**
     * The balance for ONE kind: SUM of the ledger's delta. Not a stored field — see {@link CreditLedger}.
     */
    public long getCreditBalance(UUID userId, String kind) {
        requireKind(kind);
        return ledger.balanceOf(userId, kind);
    }

    /** Whether the balance for a kind covers an upcoming cost. The gate a JVM-side action checks first. */
    public boolean hasEnoughCredits(UUID userId, String kind, int amount) {
        return getCreditBalance(userId, kind) >= amount;
    }

    /** The plan label as the schema stores it — lowercase ({@code users.plan} CHECK, see UserPlanConverter). */
    public String getSubscriptionPlan(UUID userId) {
        User user = users.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));
        return user.getPlan() == null ? "free" : user.getPlan().name().toLowerCase(Locale.ROOT);
    }

    private static void requireKind(String kind) {
        if (!CREDIT_KINDS.contains(kind)) {
            throw new IllegalArgumentException("Unknown credit kind: " + kind);
        }
    }
}
