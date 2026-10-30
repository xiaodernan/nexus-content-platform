package dev.nexus.api.webhooks;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

/**
 * M10 v557 — the signature's contract, asserted against a vector computed by a SECOND implementation.
 *
 * <p>The expected hex below was produced by Node's {@code crypto.createHmac('sha256', ...)} over
 * {@code "1700000000." + body}, not by this class: a test that compares the code to itself would pass on any
 * canonical string, including the wrong one. The vector is the independent witness that this service signs
 * the shape Stripe's subscribers already implement.
 */
class WebhookSignerTest {

    private static final Instant AT = Instant.ofEpochSecond(1_700_000_000L);
    private static final String SECRET = "whsec-demo-secret";
    private static final String BODY = "{\"event\":\"publish\",\"id\":\"pub-1\"}";

    /** node -e "crypto.createHmac('sha256','whsec-demo-secret').update('1700000000.'+body)" */
    private static final String NODE_VECTOR =
            "bf70a2854e98c117c4f4945a051c775462ad6880cd2e01ece7745766e85a4df8";

    /** The same body signed one window later (1700000300) — the timestamp is inside the signature. */
    private static final String NODE_VECTOR_LATER =
            "52fcc1a92b0faa4ac8b2705a88b45a2aeaa49137b04c541b7ee7225789dd67df";

    @Test
    void theHeaderIsTimeDotHmacAndTheHmacIsTheIndependentVector() {
        String header = WebhookSigner.header(SECRET, BODY, AT);
        assertThat(header).isEqualTo("t=1700000000,v1=" + NODE_VECTOR);
        assertThat(WebhookSigner.signHex(SECRET, 1_700_000_000L, BODY)).isEqualTo(NODE_VECTOR);
        assertThat(WebhookSigner.signHex(SECRET, 1_700_000_300L, BODY)).isEqualTo(NODE_VECTOR_LATER);
    }

    @Test
    void aGenuineDeliveryVerifiesInsideTheWindow() {
        String header = WebhookSigner.header(SECRET, BODY, AT);
        assertThat(WebhookSigner.verify(SECRET, header, BODY, AT, 300)).isTrue();
        // The same delivery, read four minutes late, is still inside a five-minute window.
        assertThat(WebhookSigner.verify(SECRET, header, BODY, AT.plusSeconds(240), 300)).isTrue();
    }

    @Test
    void aChangedBodyIsRefused() {
        String header = WebhookSigner.header(SECRET, BODY, AT);
        assertThat(WebhookSigner.verify(SECRET, header, "{\"event\":\"publish\",\"id\":\"pub-2\"}", AT, 300))
                .isFalse();
    }

    @Test
    void aChangedSecretIsRefused() {
        String header = WebhookSigner.header(SECRET, BODY, AT);
        assertThat(WebhookSigner.verify("whsec-other", header, BODY, AT, 300)).isFalse();
    }

    @Test
    void aSignatureOlderOrNewerThanTheWindowIsRefused() {
        String header = WebhookSigner.header(SECRET, BODY, AT);
        assertThat(WebhookSigner.verify(SECRET, header, BODY, AT.plusSeconds(400), 300)).isFalse();
        assertThat(WebhookSigner.verify(SECRET, header, BODY, AT.minusSeconds(400), 300)).isFalse();
        // A zero-second window accepts the exact instant and nothing else.
        assertThat(WebhookSigner.verify(SECRET, header, BODY, AT, 0)).isTrue();
        assertThat(WebhookSigner.verify(SECRET, header, BODY, AT.plusSeconds(1), 0)).isFalse();
    }

    @Test
    void aNegativeToleranceIsRefusedRatherThanReadAsEternal() {
        String header = WebhookSigner.header(SECRET, BODY, AT);
        assertThat(WebhookSigner.verify(SECRET, header, BODY, AT, -1)).isFalse();
    }

    @Test
    void uppercaseHexIsASpellingOfTheSameSignature() {
        String header = "t=1700000000,v1=" + NODE_VECTOR.toUpperCase(java.util.Locale.ROOT);
        assertThat(WebhookSigner.verify(SECRET, header, BODY, AT, 300)).isTrue();
    }

    @Test
    void duringRotationAnyMatchingV1IsAccepted() {
        String header = "t=1700000000,v1=" + "0".repeat(64) + ",v1=" + NODE_VECTOR;
        assertThat(WebhookSigner.verify(SECRET, header, BODY, AT, 300)).isTrue();
    }

    @Test
    void aMalformedHeaderIsAnAnswerNotAnException() {
        assertThat(WebhookSigner.verify(SECRET, null, BODY, AT, 300)).isFalse();
        assertThat(WebhookSigner.verify(SECRET, "", BODY, AT, 300)).isFalse();
        assertThat(WebhookSigner.verify(SECRET, "v1=" + NODE_VECTOR, BODY, AT, 300)).isFalse();
        assertThat(WebhookSigner.verify(SECRET, "t=1700000000", BODY, AT, 300)).isFalse();
        assertThat(WebhookSigner.verify(SECRET, "t=not-a-number,v1=" + NODE_VECTOR, BODY, AT, 300)).isFalse();
        assertThat(WebhookSigner.verify(null, "t=1700000000,v1=" + NODE_VECTOR, BODY, AT, 300)).isFalse();
        assertThat(WebhookSigner.verify(SECRET, "t=1700000000,v1=" + NODE_VECTOR, null, AT, 300)).isFalse();
        assertThat(WebhookSigner.verify(SECRET, "t=1700000000,v1=" + NODE_VECTOR, BODY, null, 300)).isFalse();
    }

    @Test
    void theHeaderCarriesTheNameEverySubscriberWillRead() {
        assertThat(WebhookSigner.HEADER_NAME).isEqualTo("Nexus-Signature");
        assertThat(WebhookSigner.DEFAULT_TOLERANCE_SECONDS).isEqualTo(300);
    }
}
