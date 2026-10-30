package dev.nexus.api.webhooks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.ops.AuditService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

/**
 * M10 v557 — the subscription rules, asserted one refusal at a time.
 *
 * <p>No Spring context and no database: these cases are about what the service DECIDES. The clock is pinned,
 * so the instant a row records is asserted rather than read back and compared to itself.
 */
@ExtendWith(MockitoExtension.class)
class WebhookServiceTest {

    private static final Instant AT = Instant.parse("2026-10-30T09:00:00Z");
    private static final String SUBSCRIBER = "acct-ada";
    private static final String ENDPOINT = "https://example.com/hooks/nexus";

    @Mock
    private WebhookSubscriptionRepository repository;

    private WebhookService service;

    @BeforeEach
    void setUp() {
        service = new WebhookService(repository, Clock.fixed(AT, ZoneOffset.UTC));
    }

    private static WebhookSubscription row(String id, String subscriber, String url) {
        return new WebhookSubscription(id, subscriber, url, "publish", "0".repeat(64), AT);
    }

    /** The stubs a subscription that SHOULD succeed needs: no count over the cap, no existing endpoint. */
    private void allowOneSubscription() {
        when(repository.countBySubscriberAccountId(SUBSCRIBER)).thenReturn(0L);
        when(repository.findBySubscriberAccountIdAndEndpointUrl(SUBSCRIBER, ENDPOINT)).thenReturn(Optional.empty());
        when(repository.save(any(WebhookSubscription.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    // ── rule: a subscription is stored with a canonical event list, a fresh secret and the service's clock ──

    @Test
    void aSubscriptionIsStoredWithACanonicalEventListAndAFreshSecret() {
        allowOneSubscription();
        WebhookSubscription row = service.subscribe(SUBSCRIBER, ENDPOINT, List.of("like", "publish", "like"));

        assertThat(row.getWebhookId()).isNotBlank();
        assertThat(row.getSubscriberAccountId()).isEqualTo(SUBSCRIBER);
        assertThat(row.getEndpointUrl()).isEqualTo(ENDPOINT);
        // The caller typed like, publish, like; the vocabulary's order is publish then like, once each.
        assertThat(row.eventList()).containsExactly("publish", "like");
        assertThat(row.getSecret()).matches("[0-9a-f]{64}");
        assertThat(row.getCreatedAt()).isEqualTo(AT);
        verify(repository).save(any(WebhookSubscription.class));
    }

    @Test
    void theBytesTheCallerTypedAreTrimmedNotTrusted() {
        allowOneSubscription();
        WebhookSubscription row = service.subscribe("  " + SUBSCRIBER + " ", "  " + ENDPOINT + "  ", List.of("publish"));
        assertThat(row.getSubscriberAccountId()).isEqualTo(SUBSCRIBER);
        assertThat(row.getEndpointUrl()).isEqualTo(ENDPOINT);
    }

    @Test
    void theInstantIsTheServicesClockTruncatedToMicros() {
        Clock clock = Clock.fixed(Instant.parse("2026-10-30T09:00:00.123456789Z"), ZoneOffset.UTC);
        WebhookService precise = new WebhookService(repository, clock);
        when(repository.countBySubscriberAccountId(SUBSCRIBER)).thenReturn(0L);
        when(repository.findBySubscriberAccountIdAndEndpointUrl(SUBSCRIBER, ENDPOINT)).thenReturn(Optional.empty());
        when(repository.save(any(WebhookSubscription.class))).thenAnswer(inv -> inv.getArgument(0));

        WebhookSubscription row = precise.subscribe(SUBSCRIBER, ENDPOINT, List.of("publish"));
        assertThat(row.getCreatedAt()).isEqualTo(Instant.parse("2026-10-30T09:00:00.123456Z"));
    }

    @Test
    void twoSubscriptionsNeverShareASecretAndASecretIsThirtyTwoBytesOfHex() {
        String first = WebhookService.newSecret();
        String second = WebhookService.newSecret();
        assertThat(first).matches("[0-9a-f]{64}");
        assertThat(second).matches("[0-9a-f]{64}");
        assertThat(first).isNotEqualTo(second);
    }

    // ── rule: a subscriber is an account, and an account has a name ─────────────────────────────────

    @Test
    void aMissingSubscriberIsRefusedByName() {
        assertThatThrownBy(() -> service.subscribe(null, ENDPOINT, List.of("publish")))
                .isInstanceOf(InvalidWebhook.class)
                .hasMessageContaining("subscriber");
        assertThatThrownBy(() -> service.subscribe("   ", ENDPOINT, List.of("publish")))
                .isInstanceOf(InvalidWebhook.class)
                .hasMessageContaining("subscriber");
        verify(repository, never()).save(any());
    }

    @Test
    void anOverLongSubscriberIsRefusedByNumber() {
        assertThatThrownBy(() -> service.subscribe("x".repeat(201), ENDPOINT, List.of("publish")))
                .isInstanceOf(InvalidWebhook.class)
                .hasMessageContaining("200")
                .hasMessageContaining("201");
    }

    // ── rule: the endpoint is an address this service would POST to on its own initiative ───────────

    @Test
    void theEndpointMustBeAnAbsoluteHttpOrHttpsUrl() {
        assertThatThrownBy(() -> WebhookService.requireEndpoint("javascript:alert(1)"))
                .isInstanceOf(InvalidWebhook.class).hasMessageContaining("http or https");
        assertThatThrownBy(() -> WebhookService.requireEndpoint("ftp://example.com/hook"))
                .isInstanceOf(InvalidWebhook.class).hasMessageContaining("http or https");
        assertThatThrownBy(() -> WebhookService.requireEndpoint("/hooks/nexus"))
                .isInstanceOf(InvalidWebhook.class);
        assertThatThrownBy(() -> WebhookService.requireEndpoint("https://"))
                .isInstanceOf(InvalidWebhook.class);
        assertThatThrownBy(() -> WebhookService.requireEndpoint(null))
                .isInstanceOf(InvalidWebhook.class);
        assertThatThrownBy(() -> WebhookService.requireEndpoint("   "))
                .isInstanceOf(InvalidWebhook.class);
    }

    @Test
    void theEndpointMustNotCarryCredentialsOrAFragment() {
        assertThatThrownBy(() -> WebhookService.requireEndpoint("https://user:pw@example.com/hook"))
                .isInstanceOf(InvalidWebhook.class).hasMessageContaining("credentials");
        assertThatThrownBy(() -> WebhookService.requireEndpoint("https://example.com/hook#frag"))
                .isInstanceOf(InvalidWebhook.class).hasMessageContaining("fragment");
    }

    @Test
    void loopbackAndPrivateLiteralsAreRefused() {
        for (String host : List.of(
                "http://localhost:8080/hook",
                "http://api.localhost/hook",
                "http://127.0.0.1/hook",
                "http://0.0.0.0/hook",
                "http://10.1.2.3/hook",
                "http://192.168.0.10/hook",
                "http://172.16.0.1/hook",
                "http://172.31.255.254/hook",
                "http://169.254.169.254/latest/meta-data",
                "http://[::1]/hook",
                "http://[fe80::1]/hook",
                "http://[fd00::1]/hook")) {
            assertThatThrownBy(() -> WebhookService.requireEndpoint(host))
                    .as(host)
                    .isInstanceOf(InvalidWebhook.class)
                    .hasMessageContaining("public host");
        }
    }

    @Test
    void publicLiteralsAndNamesAreAccepted() {
        for (String url : List.of(
                "https://example.com/hooks/nexus",
                "http://8.8.8.8/hook",
                "https://172.32.0.1/hook",
                "https://fdatasync.io/hook",
                "https://example.com:8443/hook?tenant=nexus")) {
            assertThat(WebhookService.requireEndpoint(url)).as(url).isEqualTo(url);
        }
    }

    @Test
    void anOverLongEndpointIsRefusedByNumber() {
        String longUrl = "https://example.com/" + "a".repeat(WebhookService.MAX_ENDPOINT_LENGTH);
        assertThatThrownBy(() -> WebhookService.requireEndpoint(longUrl))
                .isInstanceOf(InvalidWebhook.class)
                .hasMessageContaining("1000");
    }

    // ── rule: the events are the trail's vocabulary, canonicalized ──────────────────────────────────

    @Test
    void theVocabularyIsTheTrailsOwnListWithNoSecondCopy() {
        assertThat(WebhookService.SUPPORTED_EVENTS).isEqualTo(AuditService.ACTIONS);
        assertThat(WebhookService.SUPPORTED_EVENTS).containsExactlyElementsOf(AuditService.ACTIONS);
        assertThat(WebhookService.SUPPORTED_EVENTS).doesNotContain("ping");
    }

    @Test
    void anEmptyEventListIsRefusedByName() {
        assertThatThrownBy(() -> WebhookService.requireEvents(null))
                .isInstanceOf(InvalidWebhook.class).hasMessageContaining("at least one event");
        assertThatThrownBy(() -> WebhookService.requireEvents(List.of()))
                .isInstanceOf(InvalidWebhook.class).hasMessageContaining("at least one event");
    }

    @Test
    void aBlankEventIsRefused() {
        assertThatThrownBy(() -> WebhookService.requireEvents(List.of("publish", " ")))
                .isInstanceOf(InvalidWebhook.class).hasMessageContaining("blank");
    }

    @Test
    void anEventTheTrailNeverRecordsIsRefusedWithTheVocabularyNamed() {
        assertThatThrownBy(() -> WebhookService.requireEvents(List.of("teleport")))
                .isInstanceOf(InvalidWebhook.class)
                .hasMessageContaining("teleport")
                .hasMessageContaining("publish")
                .hasMessageContaining("acknowledge");
    }

    @Test
    void duplicateEventsAreStoredOnceInTheVocabularysOrderNotTheCallers() {
        assertThat(WebhookService.requireEvents(List.of("acknowledge", "publish", "publish", "like")))
                .isEqualTo("publish,like,acknowledge");
    }

    // ── rule: one endpoint, one subscription, and a bounded number of them ───────────────────────────

    @Test
    void theEleventhSubscriptionIsRefusedByNumber() {
        when(repository.countBySubscriberAccountId(SUBSCRIBER))
                .thenReturn((long) WebhookService.MAX_SUBSCRIPTIONS_PER_SUBSCRIBER);
        assertThatThrownBy(() -> service.subscribe(SUBSCRIBER, ENDPOINT, List.of("publish")))
                .isInstanceOf(InvalidWebhook.class)
                .hasMessageContaining("10")
                .hasMessageContaining("cap");
        verify(repository, never()).save(any());
    }

    @Test
    void aDuplicateEndpointIsAConflictThatNamesTheExistingRow() {
        when(repository.countBySubscriberAccountId(SUBSCRIBER)).thenReturn(1L);
        when(repository.findBySubscriberAccountIdAndEndpointUrl(SUBSCRIBER, ENDPOINT))
                .thenReturn(Optional.of(row("wh-1", SUBSCRIBER, ENDPOINT)));
        assertThatThrownBy(() -> service.subscribe(SUBSCRIBER, ENDPOINT, List.of("publish")))
                .isInstanceOf(WebhookAlreadySubscribed.class)
                .hasMessageContaining(ENDPOINT)
                .hasMessageContaining("wh-1");
        verify(repository, never()).save(any());
    }

    // ── the read doors ───────────────────────────────────────────────────────────────────────────────

    @Test
    void theListingClampsTheLimitAndTranslatesTheOffsetIntoPages() {
        when(repository.findBySubscriberAccountIdOrderByCreatedAtAsc(eq(SUBSCRIBER), any(Pageable.class)))
                .thenReturn(List.of(row("wh-1", SUBSCRIBER, ENDPOINT)));
        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);

        assertThat(service.subscriptionsOf(SUBSCRIBER, 150, 0)).hasSize(1);
        verify(repository).findBySubscriberAccountIdOrderByCreatedAtAsc(eq(SUBSCRIBER), captor.capture());
        assertThat(captor.getValue().getPageSize()).isEqualTo(WebhookService.MAX_LIST_LIMIT);
        assertThat(captor.getValue().getPageNumber()).isZero();
    }

    @Test
    void anOffsetLandsOnThePageThatHoldsTheRowAskedFor() {
        when(repository.findBySubscriberAccountIdOrderByCreatedAtAsc(eq(SUBSCRIBER), any(Pageable.class)))
                .thenReturn(List.of());
        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);

        service.subscriptionsOf(SUBSCRIBER, 20, 30);
        verify(repository).findBySubscriberAccountIdOrderByCreatedAtAsc(eq(SUBSCRIBER), captor.capture());
        assertThat(captor.getValue().getPageSize()).isEqualTo(20);
        // Row 30 at a window of 20 is the second page, not the thirtieth.
        assertThat(captor.getValue().getPageNumber()).isEqualTo(1);
    }

    @Test
    void aZeroLimitFloorsAtOneRatherThanAskingForNothing() {
        when(repository.findBySubscriberAccountIdOrderByCreatedAtAsc(eq(SUBSCRIBER), any(Pageable.class)))
                .thenReturn(List.of());
        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        service.subscriptionsOf(SUBSCRIBER, 0, 0);
        verify(repository).findBySubscriberAccountIdOrderByCreatedAtAsc(eq(SUBSCRIBER), captor.capture());
        assertThat(captor.getValue().getPageSize()).isEqualTo(1);
    }

    @Test
    void theCountIsTheWholeTablesAndTheSubscriberIsNamed() {
        when(repository.countBySubscriberAccountId(SUBSCRIBER)).thenReturn(3L);
        assertThat(service.countOf("  " + SUBSCRIBER + "  ")).isEqualTo(3L);
        assertThatThrownBy(() -> service.countOf(" ")).isInstanceOf(InvalidWebhook.class);
    }

    // ── removal: the owner's door, and "already gone" is not an error ───────────────────────────────

    @Test
    void theOwnerMayRemoveTheirOwnSubscription() {
        WebhookSubscription own = row("wh-1", SUBSCRIBER, ENDPOINT);
        when(repository.findById("wh-1")).thenReturn(Optional.of(own));
        assertThat(service.unsubscribe("wh-1", SUBSCRIBER)).isTrue();
        verify(repository).delete(own);
    }

    @Test
    void somebodyElsesSubscriptionIsRefusedByOwnershipNotByAbsence() {
        when(repository.findById("wh-1")).thenReturn(Optional.of(row("wh-1", "acct-bob", ENDPOINT)));
        assertThatThrownBy(() -> service.unsubscribe("wh-1", SUBSCRIBER))
                .isInstanceOf(NotYourWebhook.class)
                .hasMessageContaining("another subscriber");
        verify(repository, never()).delete(any());
    }

    @Test
    void anIdThatNamesNothingIsAlreadyGone() {
        when(repository.findById("wh-gone")).thenReturn(Optional.empty());
        assertThat(service.unsubscribe("wh-gone", SUBSCRIBER)).isFalse();
        verify(repository, never()).delete(any());
    }

    @Test
    void removalWithoutAnOwnerIsRefusedBeforeAnyRead() {
        assertThatThrownBy(() -> service.unsubscribe("wh-1", null)).isInstanceOf(InvalidWebhook.class);
        verify(repository, never()).findById("wh-1");
    }

    // ── v562: rotation replaces the ONE key a row holds, and touches nothing else ─────────────────────

    @Test
    void theOwnerRotatesTheSecretAndEveryOtherFieldStays() {
        WebhookSubscription own = row("wh-1", SUBSCRIBER, ENDPOINT);
        when(repository.findById("wh-1")).thenReturn(Optional.of(own));
        when(repository.save(any(WebhookSubscription.class))).thenAnswer(inv -> inv.getArgument(0));

        WebhookSubscription rotated = service.rotateSecret("wh-1", SUBSCRIBER);

        assertThat(rotated.getSecret()).matches("[0-9a-f]{64}");
        assertThat(rotated.getSecret()).isNotEqualTo("0".repeat(64));
        assertThat(rotated.getWebhookId()).isEqualTo("wh-1");
        assertThat(rotated.getSubscriberAccountId()).isEqualTo(SUBSCRIBER);
        assertThat(rotated.getEndpointUrl()).isEqualTo(ENDPOINT);
        // Rotation is about the KEY: the instruction (events and creation instant) is not rewritten.
        assertThat(rotated.eventList()).containsExactly("publish");
        assertThat(rotated.getCreatedAt()).isEqualTo(AT);
        verify(repository).save(own);
    }

    @Test
    void somebodyElsesWebhookCannotBeRotated() {
        when(repository.findById("wh-1")).thenReturn(Optional.of(row("wh-1", "acct-bob", ENDPOINT)));
        assertThatThrownBy(() -> service.rotateSecret("wh-1", SUBSCRIBER))
                .isInstanceOf(NotYourWebhook.class)
                .hasMessageContaining("another subscriber");
        verify(repository, never()).save(any());
    }

    @Test
    void rotatingAnIdThatNamesNothingIsANotFoundRatherThanACreate() {
        when(repository.findById("wh-gone")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.rotateSecret("wh-gone", SUBSCRIBER))
                .isInstanceOf(NoSuchWebhook.class)
                .hasMessageContaining("does not exist");
        verify(repository, never()).save(any());
    }

    @Test
    void rotationWithoutAnOwnerIsRefusedBeforeAnyRead() {
        assertThatThrownBy(() -> service.rotateSecret("wh-1", null)).isInstanceOf(InvalidWebhook.class);
        verify(repository, never()).findById("wh-1");
    }
}
