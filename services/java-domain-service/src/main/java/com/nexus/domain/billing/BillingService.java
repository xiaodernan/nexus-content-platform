package com.nexus.domain.billing;

import com.nexus.domain.UnimplementedOperation;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Billing domain service — credits, subscriptions, consumption tracking.
 *
 * <p><b>This service does not own these writes yet, and it says so instead of pretending.</b> Every
 * method below used to answer with a made-up value:
 *
 * <pre>{@code
 * public int getCreditBalance(String userId) { return 0; }          // a paid user is told 0
 * public void deductCredits(String userId, String agentKey, int amount) { }  // success; nothing happened
 * public boolean hasEnoughCredits(String userId, String agentKey) { return false; }
 * public String getSubscriptionPlan(String userId) { return "free"; }  // a subscriber is told "free"
 * public void upgradePlan(String userId, String newPlan) { }
 * }</pre>
 *
 * <p>Each of those was a fact the service had not established, delivered in a type the caller
 * believes. The credits ledger in this repository lives in the web layer's {@code usage} table
 * (see {@code apps/web/src/server/db/schema.ts}), and the subscription rules live with the
 * {@code nexus-api} service's subscription surface — which has its own real implementation and its
 * own tests. Duplicating either here, half-implemented, would create a SECOND answer to a question
 * the platform already answers.
 *
 * <p>So each method refuses with {@link UnimplementedOperation}, which names the operation and the
 * boundary. The shape of the service is kept — the boundary is real, and the next increment fills
 * it — but the service never invents a balance, a plan, or a deduction.
 *
 * @see com.nexus.domain.UnimplementedOperation
 */
@Service
@Transactional(readOnly = true)
public class BillingService {

    private static final String OWNERSHIP =
            "the credits ledger lives in the web layer's `usage` table and the subscription rules live in "
                    + "nexus-api's subscription surface; this service does not own either, so it will not "
                    + "answer for it with a made-up number";

    /**
     * Get user's credit balance.
     *
     * @throws UnimplementedOperation always — this service does not own the credits ledger.
     */
    public int getCreditBalance(String userId) {
        throw new UnimplementedOperation("billing.getCreditBalance", OWNERSHIP);
    }

    /**
     * Deduct credits for a generation task.
     *
     * @throws UnimplementedOperation always — a silent no-op here would report a deduction that
     *     never happened.
     */
    @Transactional
    public void deductCredits(String userId, String agentKey, int amount) {
        throw new UnimplementedOperation("billing.deductCredits", OWNERSHIP);
    }

    /**
     * Check if user has enough credits.
     *
     * @throws UnimplementedOperation always — a {@code false} here is a made-up answer.
     */
    public boolean hasEnoughCredits(String userId, String agentKey) {
        throw new UnimplementedOperation("billing.hasEnoughCredits", OWNERSHIP);
    }

    /**
     * Get user's subscription plan.
     *
     * @throws UnimplementedOperation always — a hard-coded {@code "free"} would tell a paying
     *     subscriber they are on the free plan.
     */
    public String getSubscriptionPlan(String userId) {
        throw new UnimplementedOperation("billing.getSubscriptionPlan", OWNERSHIP);
    }

    /**
     * Upgrade user's subscription plan.
     *
     * @throws UnimplementedOperation always — a silent no-op would report an upgrade that never
     *     happened.
     */
    @Transactional
    public void upgradePlan(String userId, String newPlan) {
        throw new UnimplementedOperation("billing.upgradePlan", OWNERSHIP);
    }
}
