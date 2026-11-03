package dev.nexus.api.incidents;

/**
 * M9 v594 — this incident is already resolved. 409, not 400: the request was well formed and the row is
 * real; the reason it cannot run is the record's STATE. Overwriting the first resolver with a second one
 * would edit a fact that already happened, so the refusal keeps the first resolve intact.
 */
public class AlreadyResolved extends RuntimeException {

    public AlreadyResolved(String message) {
        super(message);
    }
}
