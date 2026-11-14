package dev.nexus.gateway;

import java.util.List;

/**
 * The ONE truth both auth doors speak (SC-32).
 *
 * <p>There are two identity checks at this gateway: {@link AuthFilter} guards the ROUTE edge (a Spring
 * Cloud {@code GlobalFilter}), and {@link PlatformAuthFilter} guards the gateway's OWN controllers/actuator
 * (a reactive {@code WebFilter}). Before this class they carried three copies of the same policy — the
 * whitelist, the "blank secret means fail closed" rule, and the 401 refusal body — written as independent
 * literals in two files, with a COMMENT in each asking the two to be kept in sync. A comment is not a
 * mechanism: one side could drift (add a path, relax a prefix) and silently open a hole of the exact shape
 * §SC-27 found live — a platform endpoint answering 200 with no token.
 *
 * <p>Now both doors delegate here: one whitelist, one boundary rule, one fail-closed guard, one refusal
 * dialect. {@code AuthWhitelistParityTest} locks the BEHAVIOUR (same verdict, byte-identical 401) so a future
 * edit that bypasses this class, or widens a prefix by accident, goes red instead of shipping.
 */
final class AuthPolicy {

    /** Open without a token on BOTH surfaces: the door's own health probes. */
    static final List<String> OPEN_EXACT = List.of("/platform/health", "/actuator/health");

    /** Open as a path subtree on BOTH surfaces: the circuit-breaker fallback. */
    static final List<String> OPEN_PREFIXES = List.of("/fallback");

    /** One bearer dialect; a caller must not learn a different scheme at each door. */
    static final String BEARER = "Bearer ";

    /** The single 401 note literal — both doors return this byte-for-byte. */
    private static final String REFUSAL_NOTE =
            "present Authorization: Bearer <token>; /platform/health and /fallback/** are open";

    private AuthPolicy() {}

    /** Fail closed at construction time, whoever builds the door. Disabled auth needs no secret. */
    static void requireSecret(boolean enabled, String secret) {
        if (enabled && (secret == null || secret.isBlank())) {
            throw new IllegalStateException("nexus.gateway.auth.enabled=true but nexus.gateway.auth.secret is blank; "
                    + "refusing to start an open door");
        }
    }

    /**
     * Exact-or-whole-segment prefix matching. A bare {@code path.startsWith(prefix)} also opens
     * {@code /fallbackish} — a sibling path that merely SHARES the leading characters — which is a whitelist
     * escape no one intended. Requiring the next byte to be {@code /} (or end of path) keeps
     * {@code /fallback} and {@code /fallback/nexus-api} open while {@code /fallbackish} stays guarded.
     */
    static boolean isOpen(String path, List<String> openExact, List<String> openPrefixes) {
        if (path == null) {
            return false;
        }
        for (String exact : openExact) {
            if (exact.equals(path)) {
                return true;
            }
        }
        for (String prefix : openPrefixes) {
            // Tolerate a caller-supplied trailing slash so "/fallback/" cannot become a double slash.
            String p = prefix.endsWith("/") ? prefix.substring(0, prefix.length() - 1) : prefix;
            if (path.equals(p) || path.startsWith(p + "/")) {
                return true;
            }
        }
        return false;
    }

    /** The one refusal body both doors write, so a caller sees a single dialect for one gateway. */
    static String refusalBody(String reason) {
        return "{\"error\":\"unauthorized\",\"reason\":\"" + reason + "\",\"note\":\"" + REFUSAL_NOTE + "\"}";
    }
}
