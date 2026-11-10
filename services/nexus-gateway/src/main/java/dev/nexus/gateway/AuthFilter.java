package dev.nexus.gateway;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * The door's identity check (SC-13).
 *
 * <p>Stateless and provider-free: a compact signed token (HMAC-SHA256) the caller presents as
 * {@code Authorization: Bearer <token>}. The signature is verified against a secret the deployment supplies
 * — never a built-in default that silently opens the door. No third party, no JWT library, no clock-skew
 * trust beyond an explicit leeway. This is exactly the kind of thing §159 forbids faking: the door either
 * verifies a real signature with a real secret or it refuses, and the test mints tokens with the same code
 * path the deployment would.
 *
 * <p>Paths that MUST answer before a caller is known are whitelisted: the door's own health probes
 * ({@code /platform/health}, {@code /actuator/health}) and the circuit-breaker fallback
 * ({@code /fallback/**}). Everything else needs a valid, unexpired token when this filter is enabled; a
 * missing, malformed, or expired token is a 401 and the request never reaches a backend.
 *
 * <p>On success the subject and scopes are forwarded to the backend as {@code X-Nexus-Subject} and
 * {@code X-Nexus-Scopes}, OVERWRITTEN (not appended) — a caller that forges those headers must not be able
 * to make the backend believe it is someone else. The backend trusts them because only this door sets them
 * on the trusted (post-filter) request.
 *
 * <p>Fail-closed, deliberately — the opposite of the rate limiter. An authentication decision has no
 * "allow" fallback: if auth is enabled with no secret configured the CONSTRUCTOR itself refuses to start
 * (SC-32, via {@link AuthPolicy#requireSecret}, shared with {@link PlatformAuthFilter}), so no caller can
 * accidentally open the door, and if signature verification throws the request is refused, not waved through.
 * A door that is open because its crypto failed is worse than a door that is closed.
 */
final class AuthFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(AuthFilter.class);

    /** Runs before RateLimitFilter (+10) so an unauthenticated request spends no bucket token. */
    static final int ORDER = Ordered.HIGHEST_PRECEDENCE + 5;

    private static final String BEARER = AuthPolicy.BEARER;
    static final String AUTH_HEADER = "Authorization";
    static final String SUBJECT_HEADER = "X-Nexus-Subject";
    static final String SCOPES_HEADER = "X-Nexus-Scopes";

    private final boolean enabled;
    private final String secret;
    private final List<String> whitelistExact;
    private final List<String> whitelistPrefixes;

    AuthFilter(boolean enabled, String secret) {
        this(enabled, secret, AuthPolicy.OPEN_EXACT, AuthPolicy.OPEN_PREFIXES);
    }

    AuthFilter(boolean enabled, String secret, List<String> whitelistExact, List<String> whitelistPrefixes) {
        // SC-32: fail closed in the constructor itself, so BOTH auth doors refuse a blank secret identically.
        // No caller can forget to check — the door itself is the guard, not a convention in its builders.
        AuthPolicy.requireSecret(enabled, secret);
        this.enabled = enabled;
        this.secret = secret;
        this.whitelistExact = whitelistExact;
        this.whitelistPrefixes = whitelistPrefixes;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        if (!enabled) {
            return chain.filter(exchange);
        }
        String path = exchange.getRequest().getURI().getRawPath();
        if (isWhitelisted(path)) {
            return chain.filter(exchange);
        }
        String token = bearerToken(exchange);
        Verification result = token == null ? Verification.missing() : verify(token, secret);
        if (!result.ok()) {
            if (log.isInfoEnabled()) {
                log.info(
                        "gateway auth refused {} {}: {}",
                        exchange.getRequest().getMethod(),
                        path,
                        result.reason());
            }
            return reject(exchange, result.reason());
        }
        ServerWebExchange mutated = exchange.mutate()
                .request(exchange.getRequest().mutate()
                        .header(SUBJECT_HEADER, result.subject())
                        .header(SCOPES_HEADER, String.join(",", result.scopes()))
                        .build())
                .build();
        return chain.filter(mutated);
    }

    private boolean isWhitelisted(String path) {
        // SC-32: path-SEGMENT prefix match (also used by PlatformAuthFilter). A bare startsWith("/fallback")
        // would also open /fallbackish — a sibling, not a child. AuthPolicy is the one boundary rule.
        return AuthPolicy.isOpen(path, whitelistExact, whitelistPrefixes);
    }

    private static String bearerToken(ServerWebExchange exchange) {
        String header = exchange.getRequest().getHeaders().getFirst(AUTH_HEADER);
        if (header == null || !header.startsWith(BEARER)) {
            return null;
        }
        String token = header.substring(BEARER.length()).trim();
        return token.isEmpty() ? null : token;
    }

    /**
     * Verify a token and return what it claims, or why it is not acceptable.
     *
     * <p>The signed bytes are the canonical payload string (the UTF-8 of the decoded payload), so no JSON
     * canonicalisation disagreement can ever let a tampered token verify. The signature is checked first and
     * in constant time; only a signed payload is parsed for expiry.
     */
    static Verification verify(String token, String secret) {
        int dot = token.indexOf('.');
        if (dot < 0 || dot == token.length() - 1) {
            return Verification.invalid("bad_format");
        }
        byte[] payloadBytes;
        byte[] expectedSig;
        try {
            payloadBytes = base64urlDecode(token.substring(0, dot));
            expectedSig = base64urlDecode(token.substring(dot + 1));
        } catch (RuntimeException e) {
            return Verification.invalid("bad_encoding");
        }
        byte[] actualSig = hmac(secret, payloadBytes);
        if (!constantTimeEquals(actualSig, expectedSig)) {
            return Verification.invalid("bad_signature");
        }
        String payload;
        try {
            payload = new String(payloadBytes, StandardCharsets.UTF_8);
        } catch (RuntimeException e) {
            return Verification.invalid("bad_encoding");
        }
        String subject = findString(payload, "sub");
        if (subject == null || subject.isEmpty()) {
            return Verification.invalid("bad_subject");
        }
        long exp = findLong(payload, "exp");
        long now = System.currentTimeMillis() / 1000L;
        // A one-second leeway is the only clock-skew trust this door grants; it is explicit, not accidental.
        if (exp < 0 || exp + 1 < now) {
            return Verification.invalid("expired");
        }
        return Verification.ok(subject, findScopes(payload));
    }

    /**
     * Mint a token with the SAME code path verification trusts. The deployment would call this from an
     * identity service; the test calls it to prove a real, valid token is accepted (§159: no fake pixels, no
     * fake tokens — this one is signed with the same secret it is verified against).
     */
    static String mint(String subject, List<String> scopes, String secret, long ttlSeconds) {
        long now = System.currentTimeMillis() / 1000L;
        StringBuilder sb = new StringBuilder();
        sb.append("{\"sub\":\"").append(subject).append("\",\"scp\":[");
        for (int i = 0; i < scopes.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append('"').append(scopes.get(i)).append('"');
        }
        sb.append("],\"iat\":").append(now).append(",\"exp\":").append(now + ttlSeconds).append('}');
        byte[] payloadBytes = sb.toString().getBytes(StandardCharsets.UTF_8);
        byte[] sig = hmac(secret, payloadBytes);
        return base64url(payloadBytes) + "." + base64url(sig);
    }

    private static byte[] hmac(String secret, byte[] data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(data);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
    }

    private static String base64url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static byte[] base64urlDecode(String s) {
        return Base64.getUrlDecoder().decode(s);
    }

    private static boolean constantTimeEquals(byte[] a, byte[] b) {
        if (a.length != b.length) {
            return false;
        }
        int r = 0;
        for (int i = 0; i < a.length; i++) {
            r |= (a[i] ^ b[i]);
        }
        return r == 0;
    }

    private static String findString(String json, String key) {
        String needle = "\"" + key + "\":\"";
        int start = json.indexOf(needle);
        if (start < 0) {
            return null;
        }
        int from = start + needle.length();
        int end = json.indexOf('"', from);
        if (end < 0) {
            return null;
        }
        return json.substring(from, end);
    }

    private static long findLong(String json, String key) {
        String needle = "\"" + key + "\":";
        int start = json.indexOf(needle);
        if (start < 0) {
            return -1;
        }
        int from = start + needle.length();
        int end = from;
        while (end < json.length() && json.charAt(end) >= '0' && json.charAt(end) <= '9') {
            end++;
        }
        if (end == from) {
            return -1;
        }
        return Long.parseLong(json.substring(from, end));
    }

    private static List<String> findScopes(String json) {
        String needle = "\"scp\":[";
        int start = json.indexOf(needle);
        if (start < 0) {
            return List.of();
        }
        int from = start + needle.length();
        if (from < json.length() && json.charAt(from) == ']') {
            return List.of();
        }
        List<String> scopes = new ArrayList<>();
        int i = from;
        while (i < json.length()) {
            int q1 = json.indexOf('"', i);
            if (q1 < 0) {
                break;
            }
            int q2 = json.indexOf('"', q1 + 1);
            if (q2 < 0) {
                break;
            }
            scopes.add(json.substring(q1 + 1, q2));
            i = q2 + 1;
            int bracket = json.indexOf(']', i);
            if (bracket < 0) {
                break;
            }
            int comma = json.indexOf(',', i);
            if (comma < 0 || bracket < comma) {
                break;
            }
            i = comma + 1;
        }
        return scopes;
    }

    private Mono<Void> reject(ServerWebExchange exchange, String reason) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        // SC-32: one refusal dialect for both doors; a caller sees ONE 401 shape for the whole gateway.
        String body = AuthPolicy.refusalBody(reason);
        return response.writeWith(Mono.just(response.bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8))));
    }

    @Override
    public int getOrder() {
        return ORDER;
    }

    /** The result of {@link #verify}: either a granted subject+scopes, or a machine-readable refusal reason. */
    static final class Verification {
        private final boolean ok;
        private final String subject;
        private final List<String> scopes;
        private final String reason;

        private Verification(boolean ok, String subject, List<String> scopes, String reason) {
            this.ok = ok;
            this.subject = subject;
            this.scopes = scopes;
            this.reason = reason;
        }

        static Verification missing() {
            return new Verification(false, null, List.of(), "missing_token");
        }

        static Verification invalid(String reason) {
            return new Verification(false, null, List.of(), reason);
        }

        static Verification ok(String subject, List<String> scopes) {
            return new Verification(true, subject, scopes, null);
        }

        boolean ok() {
            return ok;
        }

        String reason() {
            return reason;
        }

        String subject() {
            return subject;
        }

        List<String> scopes() {
            return scopes;
        }
    }
}
