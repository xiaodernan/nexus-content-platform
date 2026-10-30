package dev.nexus.api.webhooks;

import dev.nexus.api.webhooks.WebhookDtos.SubscribeRequest;
import dev.nexus.api.webhooks.WebhookDtos.Webhook;
import dev.nexus.api.webhooks.WebhookDtos.WebhookList;
import dev.nexus.api.webhooks.WebhookDtos.WebhookSecret;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * M10 v557 — the HTTP surface for webhook subscriptions. Three doors, and the differences between them are
 * the rules:
 *
 * <ul>
 *   <li>{@code POST /webhooks} — register an endpoint. 201, and the answer carries the secret ONCE.
 *   <li>{@code GET /webhooks?subscriber=} — the subscriber's own subscriptions. No secret in any answer.
 *   <li>{@code DELETE /webhooks/{id}?subscriber=} — remove one. 200 either way: an id that names nothing is
 *       "already gone", not an error.
 * </ul>
 *
 * <p>Nothing here delivers anything: a subscription is a record of an instruction, and the dispatcher that
 * POSTs it is the next slice. The surface says so rather than implying a delivery that never happened.
 */
@RestController
@RequestMapping("/")
public class WebhookController {

    /** The sentence a subscription's answer carries beside the secret. */
    public static final String SECRET_SHOWN_ONCE =
            "this is the only time this secret is readable — a subscription that loses it must be replaced";

    private final WebhookService service;

    public WebhookController(WebhookService service) {
        this.service = service;
    }

    /** Register an endpoint. 201 when the row was made. */
    @PostMapping("/webhooks")
    public ResponseEntity<WebhookSecret> subscribe(@RequestBody SubscribeRequest request) {
        WebhookSubscription row = service.subscribe(
                request == null ? null : request.subscriberId(),
                request == null ? null : request.url(),
                request == null ? null : request.events());
        return ResponseEntity.status(201).body(new WebhookSecret(
                row.getWebhookId(),
                row.getEndpointUrl(),
                row.eventList(),
                row.getCreatedAt().toEpochMilli(),
                row.getSecret(),
                SECRET_SHOWN_ONCE));
    }

    /** The subscriber's subscriptions — the window, and the whole table's count beside it. */
    @GetMapping("/webhooks")
    public ResponseEntity<?> list(
            @RequestParam(name = "subscriber", required = false) String subscriberId,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        if (subscriberId == null || subscriberId.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid-webhook",
                    "message", "the subscriber parameter is missing — a webhook belongs to an account"));
        }
        int asked = limit == null ? WebhookService.DEFAULT_LIST_LIMIT : limit;
        int effective = Math.min(Math.max(asked, 1), WebhookService.MAX_LIST_LIMIT);
        int from = offset == null ? 0 : Math.max(offset, 0);
        List<Webhook> rows = service.subscriptionsOf(subscriberId, asked, from).stream()
                .map(row -> new Webhook(
                        row.getWebhookId(),
                        row.getEndpointUrl(),
                        row.eventList(),
                        row.getCreatedAt().toEpochMilli()))
                .toList();
        return ResponseEntity.ok(new WebhookList(
                subscriberId.trim(), rows, service.countOf(subscriberId), effective, from));
    }

    /** Remove one subscription. 200 either way; 403 when it belongs to another subscriber. */
    @DeleteMapping("/webhooks/{webhookId}")
    public ResponseEntity<Map<String, Object>> unsubscribe(
            @PathVariable String webhookId,
            @RequestParam(name = "subscriber", required = false) String subscriberId) {
        if (subscriberId == null || subscriberId.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid-webhook",
                    "message", "the subscriber parameter is missing — only the owner may remove a webhook"));
        }
        boolean removed = service.unsubscribe(webhookId, subscriberId);
        return ResponseEntity.ok(Map.of("ok", true, "webhookId", webhookId, "removed", removed));
    }

    /** A rule the caller broke is a 400 that NAMES it. */
    @ExceptionHandler(InvalidWebhook.class)
    public ResponseEntity<Map<String, String>> invalid(InvalidWebhook e) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid-webhook", "message", e.getMessage()));
    }

    /** A duplicate endpoint is a 409: the request was legal, the row already exists. */
    @ExceptionHandler(WebhookAlreadySubscribed.class)
    public ResponseEntity<Map<String, String>> duplicate(WebhookAlreadySubscribed e) {
        return ResponseEntity.status(409)
                .body(Map.of("error", "webhook-already-subscribed", "message", e.getMessage()));
    }

    /** Somebody else's subscription is 403: the request was well-formed. */
    @ExceptionHandler(NotYourWebhook.class)
    public ResponseEntity<Map<String, String>> notYours(NotYourWebhook e) {
        return ResponseEntity.status(403).body(Map.of("error", "not-your-webhook", "message", e.getMessage()));
    }
}
