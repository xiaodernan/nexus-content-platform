package dev.nexus.api.incidents;

/**
 * M9 v594 — there is no such incident. 404 under its own name ({@code unknown-incident}), because a read
 * or a resolve naming an id that holds nothing is a question about a record that does not exist: a 200 with
 * an empty body would have to be read as a failure anyway.
 */
public class NoSuchIncident extends RuntimeException {

    public NoSuchIncident(String message) {
        super(message);
    }
}
