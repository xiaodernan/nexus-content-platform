package dev.nexus.api.reviews;

/**
 * M9 v869 — a review request that is no longer open. 409 {@code already-decided}.
 *
 * <p>Raised when the atomic `closeIfOpen` update moved zero rows: somebody else's verdict landed first, or
 * this request was never open. The conflict is about state, not syntax — the request may be well formed.
 */
public class AlreadyDecided extends RuntimeException {

    public AlreadyDecided(String message) {
        super(message);
    }
}
