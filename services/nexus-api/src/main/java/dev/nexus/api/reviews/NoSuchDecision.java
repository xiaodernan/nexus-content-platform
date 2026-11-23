package dev.nexus.api.reviews;

/**
 * M9 v869 — an id that names no decision. 404 {@code unknown-decision}.
 */
public class NoSuchDecision extends RuntimeException {

    public NoSuchDecision(String message) {
        super(message);
    }
}
