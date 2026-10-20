package dev.nexus.api.moderation;

/**
 * A disposition of a report against a publication the caller does not own.
 *
 * <p>Its own type rather than a subtype of {@link InvalidModeration}, because the request was
 * WELL-FORMED: a 400 would tell the caller to fix a field that is fine. 403 means <em>understood, and
 * no</em>, which is exactly what this service can honestly say — it knows two account ids are not equal,
 * and it knows nothing else.
 *
 * <p>The social package's {@code NotYourReport} is the same shape for the same reason: the reporter may
 * withdraw their own report and nobody else's, and the difference between the two failures is worth a
 * status code of its own.
 */
public class NotYourPublication extends RuntimeException {
    public NotYourPublication(String message) {
        super(message);
    }
}
