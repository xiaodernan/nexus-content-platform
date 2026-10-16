package dev.nexus.api.publish;

/**
 * A re-publish tried to move an existing publication to a DIFFERENT owner (M7 v242, ADR 0018).
 *
 * <p>The twin of {@link NotTheOwner} in intent and in status (403): a publication has exactly one owner,
 * just as it has exactly one row and one current version, and this is the refusal that keeps the first
 * answer singular. Re-publishing under the SAME account is the ordinary path and never reaches this
 * class; so is re-publishing with no claim at all, which keeps the owner the row already has.
 */
public class OwnerTaken extends RuntimeException {
    public OwnerTaken(String message) {
        super(message);
    }
}