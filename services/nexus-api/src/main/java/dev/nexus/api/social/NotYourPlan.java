package dev.nexus.api.social;

/**
 * A retirement of somebody else's plan.
 *
 * <p>Its own type rather than a subtype of {@link InvalidSubscription}, because the request was
 * WELL-FORMED: a 400 would tell the caller to fix a field that is fine. 403 means <em>understood, and
 * no</em>, which is exactly what this service can honestly say — it knows two account ids are not equal,
 * and it knows nothing else.
 */
public class NotYourPlan extends RuntimeException {
    public NotYourPlan(String message) {
        super(message);
    }
}
