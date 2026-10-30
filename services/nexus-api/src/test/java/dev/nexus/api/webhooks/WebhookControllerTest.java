package dev.nexus.api.webhooks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

/**
 * M10 v557 — the HTTP surface of the subscription half, graded directly (no Spring context, no database).
 *
 * <p>The load-bearing case is {@link #theListingSerializesNoSecretAtAll()}: the promise is not "the secret is
 * redacted" but "there is no secret field", and the only honest way to prove that is to serialize the answer
 * and look for the field.
 */
@ExtendWith(MockitoExtension.class)
class WebhookControllerTest {

    private static final Instant AT = Instant.parse("2026-10-30T09:00:00Z");
    private static final String SUBSCRIBER = "acct-ada";
    private static final String ENDPOINT = "https://example.com/hooks/nexus";

    @Mock
    private WebhookService service;

    @Mock
    private WebhookDispatcher dispatcher;

    @Mock
    private WebhookDeliveryLog deliveryLog;

    private final ObjectMapper mapper = new ObjectMapper();

    private WebhookController controller() {
        return new WebhookController(service, dispatcher, deliveryLog);
    }

    private static WebhookSubscription row(String id) {
        return new WebhookSubscription(id, SUBSCRIBER, ENDPOINT, "publish,like", "s".repeat(64), AT);
    }

    @Test
    void subscribingAnswersTwoHundredAndOneWithTheSecretAndTheRule() throws Exception {
        when(service.subscribe(SUBSCRIBER, ENDPOINT, List.of("like", "publish")))
                .thenReturn(row("wh-1"));
        ResponseEntity<WebhookDtos.WebhookSecret> answer = controller()
                .subscribe(new WebhookDtos.SubscribeRequest(SUBSCRIBER, ENDPOINT, List.of("like", "publish")));

        assertThat(answer.getStatusCode().value()).isEqualTo(201);
        WebhookDtos.WebhookSecret body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.id()).isEqualTo("wh-1");
        assertThat(body.url()).isEqualTo(ENDPOINT);
        assertThat(body.events()).containsExactly("publish", "like");
        assertThat(body.createdAt()).isEqualTo(AT.toEpochMilli());
        assertThat(body.secret()).hasSize(64);
        assertThat(body.note()).isEqualTo(WebhookController.SECRET_SHOWN_ONCE);

