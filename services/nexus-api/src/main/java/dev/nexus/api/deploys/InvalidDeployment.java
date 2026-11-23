package dev.nexus.api.deploys;

/**
 * M9 v870 — a deployment request that broke one of this service's rules. 400 {@code invalid-deployment}.
 */
public class InvalidDeployment extends RuntimeException {

    public InvalidDeployment(String message) {
        super(message);
    }
}
