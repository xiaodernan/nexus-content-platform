package dev.nexus.api.tools;

/**
 * M10 v571 — the row belongs to another account. A 403, not a 404: the caller named a real id and the reason it
 * could not be removed is ownership, not absence.
 */
public class NotYourTool extends RuntimeException {

    public NotYourTool(String message) {
        super(message);
    }
}
