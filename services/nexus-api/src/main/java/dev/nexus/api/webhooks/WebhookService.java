package dev.nexus.api.webhooks;

import dev.nexus.api.ops.AuditService;
import java.net.URI;
import java.net.URISyntaxException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * M10 v557 — the RECEIVING half of the external ecosystem: who may be called, and about what.
 *
 * <p>M10 names "API, MCP, tool registry, webhooks". This is webhooks' first slice, and it is deliberately the
 * half that needs no agent and no network: a subscriber registers an endpoint and the events it wants, the
 * service answers the secret it will be signed with, and the dispatcher that POSTs is the next slice. A
 * subscription in this build is a RECORD, not yet a caller — the bound is stated here rather than implied.
 *
 * <p>Four rules, each refused BY NAME:
 *
 * <ul>
 *   <li>The endpoint must be an absolute {@code http(s)} URL, must not carry credentials or a fragment, and
 *       must not name a loopback or private host. That last one is the important one: an endpoint is an
 *       address this service will POST to ON ITS OWN INITIATIVE, so a subscriber pointing it at
 *       {@code 127.0.0.1:5432} would be making the system of record probe its own network. The bound is
 *       stated: a DNS NAME that RESOLVES to a private address cannot be refused here — that check belongs
 *       to the dispatcher, at resolution time, and is not built yet.
 *   <li>The events must be names this service RECORDS. The vocabulary is {@link AuditService#ACTIONS} —
 *       one owner, not a second list kept in step by hand. A webhook about an action the trail never
 *       records would be a subscription to a silence.
 *   <li>One endpoint per subscriber, and at most {@link #MAX_SUBSCRIPTIONS_PER_SUBSCRIBER}. A duplicated
 *       endpoint delivers one fact twice; an uncapped list lets one account multiply the outbound work.
 *   <li>The secret is minted HERE, from {@link SecureRandom}, and returned once. A caller-supplied secret
 *       would let a client pick a key its own logs already hold.
 * </ul>
 */
@Service
public class WebhookService {

    /** How many endpoints one subscriber may register. */
    public static final int MAX_SUBSCRIPTIONS_PER_SUBSCRIBER = 10;

    /** The endpoint column's width, refused by number rather than truncated silently. */
    public static final int MAX_ENDPOINT_LENGTH = 1000;

    /** The default number of subscriptions a listing answers with. */
    public static final int DEFAULT_LIST_LIMIT = 20;

    /** The most a caller may ask for. */
    public static final int MAX_LIST_LIMIT = 100;

    /**
     * Every event this build can deliver, in the trail's own order.
     *
     * <p>An ALIAS, not a copy: the audit trail is the vocabulary's owner (v385), and a webhook vocabulary
     * that could drift from it would be a second list of verbs that agree until they do not.
     */
    public static final List<String> SUPPORTED_EVENTS = AuditService.ACTIONS;

    private static final SecureRandom RANDOM = new SecureRandom();

    private final WebhookSubscriptionRepository repository;
    private final Clock clock;

    public WebhookService(WebhookSubscriptionRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    /**
     * Register an endpoint for a set of events.
     *
     * @param subscriberId the owning account, host-declared and opaque
     * @param url the endpoint, validated by {@link #requireEndpoint}
     * @param events at least one of {@link #SUPPORTED_EVENTS}; stored in the vocabulary's order
     * @return the stored row, secret included — this is the ONE place the secret is readable
     */
    @Transactional
    public WebhookSubscription subscribe(String subscriberId, String url, List<String> events) {
        String subscriber = requireSubscriber(subscriberId);
        String endpoint = requireEndpoint(url);
        String eventText = requireEvents(events);
        long held = repository.countBySubscriberAccountId(subscriber);
        if (held >= MAX_SUBSCRIPTIONS_PER_SUBSCRIBER) {
            throw new InvalidWebhook("subscriber \"" + subscriber + "\" already holds "
                    + MAX_SUBSCRIPTIONS_PER_SUBSCRIBER + " webhooks — the cap is "
                    + MAX_SUBSCRIPTIONS_PER_SUBSCRIBER + " endpoints per subscriber");
        }
        repository.findBySubscriberAccountIdAndEndpointUrl(subscriber, endpoint).ifPresent(existing -> {
            throw new WebhookAlreadySubscribed("subscriber \"" + subscriber
                    + "\" is already subscribed to \"" + endpoint + "\" (webhook " + existing.getWebhookId()
                    + ") — one endpoint, one subscription");
        });
        WebhookSubscription row = new WebhookSubscription(
                UUID.randomUUID().toString(),
                subscriber,
                endpoint,
                eventText,
                newSecret(),
                clock.instant().truncatedTo(ChronoUnit.MICROS));
        return repository.save(row);
    }

    /** One subscriber's subscriptions, oldest first, capped and paged — the window, not the whole table. */
    @Transactional(readOnly = true)
    public List<WebhookSubscription> subscriptionsOf(String subscriberId, int limit, int offset) {
        String subscriber = requireSubscriber(subscriberId);
        int effective = Math.min(Math.max(limit, 1), MAX_LIST_LIMIT);
        int from = Math.max(offset, 0);
        return repository.findBySubscriberAccountIdOrderByCreatedAtAsc(
                subscriber, PageRequest.of(from / effective, effective));
    }

    /** The subscriber's WHOLE number of subscriptions — what the window is a window of. */
    @Transactional(readOnly = true)
    public long countOf(String subscriberId) {
        return repository.countBySubscriberAccountId(requireSubscriber(subscriberId));
    }

    /**
     * Remove an endpoint. {@code false} when the id names nothing — "already gone" is not an error, the same
     * rule the plan and subscription doors follow.
     *
     * @throws NotYourWebhook when the row belongs to another subscriber — 403, not 404: the caller named a
     *     real id and the reason it could not be removed is ownership, not absence
     */
    @Transactional
    public boolean unsubscribe(String webhookId, String subscriberId) {
        String subscriber = requireSubscriber(subscriberId);
        return repository.findById(webhookId)
                .map(row -> {
                    if (!row.getSubscriberAccountId().equals(subscriber)) {
                        throw new NotYourWebhook("webhook \"" + webhookId + "\" belongs to another subscriber");
                    }
                    repository.delete(row);
                    return true;
                })
                .orElse(false);
    }

    /** The owning account, trimmed — an empty subscriber is a subscription nobody owns. */
    private static String requireSubscriber(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidWebhook("a webhook needs a subscriber — the account it belongs to");
        }
        String trimmed = raw.trim();
        if (trimmed.length() > 200) {
            throw new InvalidWebhook("a subscriber id is at most 200 characters — this one is " + trimmed.length());
        }
        return trimmed;
    }

    /**
     * The endpoint, normalized and refused by name. Package-private so the rules are asserted directly.
     */
    static String requireEndpoint(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidWebhook("a webhook needs an endpoint URL");
        }
        String trimmed = raw.trim();
        if (trimmed.length() > MAX_ENDPOINT_LENGTH) {
            throw new InvalidWebhook("a webhook endpoint is at most " + MAX_ENDPOINT_LENGTH
                    + " characters — this one is " + trimmed.length());
        }
        URI uri;
        try {
            uri = new URI(trimmed);
        } catch (URISyntaxException e) {
            throw new InvalidWebhook("a webhook endpoint must be an absolute http(s) URL — \""
                    + trimmed + "\" is not a URL");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) {
            throw new InvalidWebhook("a webhook endpoint must be http or https — not \""
                    + (uri.getScheme() == null ? "" : uri.getScheme()) + "\"");
        }
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new InvalidWebhook("a webhook endpoint must name a host");
        }
        if (uri.getUserInfo() != null) {
            throw new InvalidWebhook("a webhook endpoint must not carry credentials in the URL — "
                    + "the subscription's secret is the credential");
        }
        if (uri.getFragment() != null) {
            throw new InvalidWebhook("a webhook endpoint must not carry a fragment");
        }
        if (isPrivateHost(host)) {
            throw new InvalidWebhook("a webhook endpoint must be a public host — this service would POST to it "
                    + "on its own initiative, and \"" + host + "\" is a loopback or private address");
        }
        return trimmed;
    }

    /**
     * Loopback and private-network literals, refused at subscription time.
     *
     * <p>Only LITERALS can be judged here: a hostname is an indirection, and whether it means a private
     * address is decided by the resolver at delivery time. A dispatcher that skips that second check
     * re-opens the hole this method closes.
     */
    static boolean isPrivateHost(String host) {
        String h = host.trim().toLowerCase(Locale.ROOT);
        if (h.startsWith("[") && h.endsWith("]")) {
            h = h.substring(1, h.length() - 1);
        }
        if (h.equals("localhost") || h.endsWith(".localhost")) {
            return true;
        }
        if (h.contains(":")) {
            // Only a LITERAL IPv6 address can be judged by its prefix. A name beginning with "fd" is a
            // name ("fdatasync.io"), and refusing it would be a rule about spelling rather than about
            // where the address goes.
            if (h.equals("::1") || h.equals("0:0:0:0:0:0:0:1")) {
                return true;
            }
            // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
            if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) {
                return true;
            }
        }
        String[] parts = h.split("\\.");
        if (parts.length == 4) {
            try {
                int a = Integer.parseInt(parts[0]);
                int b = Integer.parseInt(parts[1]);
                int c = Integer.parseInt(parts[2]);
                int d = Integer.parseInt(parts[3]);
                if (a < 0 || a > 255 || b < 0 || b > 255 || c < 0 || c > 255 || d < 0 || d > 255) {
                    return false;
                }
                if (a == 0 || a == 10 || a == 127) {
                    return true;
                }
                if (a == 169 && b == 254) {
                    return true;
                }
                if (a == 192 && b == 168) {
                    return true;
                }
                return a == 172 && b >= 16 && b <= 31;
            } catch (NumberFormatException e) {
                // A dotted host that is not four numbers is a NAME ("12.34.example.com"), not an address.
                return false;
            }
        }
        return false;
    }

    /**
     * The event names, validated and CANONICALIZED: de-duplicated, and written in {@link #SUPPORTED_EVENTS}'
     * order so the stored text is a fact about the set and not about the order the caller happened to type.
     */
    static String requireEvents(List<String> events) {
        if (events == null || events.isEmpty()) {
            throw new InvalidWebhook("a webhook needs at least one event — one of "
                    + String.join(", ", SUPPORTED_EVENTS));
        }
        Set<String> wanted = new LinkedHashSet<>();
        for (String raw : events) {
            if (raw == null || raw.isBlank()) {
                throw new InvalidWebhook("an event name must not be blank");
            }
            String trimmed = raw.trim();
            if (!SUPPORTED_EVENTS.contains(trimmed)) {
                throw new InvalidWebhook("a webhook can ask for one of " + String.join(", ", SUPPORTED_EVENTS)
                        + " — not \"" + trimmed + "\"");
            }
            wanted.add(trimmed);
        }
        return String.join(",", SUPPORTED_EVENTS.stream().filter(wanted::contains).toList());
    }

    /** A fresh HMAC key: 32 bytes, lowercase hex. Minted here, shown once, never re-readable. */
    static String newSecret() {
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        StringBuilder hex = new StringBuilder(raw.length * 2);
        for (byte b : raw) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }
}
