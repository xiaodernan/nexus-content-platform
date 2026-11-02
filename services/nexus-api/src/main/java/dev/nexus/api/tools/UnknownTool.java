package dev.nexus.api.tools;

/**
 * M10 v572 — a tool id that names nothing. 404, not 400: the request was well-formed and the registry was
 * asked about a row it does not hold. The same distinction the publication and subscription doors make.
 */
public class UnknownTool extends RuntimeException {

    public UnknownTool(String message) {
        super(message);
    }
}
