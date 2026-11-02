package dev.nexus.api.webhooks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.nexus.api.webhooks.WebhookDtos.DeliveryAnswer;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * M10 v558 — the delivery half graded without a socket: the rescuer decides, the transport is a mock.
 *
 * <p>The three load-bearing cases are the ones a human would not catch by reading:
 * {@link #aNameThatResolvesToAPrivateAddressIsRefusedAndNothingIsSent()} (the DNS-rebinding hole),
 * {@link #theSignatureHeaderVerifiesAgainstTheBodyThatWasSent()} (the bytes signed are the bytes sent) and
 * {@link #aRefusalAndAnUnreachableEndpointAreDifferentOutcomes()} (a non-2xx is an answer, not a failure).
 *
 * <p>v559 adds the FAN-OUT cases: only the rows that asked for the verb are called, oldest first, one failure
 * does not silence the rest, the SAME body is signed with each row's OWN key, and the resolution-time address
 * check is reused rather than re-implemented — the one rule a fan-out path is most likely to skip.
 */
@ExtendWith(MockitoExtension.class)
class WebhookDispatcherTest {

    private static final Instant AT = Instant.parse("2026-10-30T09:00:00Z");
    private static final String SUBSCRIBER = "acct-ada";
    private static final String WEBHOOK_ID = "wh-1";
    private static final String ENDPOINT = "https://hooks.example.com/nexus";
    private static final String SECRET = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

    /** A SECOND key, so "the body is shared and the signature is not" is a claim a test can tell apart. */
    private static final String OTHER_SECRET = "b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f901";

    @Mock
    private WebhookSubscriptionRepository repository;

    @Mock
    private HostResolver resolver;

    @Mock
    private WebhookTransport transport;

    @Mock
    private WebhookDeliveryLog deliveryLog;

    private final ObjectMapper mapper = new ObjectMapper();

    private WebhookDispatcher dispatcher;

    @BeforeEach
    void setUp() {
        dispatcher = new WebhookDispatcher(
                repository, resolver, transport, deliveryLog, mapper, Clock.fixed(AT, ZoneOffset.UTC));
    }

    private static WebhookSubscription row() {
        return new WebhookSubscription(WEBHOOK_ID, SUBSCRIBER, ENDPOINT, "publish", SECRET, AT);
    }

    /** A fan-out row: its own endpoint path, its own secret, and the instant it was made. */
    private static WebhookSubscription row(String id, String events, String secret, Instant createdAt) {
        return new WebhookSubscription(
                id, SUBSCRIBER, "https://hooks.example.com/" + id, events, secret, createdAt);
    }

    private static InetAddress address(String literal) throws Exception {
        // A literal, so this never asks the network — InetAddress only looks up NAMES.
        return InetAddress.getByName(literal);
    }

    @Test
    void anIdThatNamesNothingIsA404RatherThanAFailedDelivery() {
        when(repository.findById(WEBHOOK_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> dispatcher.ping(WEBHOOK_ID, SUBSCRIBER))
                .isInstanceOf(NoSuchWebhook.class)
                .hasMessageContaining(WEBHOOK_ID);
        verifyNoInteractions(transport);
    }

    @Test
    void somebodyElsesWebhookIsForbiddenBeforeAnyBytesExist() {
        when(repository.findById(WEBHOOK_ID)).thenReturn(Optional.of(row()));

        assertThatThrownBy(() -> dispatcher.ping(WEBHOOK_ID, "acct-eve"))
                .isInstanceOf(NotYourWebhook.class);
        verifyNoInteractions(resolver, transport);
    }

    @Test
    void aPingWithoutASubscriberIsRefusedByName() {
        assertThatThrownBy(() -> dispatcher.ping(WEBHOOK_ID, "  "))
                .isInstanceOf(InvalidWebhook.class)
                .hasMessageContaining("subscriber");
        verifyNoInteractions(repository, resolver, transport);
    }

    @Test
    void aNameThatResolvesToAPrivateAddressIsRefusedAndNothingIsSent() throws Exception {
        when(repository.findById(WEBHOOK_ID)).thenReturn(Optional.of(row()));
        when(resolver.resolve("hooks.example.com")).thenReturn(List.of(address("10.1.2.3")));

        DeliveryAnswer answer = dispatcher.ping(WEBHOOK_ID, SUBSCRIBER);

        assertThat(answer.delivered()).isFalse();
        assertThat(answer.outcome()).isEqualTo(WebhookDispatcher.OUTCOME_REFUSED);
        assertThat(answer.detail()).isEqualTo(WebhookDispatcher.DETAIL_PRIVATE_ADDRESS);
        assertThat(answer.status()).isNull();
        // The point of the rule: the request never reaches a socket.
        verifyNoInteractions(transport);
    }

    @Test
    void everyAddressAMultiHomedNameResolvesToMustPass() throws Exception {
        when(repository.findById(WEBHOOK_ID)).thenReturn(Optional.of(row()));
        when(resolver.resolve("hooks.example.com"))
                .thenReturn(List.of(address("93.184.216.34"), address("127.0.0.1")));

        DeliveryAnswer answer = dispatcher.ping(WEBHOOK_ID, SUBSCRIBER);

        assertThat(answer.outcome()).isEqualTo(WebhookDispatcher.OUTCOME_REFUSED);
        assertThat(answer.detail()).isEqualTo(WebhookDispatcher.DETAIL_PRIVATE_ADDRESS);
        verifyNoInteractions(transport);
    }

    @Test
    void aNameThatDoesNotResolveIsUnreachableAndNamesTheLookup() throws Exception {
        when(repository.findById(WEBHOOK_ID)).thenReturn(Optional.of(row()));
        when(resolver.resolve("hooks.example.com")).thenThrow(new UnknownHostException("rebind"));

        DeliveryAnswer answer = dispatcher.ping(WEBHOOK_ID, SUBSCRIBER);

        assertThat(answer.outcome()).isEqualTo(WebhookDispatcher.OUTCOME_UNREACHABLE);
        assertThat(answer.detail()).isEqualTo("UnknownHostException");
        assertThat(answer.status()).isNull();
        verifyNoInteractions(transport);
    }

    @Test
    void theSignatureHeaderVerifiesAgainstTheBodyThatWasSent() throws Exception {
        when(repository.findById(WEBHOOK_ID)).thenReturn(Optional.of(row()));
        when(resolver.resolve("hooks.example.com")).thenReturn(List.of(address("93.184.216.34")));
        when(transport.post(any(), any(), any(), any())).thenReturn(new WebhookTransport.WebhookResponse(200));

        DeliveryAnswer answer = dispatcher.ping(WEBHOOK_ID, "  " + SUBSCRIBER + "  ");

        ArgumentCaptor<String> url = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> headers = ArgumentCaptor.forClass(Map.class);
        verify(transport).post(url.capture(), body.capture(), headers.capture(), eq(WebhookDispatcher.DELIVERY_TIMEOUT));

        assertThat(answer.delivered()).isTrue();
        assertThat(answer.outcome()).isEqualTo(WebhookDispatcher.OUTCOME_DELIVERED);
        assertThat(answer.status()).isEqualTo(200);
        assertThat(answer.detail()).isNull();
        assertThat(answer.webhookId()).isEqualTo(WEBHOOK_ID);
        assertThat(answer.url()).isEqualTo(ENDPOINT);
        assertThat(url.getValue()).isEqualTo(ENDPOINT);

        JsonNode sent = mapper.readTree(body.getValue());
        assertThat(sent.get("event").asText()).isEqualTo(WebhookDispatcher.PING_EVENT);
        assertThat(sent.get("targetId").asText()).isEqualTo(WEBHOOK_ID);
        assertThat(sent.get("at").asLong()).isEqualTo(AT.toEpochMilli());

        String header = headers.getValue().get(WebhookSigner.HEADER_NAME);
        assertThat(headers.getValue().get("Content-Type")).contains("application/json");
        // v563 — the SAME id the answer names travels on the wire: one knock, one identity.
        assertThat(headers.getValue().get(WebhookDispatcher.DELIVERY_ID_HEADER))
                .isEqualTo(answer.deliveryId());
        // The header is the one a subscriber will actually compute a verdict with.
        assertThat(WebhookSigner.verify(SECRET, header, body.getValue(), AT, 300)).isTrue();
    }

    @Test
    void aRefusalAndAnUnreachableEndpointAreDifferentOutcomes() throws Exception {
        when(repository.findById(WEBHOOK_ID)).thenReturn(Optional.of(row()));
        when(resolver.resolve("hooks.example.com")).thenReturn(List.of(address("93.184.216.34")));

        when(transport.post(any(), any(), any(), any()))
                .thenReturn(new WebhookTransport.WebhookResponse(500))
                .thenThrow(new java.io.IOException("connection reset"));

        DeliveryAnswer refused = dispatcher.ping(WEBHOOK_ID, SUBSCRIBER);
        DeliveryAnswer unreachable = dispatcher.ping(WEBHOOK_ID, SUBSCRIBER);

        assertThat(refused.delivered()).isFalse();
        assertThat(refused.outcome()).isEqualTo(WebhookDispatcher.OUTCOME_REFUSED);
        assertThat(refused.status()).isEqualTo(500);
        assertThat(refused.detail()).isEqualTo("status");

        assertThat(unreachable.delivered()).isFalse();
        assertThat(unreachable.outcome()).isEqualTo(WebhookDispatcher.OUTCOME_UNREACHABLE);
        assertThat(unreachable.status()).isNull();
        assertThat(unreachable.detail()).isEqualTo("IOException");
    }

    @Test
    void everyNonTwoHundredIsARefusalIncludingARedirect() throws Exception {
        when(repository.findById(WEBHOOK_ID)).thenReturn(Optional.of(row()));
        when(resolver.resolve("hooks.example.com")).thenReturn(List.of(address("93.184.216.34")));
        when(transport.post(any(), any(), any(), any()))
                .thenReturn(new WebhookTransport.WebhookResponse(302))
                .thenReturn(new WebhookTransport.WebhookResponse(204));

        assertThat(dispatcher.ping(WEBHOOK_ID, SUBSCRIBER).outcome())
                .isEqualTo(WebhookDispatcher.OUTCOME_REFUSED);
        // 204 is a 2xx: an endpoint that says "done, nothing to say" has accepted the delivery.
        assertThat(dispatcher.ping(WEBHOOK_ID, SUBSCRIBER).outcome())
                .isEqualTo(WebhookDispatcher.OUTCOME_DELIVERED);
    }

    @Test
    void thePrivateAddressRuleCoversEveryFamilyThePlatformKnows() throws Exception {
        // Loopback, any-local, link-local, site-local, multicast — InetAddress's own predicates.
        assertThat(WebhookDispatcher.isPrivateAddress(address("127.0.0.1"))).isTrue();
        assertThat(WebhookDispatcher.isPrivateAddress(address("0.0.0.0"))).isTrue();
        assertThat(WebhookDispatcher.isPrivateAddress(address("169.254.1.1"))).isTrue();
        assertThat(WebhookDispatcher.isPrivateAddress(address("192.168.2.3"))).isTrue();
        assertThat(WebhookDispatcher.isPrivateAddress(address("224.0.0.1"))).isTrue();
        assertThat(WebhookDispatcher.isPrivateAddress(address("::1"))).isTrue();
        // IPv6 unique-local, which Java's isSiteLocalAddress does NOT cover (it knows the deprecated fec0::/10).
        assertThat(WebhookDispatcher.isPrivateAddress(address("fc00::1"))).isTrue();
        assertThat(WebhookDispatcher.isPrivateAddress(address("fd12:3456::1"))).isTrue();
        // Public addresses, or the rule would be about "looks internal" rather than where the bytes go.
        assertThat(WebhookDispatcher.isPrivateAddress(address("93.184.216.34"))).isFalse();
        assertThat(WebhookDispatcher.isPrivateAddress(address("2001:db8::1"))).isFalse();
    }

    // ── v559: fan-out — who is called, in what order, and what happens when one endpoint fails ───────

    @Test
    void theFanOutReachesONLYTheSubscriptionsThatAskedForThatVerb() throws Exception {
        when(repository.findAll()).thenReturn(List.of(
                row("wh-publish", "publish", SECRET, AT.minusSeconds(10)),
                row("wh-like", "like", SECRET, AT),
                row("wh-both", "publish,like", SECRET, AT.minusSeconds(5))));
        when(resolver.resolve("hooks.example.com")).thenReturn(List.of(address("93.184.216.34")));
        when(transport.post(any(), any(), any(), any())).thenReturn(new WebhookTransport.WebhookResponse(200));

        List<DeliveryAnswer> answers = dispatcher.deliver("publish", "pub-1", AT);

        assertThat(answers).extracting(DeliveryAnswer::webhookId).containsExactly("wh-publish", "wh-both");
        // The subscription that asked only for `like` is not called at all: a verb it did not ask for is
        // not "extra information", it is somebody else's fact arriving at an endpoint that never wanted it.
        ArgumentCaptor<String> urls = ArgumentCaptor.forClass(String.class);
        verify(transport, times(2)).post(urls.capture(), any(), any(), any());
        assertThat(urls.getAllValues()).containsExactly(
                "https://hooks.example.com/wh-publish", "https://hooks.example.com/wh-both");
    }

    @Test
    void theFanOutIsOLDESTFirstAndTheIdBreaksATieEvenWhenTheTableAnswersInAnotherOrder() throws Exception {
        when(repository.findAll()).thenReturn(List.of(
                row("wh-z", "publish", SECRET, AT),
                row("wh-newest", "publish", SECRET, AT.plusSeconds(1)),
                row("wh-a", "publish", SECRET, AT)));
        when(resolver.resolve("hooks.example.com")).thenReturn(List.of(address("93.184.216.34")));
        when(transport.post(any(), any(), any(), any())).thenReturn(new WebhookTransport.WebhookResponse(200));

        List<DeliveryAnswer> answers = dispatcher.deliver("publish", "pub-1", AT);

        // The order is the dispatcher's, not the table's: same-instant rows fall back to the id, so two
        // runs of the same event answer in the same order and a subscriber's log can be diffed.
        assertThat(answers).extracting(DeliveryAnswer::webhookId)
                .containsExactly("wh-a", "wh-z", "wh-newest");
    }

    @Test
    void oneUnreachableEndpointDoesNotSilenceTheOthers() throws Exception {
        when(repository.findAll()).thenReturn(List.of(
                row("wh-1", "publish", SECRET, AT),
                row("wh-2", "publish", SECRET, AT.plusSeconds(1)),
                row("wh-3", "publish", SECRET, AT.plusSeconds(2))));
        when(resolver.resolve("hooks.example.com")).thenReturn(List.of(address("93.184.216.34")));
        when(transport.post(any(), any(), any(), any())).thenReturn(new WebhookTransport.WebhookResponse(200));
        when(transport.post(eq("https://hooks.example.com/wh-2"), any(), any(), any()))
                .thenThrow(new java.io.IOException("connection reset"));

        List<DeliveryAnswer> answers = dispatcher.deliver("publish", "pub-1", AT);

        // Every row that asked is still ATTEMPTED, and the middle one's failure is reported, not fatal.
        assertThat(answers).extracting(DeliveryAnswer::webhookId).containsExactly("wh-1", "wh-2", "wh-3");
        assertThat(answers).extracting(DeliveryAnswer::outcome).containsExactly(
                WebhookDispatcher.OUTCOME_DELIVERED,
                WebhookDispatcher.OUTCOME_UNREACHABLE,
                WebhookDispatcher.OUTCOME_DELIVERED);
    }

    @Test
    void theBodyIsSignedOncePerEndpointWithEachRowsOwnKey() throws Exception {
        when(repository.findAll()).thenReturn(List.of(
                row("wh-1", "publish", SECRET, AT),
                row("wh-2", "publish", OTHER_SECRET, AT.plusSeconds(1))));
        when(resolver.resolve("hooks.example.com")).thenReturn(List.of(address("93.184.216.34")));
        when(transport.post(any(), any(), any(), any())).thenReturn(new WebhookTransport.WebhookResponse(200));

        dispatcher.deliver("publish", "pub-1", AT);

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> headers = ArgumentCaptor.forClass(Map.class);
        verify(transport, times(2)).post(any(), body.capture(), headers.capture(), any());

        String first = body.getAllValues().get(0);
        // ONE body, because the event is one fact: two subscribers must be able to compare their bytes.
        assertThat(body.getAllValues().get(1)).isEqualTo(first);
        JsonNode sent = mapper.readTree(first);
        assertThat(sent.get("event").asText()).isEqualTo("publish");
        assertThat(sent.get("targetId").asText()).isEqualTo("pub-1");
        assertThat(sent.get("at").asLong()).isEqualTo(AT.toEpochMilli());

        String firstHeader = headers.getAllValues().get(0).get(WebhookSigner.HEADER_NAME);
        String secondHeader = headers.getAllValues().get(1).get(WebhookSigner.HEADER_NAME);
        // Shared bytes, DIFFERENT keys: each answer is the one its own subscriber can verify.
        assertThat(WebhookSigner.verify(SECRET, firstHeader, first, AT, 300)).isTrue();
        assertThat(WebhookSigner.verify(OTHER_SECRET, secondHeader, first, AT, 300)).isTrue();
        assertThat(WebhookSigner.verify(SECRET, secondHeader, first, AT, 300)).isFalse();
    }

    @Test
    void theFanOutRefusesANameThatResolvesToAPrivateAddressJustAsThePingDoes() throws Exception {
        when(repository.findAll()).thenReturn(List.of(row("wh-1", "publish", SECRET, AT)));
        when(resolver.resolve("hooks.example.com")).thenReturn(List.of(address("10.1.2.3")));

        List<DeliveryAnswer> answers = dispatcher.deliver("publish", "pub-1", AT);

        // The address rule is in the ONE attempt path, so a fan-out cannot re-open the hole v558 closed.
        assertThat(answers).hasSize(1);
        assertThat(answers.get(0).outcome()).isEqualTo(WebhookDispatcher.OUTCOME_REFUSED);
        assertThat(answers.get(0).detail()).isEqualTo(WebhookDispatcher.DETAIL_PRIVATE_ADDRESS);
        verifyNoInteractions(transport);
    }

    @Test
    void aFanOutThatNamesNoEventIsREFUSEDRatherThanAnsweredWithAnEmptyList() {
        assertThatThrownBy(() -> dispatcher.deliver("  ", "pub-1", AT))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("event");
        // Nothing is read: an empty answer would say "nobody asked", which is a different fact.
        verifyNoInteractions(repository, resolver, transport, deliveryLog);
    }

    // ── v560: every attempt leaves a RECEIPT ───────────────────────────────────────────────────────

    @Test
    void thePingWritesAReceiptWithWhatTheEndpointDid() throws Exception {
        when(repository.findById(WEBHOOK_ID)).thenReturn(Optional.of(row()));
        when(resolver.resolve("hooks.example.com")).thenReturn(List.of(address("93.184.216.34")));
        when(transport.post(any(), any(), any(), any())).thenReturn(new WebhookTransport.WebhookResponse(200));

        DeliveryAnswer answer = dispatcher.ping(WEBHOOK_ID, SUBSCRIBER);

        // One row per ATTEMPT, whatever the outcome: the receipt is what the owner reads tomorrow, and it
        // carries the id the answer gave (v563) so the owner can find the row they just made.
        verify(deliveryLog).record(
                any(WebhookSubscription.class),
                eq(answer.deliveryId()),
                eq(WebhookDispatcher.PING_EVENT),
                eq(WEBHOOK_ID),
                eq(AT),
                eq(WebhookDispatcher.OUTCOME_DELIVERED),
                eq(200),
                isNull());
    }

    @Test
    void theFanOutWritesOneReceiptPerAttemptEvenWhenAnEndpointFails() throws Exception {
        when(repository.findAll()).thenReturn(List.of(
                row("wh-1", "publish", SECRET, AT),
                row("wh-2", "publish", SECRET, AT.plusSeconds(1))));
        when(resolver.resolve("hooks.example.com")).thenReturn(List.of(address("93.184.216.34")));
        when(transport.post(any(), any(), any(), any())).thenReturn(new WebhookTransport.WebhookResponse(200));
        when(transport.post(eq("https://hooks.example.com/wh-2"), any(), any(), any()))
                .thenThrow(new java.io.IOException("connection reset"));

        dispatcher.deliver("publish", "pub-1", AT);

        ArgumentCaptor<String> outcomes = ArgumentCaptor.forClass(String.class);
        verify(deliveryLog, times(2)).record(
                any(WebhookSubscription.class),
                any(),
                eq("publish"),
                eq("pub-1"),
                eq(AT),
                outcomes.capture(),
                any(),
                any());
        // A failed attempt is recorded like any other: "we called and nothing answered" is a fact the
        // subscriber is entitled to see, and the log is not a list of successes.
        assertThat(outcomes.getAllValues()).containsExactly(
                WebhookDispatcher.OUTCOME_DELIVERED, WebhookDispatcher.OUTCOME_UNREACHABLE);
    }

    // ── v563: one recorded attempt can be REPEATED, and every knock names itself ─────────────────

    /** A receipt the log already holds: the source a redelivery repeats. */
    private static WebhookDelivery receipt(String id, String event, String targetId, Instant eventAt) {
        return new WebhookDelivery(
                id, WEBHOOK_ID, SUBSCRIBER, event, targetId,
                WebhookDispatcher.OUTCOME_UNREACHABLE, null, "UnknownHostException",
                eventAt, eventAt.plusSeconds(2), null);
    }

    @Test
    void aRedeliveryRepeatsTheFactsBytesWithANewKnockAndTheCURRENTKey() throws Exception {
        Instant factAt = AT.minusSeconds(30);
        WebhookDelivery source = receipt("d-src", "publish", "pub-1", factAt);
        // The subscription ROTATED since the source was written: the key on it now is not the one the
        // original attempt used, and the redelivery must sign with the current one.
        WebhookSubscription rotated = new WebhookSubscription(
                WEBHOOK_ID, SUBSCRIBER, ENDPOINT, "publish", OTHER_SECRET, AT);
        when(deliveryLog.find("d-src")).thenReturn(source);
        when(repository.findById(WEBHOOK_ID)).thenReturn(Optional.of(rotated));
        when(resolver.resolve("hooks.example.com")).thenReturn(List.of(address("93.184.216.34")));
        when(transport.post(any(), any(), any(), any())).thenReturn(new WebhookTransport.WebhookResponse(200));

        DeliveryAnswer answer = dispatcher.redeliver("d-src", SUBSCRIBER);

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> headers = ArgumentCaptor.forClass(Map.class);
        verify(transport).post(eq(ENDPOINT), body.capture(), headers.capture(),
                eq(WebhookDispatcher.DELIVERY_TIMEOUT));

        // The BODY is the fact: the event, the target and the ORIGINAL instant — not this clock.
        assertThat(mapper.readTree(body.getValue())).isEqualTo(mapper.readTree(
                "{\"event\":\"publish\",\"targetId\":\"pub-1\",\"at\":" + factAt.toEpochMilli() + "}"));
        String header = headers.getValue().get(WebhookSigner.HEADER_NAME);
        assertThat(WebhookSigner.verify(OTHER_SECRET, header, body.getValue(), AT, 300)).isTrue();
        assertThat(WebhookSigner.verify(SECRET, header, body.getValue(), AT, 300)).isFalse();

        // A NEW id, not the source's: the endpoint must be able to tell the knock from the one it repeats.
        assertThat(answer.deliveryId()).isNotEqualTo("d-src");
        assertThat(headers.getValue().get(WebhookDispatcher.DELIVERY_ID_HEADER))
                .isEqualTo(answer.deliveryId());
        assertThat(answer.at()).isEqualTo(factAt.toEpochMilli());
        assertThat(answer.outcome()).isEqualTo(WebhookDispatcher.OUTCOME_DELIVERED);
        // The receipt written REPEATS the source, under its own id and its own outcome.
        verify(deliveryLog).recordRedelivery(
                rotated, answer.deliveryId(), source, WebhookDispatcher.OUTCOME_DELIVERED, 200, null);
    }

    @Test
    void aStrangersReceiptIsForbiddenBeforeAnyBytesExist() {
        when(deliveryLog.find("d-src")).thenReturn(receipt("d-src", "publish", "pub-1", AT.minusSeconds(30)));

        assertThatThrownBy(() -> dispatcher.redeliver("d-src", "acct-eve"))
                .isInstanceOf(NotYourWebhook.class)
                .hasMessageContaining("d-src");
        // Nothing is read about the subscription's endpoint and nothing is sent.
        verifyNoInteractions(repository, resolver, transport);
    }

    @Test
    void aReceiptThatNamesNothingIsANotFoundRatherThanAnAttempt() {
        when(deliveryLog.find("d-gone"))
                .thenThrow(new NoSuchDelivery("receipt \"d-gone\" does not exist"));

        assertThatThrownBy(() -> dispatcher.redeliver("d-gone", SUBSCRIBER))
                .isInstanceOf(NoSuchDelivery.class)
                .hasMessageContaining("d-gone");
        verifyNoInteractions(repository, resolver, transport);
    }

    @Test
    void aReceiptWhoseSubscriptionIsGoneCannotBeSigned() {
        when(deliveryLog.find("d-src")).thenReturn(receipt("d-src", "publish", "pub-1", AT.minusSeconds(30)));
        when(repository.findById(WEBHOOK_ID)).thenReturn(Optional.empty());

        // The receipt outlives the subscription (v560), but a redelivery needs the endpoint AND a key.
        assertThatThrownBy(() -> dispatcher.redeliver("d-src", SUBSCRIBER))
                .isInstanceOf(NoSuchWebhook.class)
                .hasMessageContaining("gone");
        verifyNoInteractions(resolver, transport);
    }

    @Test
    void aRedeliveryWithoutASubscriberIsRefusedBeforeAnyRead() {
        assertThatThrownBy(() -> dispatcher.redeliver("d-src", "  "))
                .isInstanceOf(InvalidWebhook.class)
                .hasMessageContaining("subscriber");
        verifyNoInteractions(repository, deliveryLog, resolver, transport);
    }
}
