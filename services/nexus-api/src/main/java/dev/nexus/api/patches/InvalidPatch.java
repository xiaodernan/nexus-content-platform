package dev.nexus.api.patches;

/**
 * M9 v595 — a patch request that broke one of this service's rules. 400 {@code invalid-patch}, and the
 * message names the rule so a caller does not have to guess which field was fine.
 */
public class InvalidPatch extends RuntimeException {

    public InvalidPatch(String message) {
        super(message);
    }
}
