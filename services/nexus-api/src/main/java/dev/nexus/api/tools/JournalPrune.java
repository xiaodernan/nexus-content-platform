package dev.nexus.api.tools;

/**
 * M10 v621 - what a journal retention prune did, as the service computes it.
 *
 * <p>{@code oldest} is the oldest seq the journal still holds after the delete, or null when it held nothing
 * to begin with. It is the boundary every later read is measured against; the controller puts these four
 * numbers on the wire unchanged.
 */
public record JournalPrune(long before, int pruned, Long oldest, long remaining) {
}