package dev.nexus.api.patches;

/**
 * M9 v595 — there is no such patch. 404 under its own name ({@code unknown-patch}), because a read naming
 * an id that holds nothing is a question about a record that does not exist.
 */
public class NoSuchPatch extends RuntimeException {

    public NoSuchPatch(String message) {
        super(message);
    }
}
