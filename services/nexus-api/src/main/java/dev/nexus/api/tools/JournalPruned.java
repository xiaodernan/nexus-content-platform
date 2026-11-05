package dev.nexus.api.tools;

/**
 * M10 v621 - the cursor names a position OLDER than the journal still holds.
 *
 * <p>A 410 rather than a 400: the request was well-formed and the caller did nothing wrong - retention moved
 * the beginning of the feed past the cursor. The message names the oldest entry still here, because that is
 * the value the caller needs to decide whether it can resume (at one below it) or must accept a gap, and it
 * says outright that entries before the boundary are gone rather than pretending the feed starts there.
 */
public class JournalPruned extends RuntimeException {

    public JournalPruned(String message) {
        super(message);
    }
}