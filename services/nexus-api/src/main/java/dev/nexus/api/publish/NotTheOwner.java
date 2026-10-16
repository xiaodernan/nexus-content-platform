package dev.nexus.api.publish;

/**
 * A caller asked to act on a publication whose OWNER is somebody else (M7 v242, ADR 0018).
 *
 * <p>Its own type, and deliberately NOT a subtype of {@link InvalidPublication}: the request was
 * well-formed, so a 400 would tell the caller to fix a field that is fine. The controller answers 403,
 * which is the status that means understood, and no.
 *
 * <p>What this does NOT claim: that the caller is an attacker, or that the claim on the row was ever
 * verified. It says only that two account ids are not equal, which is a fact this service can always
 * establish. ADR 0018 is where the reasoning about what an id is worth lives.
 */
public class NotTheOwner extends RuntimeException {
    public NotTheOwner(String message) {
        super(message);
    }
}