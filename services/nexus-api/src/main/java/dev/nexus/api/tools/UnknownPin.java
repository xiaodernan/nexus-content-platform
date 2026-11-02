package dev.nexus.api.tools;

/**
 * M10 v590 - a tool that is real, but whose recorded history does not hold this pin.
 *
 * <p>A 404 under its own name ({@code unknown-pin}), distinct from the 404 for an id that names nothing. The
 * pin is well formed and the declaration exists, so "this contract was never recorded here" is a different
 * fact from "there is no such tool" - and it is also what a PRUNED revision answers, because retention removed
 * the row that carried it.
 */
public class UnknownPin extends RuntimeException {

    public UnknownPin(String message) {
        super(message);
    }
}