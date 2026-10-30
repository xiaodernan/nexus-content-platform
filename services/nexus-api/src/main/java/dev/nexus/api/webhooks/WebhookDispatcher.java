package dev.nexus.api.webhooks;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.nexus.api.webhooks.WebhookDtos.DeliveryAnswer;
import java.net.InetAddress;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * M10 v558/v559 — the DELIVERY half: one signed POST, and an answer that names what happened to it.
 *
 * <p>v557 built the subscription and the signature; v558 the first door that actually calls a stranger's
 * server — the smallest such door, a {@code ping} a subscriber asks for. v559 adds the FAN-OUT: {@link #deliver}
 * takes one recorded event and POSTs it to every subscription that asked for that verb. Nothing else about the
 * delivery changes: the same body, the same signature, the same address rule, and the same three outcomes.
 *
 * <p>Four rules, each with its reason:
 *
 * <ul>
 *   <li><b>Ownership before bytes.</b> Only the subscriber that registered the row may ping it — a stranger
 *       must not be able to make the system of record call somebody else's URL, which would be a reflected
 *       request with this service's own address behind it.
 *   <li><b>The address is judged at RESOLUTION time, not at subscription time.</b> v557 refuses a private
 *       LITERAL; this refuses a NAME that resolves to one, and refuses the delivery if ANY of the addresses
 *       it names is private. That is the DNS-rebinding hole ADR 0021 left open, and the check must run on
 *       every delivery because the answer can change between them.
 *   <li><b>A non-2xx is an ANSWER, not a failure.</b> The endpoint refusing the delivery is a fact about the
 *       endpoint; only "nothing answered" is {@code unreachable}, and the two are reported apart rather than
 *       collapsed into {@code false}.
 *   <li><b>The signature is computed over the bytes that are SENT.</b> The body is serialized once, handed to
 *       the signer, and handed to the transport — a subscriber that verifies the received bytes against the
 *       header must find them to be the same bytes, or the signature is theatre.
 * </ul>
 */
@Service
public class WebhookDispatcher {

    /** The endpoint accepted the delivery: a 2xx. */
    public static final String OUTCOME_DELIVERED = "delivered";

    /** The endpoint was reached and REFUSED: any non-2xx, including a redirect that was not followed. */
    public static final String OUTCOME_REFUSED = "refused";

    /** Nothing answered: DNS, connect, TLS or timeout. */
    public static final String OUTCOME_UNREACHABLE = "unreachable";

    /** The detail a refusal carries when the name resolved to a private address. */
    public static final String DETAIL_PRIVATE_ADDRESS = "private-address";

    /** The event a ping delivers. Not a trail verb: a ping says "this endpoint and this secret work". */
    public static final String PING_EVENT = "ping";

    /** How long one delivery may take, connection included. */
    public static final Duration DELIVERY_TIMEOUT = Duration.ofSeconds(10);

    /**
     * v559 — the fan-out's order: the oldest subscription first, and the id breaks a tie.
     *
     * <p>Stated rather than inherited from the table's read order: two rows made in the same microsecond are
     * still two rows, and an answer list whose order changed between runs would make a subscriber's log
     * disagree with this service's about what happened first.
     */
    private static final Comparator<WebhookSubscription> OLDEST_FIRST =
            Comparator.comparing(WebhookSubscription::getCreatedAt)
                    .thenComparing(WebhookSubscription::getWebhookId);

    private static final String CONTENT_TYPE = "application/json; charset=utf-8";

    private final WebhookSubscriptionRepository repository;
    private final HostResolver resolver;
    private final WebhookTransport transport;
    private final ObjectMapper mapper;
    private final Clock clock;

    public WebhookDispatcher(
            WebhookSubscriptionRepository repository,
            HostResolver resolver,
            WebhookTransport transport,
            ObjectMapper mapper,
            Clock clock) {
        this.repository = repository;
        this.resolver = resolver;
        this.transport = transport;
        this.mapper = mapper;
        this.clock = clock;
    }

    /**
     * POST ONE recorded event to EVERY subscription that asked for its verb, oldest subscription first.
     *
     * <p>v559 — this is the fan-out ADR 0021 named as the next slice. {@link WebhookEventListener} calls it
     * AFTER the writing transaction commits and never from inside it: a delivery that raced a rollback would
     * announce a fact which did not survive, and the trail would then be contradicted by a stranger's inbox.
     *
     * <p>The answer is one {@link DeliveryAnswer} per endpoint that was ATTEMPTED, in the order attempted —
     * including the ones that refused and the ones nothing answered, because "this endpoint did not take it"
     * is a result rather than an error. A failure does not stop the loop: one subscriber's outage is not the
     * other subscribers' silence.
     *
     * <p>Bound, stated: this reads the WHOLE subscription table per event ({@code findAll}), because the table
     * is small and a derived query over a comma-joined column would be a query about SPELLING rather than a
     * query about the set. A table that outgrows a scan needs a join table and a real query — a later
     * decision, not a silent assumption here.
     */
    public List<DeliveryAnswer> deliver(String event, String targetId, Instant at) {
        if (event == null || event.isBlank()) {
            throw new IllegalArgumentException("a fan-out must name the event it announces — an empty verb "
                    + "would be answered as \"nobody asked\", which is a different fact");
        }
        if (targetId == null || targetId.isBlank()) {
            throw new IllegalArgumentException("a fan-out must name what the event happened to");
        }
        String wanted = event.trim();
        String body = body(wanted, targetId, at);
        return repository.findAll().stream()
                .filter(row -> row.eventList().contains(wanted))
                .sorted(OLDEST_FIRST)
                .map(row -> attempt(row, body, at))
                .toList();
    }

    /**
     * POST one signed {@code ping} to a subscription the caller owns.
     *
     * @throws InvalidWebhook when the subscriber is missing — the ownership question has no answer
     * @throws NoSuchWebhook when the id names no row — 404, not "the endpoint refused"
     * @throws NotYourWebhook when the row belongs to somebody else — 403
     */
    public DeliveryAnswer ping(String webhookId, String subscriberId) {
        if (webhookId == null || webhookId.isBlank()) {
            throw new InvalidWebhook("a ping needs the webhook id it is addressed to");
        }
        if (subscriberId == null || subscriberId.isBlank()) {
            throw new InvalidWebhook("a ping needs a subscriber — only the owner may make this service call "
                    + "an endpoint");
        }
        String subscriber = subscriberId.trim();
        WebhookSubscription row = repository.findById(webhookId.trim())
                .orElseThrow(() -> new NoSuchWebhook("webhook \"" + webhookId.trim()
                        + "\" does not exist — there is nothing to call"));
        if (!row.getSubscriberAccountId().equals(subscriber)) {
            throw new NotYourWebhook("webhook \"" + webhookId.trim() + "\" belongs to another subscriber");
        }
        Instant at = clock.instant().truncatedTo(ChronoUnit.MICROS);
        String body = body(PING_EVENT, row.getWebhookId(), at);
        return attempt(row, body, at);
    }

    /**
     * The one delivery: judge the address, then POST the bytes that were signed.
     *
     * <p>Nothing is sent when any resolved address is private: the request never reaches a network socket,
     * which is the difference between "refused" and "tried and hoped".
     */
    private DeliveryAnswer attempt(WebhookSubscription row, String body, Instant at) {
        List<InetAddress> addresses;
        try {
            addresses = resolver.resolve(hostOf(row.getEndpointUrl()));
        } catch (Exception e) {
            return answer(row, at, OUTCOME_UNREACHABLE, null, simpleName(e));
        }
        for (InetAddress address : addresses) {
            if (isPrivateAddress(address)) {
                return answer(row, at, OUTCOME_REFUSED, null, DETAIL_PRIVATE_ADDRESS);
            }
        }
        String signature = WebhookSigner.header(row.getSecret(), body, at);
        try {
            WebhookTransport.WebhookResponse response = transport.post(
                    row.getEndpointUrl(),
                    body,
                    Map.of("Content-Type", CONTENT_TYPE, WebhookSigner.HEADER_NAME, signature),
                    DELIVERY_TIMEOUT);
            int status = response.status();
            if (status >= 200 && status < 300) {
                return answer(row, at, OUTCOME_DELIVERED, status, null);
            }
            return answer(row, at, OUTCOME_REFUSED, status, "status");
        } catch (Exception e) {
            return answer(row, at, OUTCOME_UNREACHABLE, null, simpleName(e));
        }
    }

    /**
     * Whether an address is one this service must not call.
     *
     * <p>Every predicate {@link InetAddress} offers, plus IPv6 unique-local ({@code fc00::/7}): Java's
     * {@code isSiteLocalAddress} covers the DEPRECATED {@code fec0::/10} range and not the one in use, so the
     * platform's own answer would have called a ULA address public.
     */
    static boolean isPrivateAddress(InetAddress address) {
        if (address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress()) {
            return true;
        }
        byte[] raw = address.getAddress();
        // IPv6 unique-local: the first byte is 0xfc or 0xfd (fc00::/7).
        return raw.length == 16 && (raw[0] & 0xfe) == 0xfc;
    }

    /** The host an endpoint names. The service refused anything without one at subscription time. */
    static String hostOf(String endpointUrl) {
        return java.net.URI.create(endpointUrl).getHost();
    }

    /** The body, built as a JSON tree so the escaping is the library's rather than a format string's. */
    private String body(String event, String targetId, Instant at) {
        ObjectNode node = mapper.createObjectNode();
        node.put("event", event);
        node.put("targetId", targetId);
        node.put("at", at.toEpochMilli());
        try {
            return mapper.writeValueAsString(node);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("a tree of three scalar fields did not serialize — this is a broken "
                    + "runtime, not a bad body", e);
        }
    }

    private static DeliveryAnswer answer(
            WebhookSubscription row, Instant at, String outcome, Integer status, String detail) {
        return new DeliveryAnswer(
                row.getWebhookId(),
                row.getEndpointUrl(),
                OUTCOME_DELIVERED.equals(outcome),
                outcome,
                status,
                detail,
                at.toEpochMilli());
    }

    /** The exception's own name, without a message that could carry a host or a port into an answer. */
    private static String simpleName(Exception e) {
        String name = e.getClass().getSimpleName();
        return name.isEmpty() ? e.getClass().getName().toLowerCase(Locale.ROOT) : name;
    }
}
