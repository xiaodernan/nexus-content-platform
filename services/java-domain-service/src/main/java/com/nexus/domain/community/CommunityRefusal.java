package com.nexus.domain.community;

/**
 * A refusal that is about the request, not about a block: no such publication, or following yourself.
 *
 * <p>It carries a code rather than an HTTP status so the domain stays transport-free; the controller maps
 * the code. The sentence comes from {@link CommunityPolicy}, never from a literal here — that is the whole
 * point of SC-17: the caller sees the same words whichever service answered.
 *
 * <p>A block is NOT one of these. It comes back as a normal state with {@code blocked} set, because it is a
 * boundary the caller can act on (unblock), not a failed request.
 */
public class CommunityRefusal extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final String code;

    public CommunityRefusal(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}