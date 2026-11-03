package dev.nexus.api.incidents;

/**
 * M9 v594 — a request that broke one of the incident rules. Translated to 400 by the controller, and the
 * message NAMES the rule: a caller told only "no" has to guess which field was fine.
 */
public class InvalidIncident extends RuntimeException {

    public InvalidIncident(String message) {
        super(message);
    }
}
