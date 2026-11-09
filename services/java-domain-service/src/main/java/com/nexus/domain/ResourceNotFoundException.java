package com.nexus.domain;

/**
 * The row a caller asked for is not there.
 *
 * <p>This exists so that "not there" and "you sent nonsense" are two DIFFERENT answers. Before it, both
 * arrived as an {@link IllegalArgumentException}, and one HTTP status had to cover two unrelated facts:
 * a 404 for a missing row, and a 400 for a word that is not in the schema's vocabulary. A client cannot
 * act on that — it cannot tell "try a different id" from "fix your request".
 */
public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException(String message) {
        super(message);
    }
}
