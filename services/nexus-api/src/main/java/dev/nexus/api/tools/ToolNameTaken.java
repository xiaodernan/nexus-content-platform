package dev.nexus.api.tools;

/**
 * M10 v571 — the name is already held. A 409, because the request was legal and the registry already has the
 * row; the message names the tool that holds the name, so a caller can tell "taken" from "malformed".
 */
public class ToolNameTaken extends RuntimeException {

    public ToolNameTaken(String message) {
        super(message);
    }
}
