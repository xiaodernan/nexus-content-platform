package dev.nexus.api.deploys;

/**
 * M9 v870 — a deployment against a review request that was not approved. 409 {@code not-approved}.
 *
 * <p>The state conflicts, not the syntax: the body may be perfectly well formed. Only an approved request
 * may be deployed — an open one has no verdict yet, and a rejected one has a verdict that says no.
 */
public class NotApproved extends RuntimeException {

    public NotApproved(String message) {
        super(message);
    }
}
