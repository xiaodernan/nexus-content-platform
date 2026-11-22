package dev.nexus.api.reviews;

/**
 * M9 v868 — a patch that already has an OPEN review request. 409 {@code already-open}.
 *
 * <p>The conflict is about state, not about syntax: the request may be perfectly well formed, and the
 * caller's next step is to read the request that is already open rather than to fix a field. A 400 would
 * send them looking for a typo that is not there.
 */
public class AlreadyOpenPullRequest extends RuntimeException {

    public AlreadyOpenPullRequest(String message) {
        super(message);
    }
}
