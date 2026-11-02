package dev.nexus.api.tools;

/**
 * M10 v575 - a tool that exists and is NOT deprecated. 404, but a different 404 from an unknown id: a reader
 * deciding whether to migrate must be able to tell "this tool is live" from "there is no such tool".
 */
public class UnknownDeprecation extends RuntimeException {

    public UnknownDeprecation(String message) {
        super(message);
    }
}
