package dev.nexus.api.webhooks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.nexus.api.webhooks.WebhookDtos.PingAnswer;
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
 */
@ExtendWith(MockitoExtension.class)
class WebhookDispatcherTest {

    private static final Instant AT = Instant.parse("2026-10-30T09:00:00Z");
    private static final String SUBSCRIBER = "acct-ada";
    private static final String WEBHOOK_ID = "wh-1";
    private static final String ENDPOINT = "https://hooks.example.com/nexus";
    private static final String SECRET = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

    @Mock
    private WebhookSubscriptionRepository repository;

    @Mock
    private HostResolver resolver;

    @Mock
    private WebhookTransport transport;

    private final ObjectMapper mapper = new ObjectMapper();

    private WebhookDispatcher dispatcher;

    @BeforeEach
    void setUp() {
        dispatcher = new WebhookDispatcher(
                repository, resolver, transport, mapper, Clock.fixed(AT, ZoneOffset.UTC));
    }

    private static WebhookSubscription row() {
        return new WebhookSubscription(WEBHOOK_ID, SUBSCRIBER, ENDPOINT, "publish", SECRET, AT);
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

        PingAnswer answer = dispatcher.ping(WEBHOOK_ID, SUBSCRIBER);

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

        PingAnswer answer = dispatcher.ping(WEBHOOK_ID, SUBSCRIBER);

        assertThat(answer.outcome()).isEqualTo(WebhookDispatcher.OUTCOME_REFUSED);
        assertThat(answer.detail()).isEqualTo(WebhookDispatcher.DETAIL_PRIVATE_ADDRESS);
        verifyNoInteractions(transport);
    }

    @Test
    void aNameThatDoesNotResolveIsUnreachableAndNamesTheLookup() throws Exception {
        when(repository.findById(WEBHOOK_ID)).thenReturn(Optional.of(row()));
        when(resolver.resolve("hooks.example.com")).thenThrow(new UnknownHostException("rebind"));

        PingAnswer answer = dispatcher.ping(WEBHOOK_ID, SUBSCRIBER);

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

        PingAnswer answer = dispatcher.ping(WEBHOOK_ID, "  " + SUBSCRIBER + "  ");

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

        PingAnswer refused = dispatcher.ping(WEBHOOK_ID, SUBSCRIBER);
        PingAnswer unreachable = dispatcher.ping(WEBHOOK_ID, SUBSCRIBER);

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
}
