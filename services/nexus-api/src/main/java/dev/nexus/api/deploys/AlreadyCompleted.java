package dev.nexus.api.deploys;

/**
 * M9 v870 — a deployment that was already completed. 409 {@code already-completed}.
 *
 * <p>Raised when the atomic `completeIfRequested` update moved zero rows: somebody else's report landed
 * first, or this record was never requested. A retry is a NEW deployment record, not an edit of this one.
 */
public class AlreadyCompleted extends RuntimeException {

    public AlreadyCompleted(String message) {
        super(message);
    }
}
