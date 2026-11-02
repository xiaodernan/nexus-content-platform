package dev.nexus.api.tools;

/**
 * M10 v588 - a declaration that is real but has no attestation. A 404 under its own name ({@code not-attested}),
 * distinct from the 404 for an id that names nothing: "nobody has claimed this was tested" and "there is no such
 * tool" are different facts, and a reader deciding whether to trust a contract needs to tell them apart.
 */
public class UnknownAttestation extends RuntimeException {

    public UnknownAttestation(String message) {
        super(message);
    }
}