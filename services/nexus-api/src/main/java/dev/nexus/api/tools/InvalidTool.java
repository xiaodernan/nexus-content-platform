package dev.nexus.api.tools;

/**
 * M10 v571 — a declaration that broke one of the registry's rules. Translated to 400 by the controller, and
 * the message NAMES the rule: a caller told only "no" has to guess which field was fine.
 */
public class InvalidTool extends RuntimeException {

    public InvalidTool(String message) {
        super(message);
    }
}
