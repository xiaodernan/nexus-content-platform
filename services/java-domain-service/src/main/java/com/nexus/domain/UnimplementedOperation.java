package com.nexus.domain;

/**
 * A refusal that says the truth: <b>this operation is not implemented by this service</b>.
 *
 * <p>This exception exists because of a specific, measured defect in this service's history. Three
 * of its domain services — {@code BillingService}, {@code CommunityService} and
 * {@code PermissionService} — carried method bodies like these:
 *
 * <pre>{@code
 * public int getCreditBalance(String userId) {
 *     // TODO: Implement credit balance lookup
 *     return 0;                       // a user with 500 credits is told 0
 * }
 * public void likeProject(String projectId, String userId) {
 *     // TODO: Implement like logic with database
 * }                                  // the caller is told "liked"; nothing happened
 * public boolean hasPermission(String userId, String resourceType, String resourceId, String action) {
 *     // TODO: Implement permission check logic
 *     return false;                   // a permission check that answers without checking
 * }
 * }</pre>
 *
 * <p>Every one of those is a <b>made-up answer wearing a real type</b>. A {@code 0} balance, a
 * {@code false} permission and a {@code false} admin flag are all things a caller will believe, and
 * a {@code void} method that does nothing is the worst of the four: the caller receives SUCCESS.
 *
 * <p>This repository's rule is that no surface may answer with a fact it did not establish (§159 —
 * "no fake API, no fake payment, {@code TODO} masquerading as available"). So every one of those
 * bodies now refuses, and the refusal <b>names the operation and says why</b>. A caller that hits
 * it learns the truth — this service does not own that write yet — instead of a plausible number.
 *
 * <p>It is a {@link RuntimeException} rather than a checked one because the alternative is a
 * signature that says "this might throw" on every method, which trains callers to ignore exactly
 * the signal this exception carries.
 */
public class UnimplementedOperation extends RuntimeException {

    private final String operation;
    private final String reason;

    public UnimplementedOperation(String operation, String reason) {
        super(operation + " is not implemented by this service: " + reason);
        this.operation = operation;
        this.reason = reason;
    }

    /** The operation that was asked for, in the form the service names it. */
    public String getOperation() {
        return operation;
    }

    /** Why it is not implemented — the boundary, stated rather than implied. */
    public String getReason() {
        return reason;
    }
}
