package dev.nexus.api.social;

/**
 * A report request that breaks one of {@link ReportService}'s rules.
 *
 * <p>Its own type rather than {@code IllegalArgumentException}, because the controller must answer 400 for
 * exactly these and 500 for anything else.
 */
public class InvalidReport extends RuntimeException {
    public InvalidReport(String message) {
        super(message);
    }
}
