package dev.nexus.api.social;

/**
 * A take-back of somebody else's comment.
 *
 * <p>Its own type rather than a subtype of {@link InvalidComment}, because the request was WELL-FORMED:
 * a 400 would tell the caller to fix a field that is fine. 403 means <em>understood, and no</em>, which
 * is exactly what this service can honestly say \u2014 it knows two account ids are not equal, and it knows
 * nothing else.
 */
public class NotYourComment extends RuntimeException {
    public NotYourComment(String message) {
        super(message);
    }
}
