package dev.nexus.api.tools;

/**
 * M10 v588 - the pin a caller tested is not the pin being served.
 *
 * <p>A 409 rather than a 400: the request was well-formed and the caller did nothing wrong - the world moved
 * between reading the contract and saying it was tested. The message names the pin now being served, because
 * the value is public and the caller needs it to re-read and re-attest.
 */
public class StaleContract extends RuntimeException {

    public StaleContract(String message) {
        super(message);
    }
}