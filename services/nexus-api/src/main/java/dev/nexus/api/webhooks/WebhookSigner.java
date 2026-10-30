package dev.nexus.api.webhooks;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * M10 v557 — how a delivery is SIGNED, so a subscriber can tell this service from anyone who guessed its URL.
 *
 * <p>The canonical string is {@code <timestamp>.<body>} and the header is
 * {@code t=<epoch seconds>,v1=<hex hmac>} — the shape Stripe's webhooks taught the industry, chosen because a
 * subscriber already has an implementation of it in every language, not because the shape is ours.
 *
 * <p>Three rules, each with a reason:
 *
 * <ul>
 *   <li>The timestamp is INSIDE the signed string, so a captured request cannot be re-aimed at a later
 *       moment: changing {@code t} changes what was signed.
 *   <li>Verification is TIME-BOUNDED. A signature valid forever is a replay a subscriber must store every
 *       body to refuse; the tolerance makes the window a number the subscriber chooses.
 *   <li>The comparison is constant-time. An {@code equals} on the hex leaks, one character at a time, how
 *       much of a forged signature was right.
 * </ul>
 *
 * <p>What this does NOT do: it does not prove the body was not MODIFIED IN TRANSIT for a subscriber that
 * skips verification, and it says nothing about the sender's identity beyond possession of the secret. TLS
 * and the secret are the two halves, and this is the second one.
 */
public final class WebhookSigner {

    /** The header the signature travels in. */
    public static final String HEADER_NAME = "Nexus-Signature";

    /**
     * The default window a signature is accepted in — five minutes, stated as a default rather than baked
     * into {@link #verify}: the window belongs to the subscriber's clock and traffic pattern.
     */
    public static final long DEFAULT_TOLERANCE_SECONDS = 300;

    private static final String ALGORITHM = "HmacSHA256";

    private WebhookSigner() {
    }

    /** The header value for one body, signed at one instant. */
    public static String header(String secret, String body, Instant at) {
        long timestamp = at.getEpochSecond();
        return "t=" + timestamp + ",v1=" + signHex(secret, timestamp, body);
    }

    /** The HMAC itself, lowercase hex, over the canonical string. */
    static String signHex(String secret, long timestampSeconds, String body) {
        String canonical = timestampSeconds + "." + (body == null ? "" : body);
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), ALGORITHM));
            byte[] raw = mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(raw.length * 2);
            for (byte b : raw) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException | java.security.InvalidKeyException e) {
            throw new IllegalStateException("HmacSHA256 is part of every JRE — this is a broken runtime, not a bad key", e);
        }
    }

    /**
     * Whether a header, a body and a secret agree AND the timestamp is inside the window.
     *
     * <p>Every refusal is a {@code false} rather than an exception: a verifier is asked "is this genuine",
     * and a malformed header is an answer to that question. Several {@code v1} entries are accepted (a
     * subscriber rotating two secrets at once is a real migration), and a match with ANY of them is a pass.
     */
    public static boolean verify(
            String secret, String headerValue, String body, Instant now, long toleranceSeconds) {
        if (secret == null || secret.isBlank() || headerValue == null || body == null || now == null) {
            return false;
        }
        if (toleranceSeconds < 0) {
            return false;
        }
        Long timestamp = null;
        List<String> candidates = new ArrayList<>();
        for (String part : headerValue.split(",")) {
            String piece = part.trim();
            if (piece.startsWith("t=")) {
                try {
                    timestamp = Long.parseLong(piece.substring(2));
                } catch (NumberFormatException e) {
                    return false;
                }
            } else if (piece.startsWith("v1=")) {
                candidates.add(piece.substring(3).trim());
            }
        }
        if (timestamp == null || candidates.isEmpty()) {
            return false;
        }
        long skew = Math.abs(now.getEpochSecond() - timestamp);
        if (skew > toleranceSeconds) {
            return false;
        }
        String expected = signHex(secret, timestamp, body);
        for (String candidate : candidates) {
            // Constant time, and case-insensitive: a subscriber that uppercased the hex is not a forgery.
            if (MessageDigest.isEqual(
                    expected.getBytes(StandardCharsets.UTF_8),
                    candidate.toLowerCase(java.util.Locale.ROOT).getBytes(StandardCharsets.UTF_8))) {
                return true;
            }
        }
        return false;
    }
}
