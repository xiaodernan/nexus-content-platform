package dev.nexus.api.reviews;

/**
 * M9 v869 — a decision that broke one of this service's rules. 400 {@code invalid-decision}, and the
 * message names the rule so a caller does not have to guess which field was fine.
 */
public class InvalidDecision extends RuntimeException {

    public InvalidDecision(String message) {
        super(message);
    }
}