        JsonNode wire = mapper.valueToTree(body);
        assertThat(wire.get("secret").asText()).hasSize(64);
        assertThat(wire.get("note").asText()).contains("only time");
    }

    @Test
    void aRequestThatBrokeARuleIsAFourHundredFromTheService() {
        ResponseEntity<Map<String, String>> answer = controller().invalid(
                new InvalidWebhook("a webhook endpoint must be a public host"));
        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        assertThat(answer.getBody()).containsEntry("error", "invalid-webhook");
        assertThat(answer.getBody().get("message")).contains("public host");
    }

    @Test
    void theListingSerializesNoSecretAtAll() throws Exception {
        when(service.subscriptionsOf(SUBSCRIBER, 20, 0)).thenReturn(List.of(row("wh-1")));
        when(service.countOf(SUBSCRIBER)).thenReturn(1L);

        ResponseEntity<?> answer = controller()
                .list(SUBSCRIBER, null, null);
        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        JsonNode wire = mapper.valueToTree(answer.getBody());
        assertThat(wire.get("webhooks")).hasSize(1);
        assertThat(wire.get("webhooks").get(0).has("secret")).isFalse();
        assertThat(wire.get("webhooks").get(0).get("events").get(0).asText()).isEqualTo("publish");
        assertThat(wire.get("total").asLong()).isEqualTo(1L);
        assertThat(wire.get("limit").asInt()).isEqualTo(20);
        assertThat(wire.get("offset").asInt()).isZero();
        assertThat(wire.get("subscriberId").asText()).isEqualTo(SUBSCRIBER);
    }

    @Test
    void theListingClampsTheLimitItReportsAndFloorsTheOffset() throws Exception {
        when(service.subscriptionsOf(SUBSCRIBER, 500, 0)).thenReturn(List.of());
        when(service.countOf(SUBSCRIBER)).thenReturn(0L);

        ResponseEntity<?> answer = controller().list(SUBSCRIBER, 500, -10);
        JsonNode wire = mapper.valueToTree(answer.getBody());
        assertThat(wire.get("limit").asInt()).isEqualTo(WebhookService.MAX_LIST_LIMIT);
        assertThat(wire.get("offset").asInt()).isZero();
    }

    @Test
    void aListingWithoutASubscriberIsRefusedByName() {
        ResponseEntity<?> answer = controller().list("  ", null, null);
        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        JsonNode wire = mapper.valueToTree(answer.getBody());
        assertThat(wire.get("error").asText()).isEqualTo("invalid-webhook");
        assertThat(wire.get("message").asText()).contains("subscriber");
    }

    @Test
    void removingAnswersTwoHundredEitherWayAndSaysWhichItWas() throws Exception {
        when(service.unsubscribe("wh-1", SUBSCRIBER)).thenReturn(true);
        when(service.unsubscribe("wh-gone", SUBSCRIBER)).thenReturn(false);

        ResponseEntity<Map<String, Object>> removed = controller().unsubscribe("wh-1", SUBSCRIBER);
        assertThat(removed.getStatusCode().value()).isEqualTo(200);
        assertThat(removed.getBody()).containsEntry("removed", true);

        ResponseEntity<Map<String, Object>> absent = controller().unsubscribe("wh-gone", SUBSCRIBER);
        assertThat(absent.getStatusCode().value()).isEqualTo(200);
        assertThat(absent.getBody()).containsEntry("removed", false);
    }

    @Test
    void removalWithoutAnOwnerIsRefusedByName() {
        ResponseEntity<?> answer = controller().unsubscribe("wh-1", null);
        assertThat(answer.getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void aDuplicateEndpointIsAConflictAndSomebodyElsesWebhookIsForbidden() {
        ResponseEntity<Map<String, String>> conflict = controller()
                .duplicate(new WebhookAlreadySubscribed("subscriber \"acct-ada\" is already subscribed"));
        assertThat(conflict.getStatusCode().value()).isEqualTo(409);
        assertThat(conflict.getBody()).containsEntry("error", "webhook-already-subscribed");

        ResponseEntity<Map<String, String>> forbidden = controller()
                .notYours(new NotYourWebhook("webhook \"wh-9\" belongs to another subscriber"));
        assertThat(forbidden.getStatusCode().value()).isEqualTo(403);
        assertThat(forbidden.getBody()).containsEntry("error", "not-your-webhook");
    }

    @Test
    void aPingAnswersTwoHundredWithWhatTheEndpointDid() throws Exception {
        WebhookDtos.DeliveryAnswer refused = new WebhookDtos.DeliveryAnswer(
                "wh-1", ENDPOINT, false, WebhookDispatcher.OUTCOME_REFUSED, 500, "status", AT.toEpochMilli());
        when(dispatcher.ping("wh-1", SUBSCRIBER)).thenReturn(refused);

        ResponseEntity<WebhookDtos.DeliveryAnswer> answer = controller().ping("wh-1", SUBSCRIBER);

        // 200 in every outcome that has an answer: the endpoint refusing is a RESULT, not a door failure.
        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getBody()).isNotNull();
        JsonNode wire = mapper.valueToTree(answer.getBody());
        assertThat(wire.get("delivered").asBoolean()).isFalse();
        assertThat(wire.get("outcome").asText()).isEqualTo("refused");
        assertThat(wire.get("status").asInt()).isEqualTo(500);
        assertThat(wire.get("webhookId").asText()).isEqualTo("wh-1");
    }

    @Test
    void aPingWithoutAnOwnerIsAskedOfTheDispatcherAndComesBackAsAFourHundred() throws Exception {
        when(dispatcher.ping("wh-1", null)).thenThrow(new InvalidWebhook("a ping needs a subscriber"));

        // The door does not second-guess the dispatcher's ownership rule; it passes the missing owner through.
        assertThatThrownBy(() -> controller().ping("wh-1", null)).isInstanceOf(InvalidWebhook.class);
        org.mockito.Mockito.verify(dispatcher).ping("wh-1", null);

        ResponseEntity<Map<String, String>> answer = controller()
                .invalid(new InvalidWebhook("a ping needs a subscriber"));
        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        assertThat(answer.getBody()).containsEntry("error", "invalid-webhook");
    }

    @Test
    void anIdThatNamesNoSubscriptionIsAFourHundredAndFour() throws Exception {
        ResponseEntity<Map<String, String>> answer = controller()
                .absent(new NoSuchWebhook("webhook \"wh-gone\" does not exist"));

        assertThat(answer.getStatusCode().value()).isEqualTo(404);
        assertThat(answer.getBody()).containsEntry("error", "no-such-webhook");
        assertThat(answer.getBody().get("message")).contains("does not exist");
    }

    // ── v560: the delivery log door ────────────────────────────────────────────────────────────────

    @Test
    void theDeliveryLogIsTheSubscribersOwnWindowAndCarriesNoSecret() throws Exception {
        WebhookDelivery receipt = new WebhookDelivery(
                "d-1", "wh-1", SUBSCRIBER, "publish", "pub-1",
                WebhookDispatcher.OUTCOME_UNREACHABLE, null, "UnknownHostException", AT, AT.plusSeconds(2));
        when(deliveryLog.deliveriesOf(SUBSCRIBER, "wh-1", 20, 0)).thenReturn(List.of(receipt));
        when(deliveryLog.countOf(SUBSCRIBER, "wh-1")).thenReturn(1L);

        ResponseEntity<?> answer = controller().deliveries(SUBSCRIBER, "wh-1", null, null);

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        JsonNode wire = mapper.valueToTree(answer.getBody());
        assertThat(wire.get("deliveries")).hasSize(1);
        JsonNode row = wire.get("deliveries").get(0);
        assertThat(row.get("event").asText()).isEqualTo("publish");
        assertThat(row.get("targetId").asText()).isEqualTo("pub-1");
        assertThat(row.get("outcome").asText()).isEqualTo("unreachable");
        assertThat(row.get("detail").asText()).isEqualTo("UnknownHostException");
        // Both instants travel: the fact's and the attempt's, in the client's own epoch milliseconds.
        assertThat(row.get("eventAt").asLong()).isEqualTo(AT.toEpochMilli());
        assertThat(row.get("attemptedAt").asLong()).isEqualTo(AT.plusSeconds(2).toEpochMilli());
        assertThat(row.has("secret")).isFalse();
        assertThat(wire.get("total").asLong()).isEqualTo(1L);
        assertThat(wire.get("limit").asInt()).isEqualTo(20);
        assertThat(wire.get("subscriberId").asText()).isEqualTo(SUBSCRIBER);
    }

    @Test
    void aDeliveryLogWithoutASubscriberIsRefusedByName() {
        ResponseEntity<?> answer = controller().deliveries("  ", null, null, null);

        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        JsonNode wire = mapper.valueToTree(answer.getBody());
        assertThat(wire.get("error").asText()).isEqualTo("invalid-webhook");
        assertThat(wire.get("message").asText()).contains("subscriber");
    }
}
