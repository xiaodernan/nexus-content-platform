package dev.nexus.api.deploys;

/**
 * M9 v870 — an id that names no deployment. 404 {@code unknown-deployment}.
 */
public class NoSuchDeployment extends RuntimeException {

    public NoSuchDeployment(String message) {
        super(message);
    }
}
