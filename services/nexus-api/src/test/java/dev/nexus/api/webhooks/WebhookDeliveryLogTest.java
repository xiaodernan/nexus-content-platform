package dev.nexus.api.webhooks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * M10 v560 — the receipt log graded for what it writes, how it windows, and the transaction it runs in.
 *
 * <p>The load-bearing case is {@link #theReceiptWriteRunsInItsOWNTransactionBecauseTheFanOutIsAFTERCOMMIT()}:
 * the fan-out is an {@code AFTER_COMMIT} listener, and a receipt saved in the caller's FINISHED transaction
 * would join it and never commit — a feature that reads as working and writes nothing. The phase cannot be
 * observed without a real transaction, so it is pinned off the annotation, the same way the listener's
 * {@code AFTER_COMMIT} is (v559).
 */
@ExtendWith(MockitoExtension.class)
class WebhookDeliveryLogTest {

    private static final Instant AT = Instant.parse("2026-10-30T09:00:00Z");
    private static final String SUBSCRIBER = "acct-ada";

    @Mock
    private WebhookDeliveryRepository repository;

    private WebhookDeliveryLog log;

    @BeforeEach
    void setUp() {
        log = new WebhookDeliveryLog(repository, Clock.fixed(AT, ZoneOffset.UTC));
    }

    private static WebhookSubscription row() {
        return new WebhookSubscription(
                "wh-1", SUBSCRIBER, "https://hooks.example.com/nexus", "publish", "s".repeat(64),
                AT.minusSeconds(5));
    }

    // ── what a receipt says ────────────────────────────────────────────────────────────────────────

    @Test
    void aReceiptNamesTheSubscriberTheEventTheTargetAndBOTHInstants() {
        log.record(row(), "publish", "pub-1", AT.minusSeconds(3),
                WebhookDispatcher.OUTCOME_REFUSED, 500, "status");

        ArgumentCaptor<WebhookDelivery> saved = ArgumentCaptor.forClass(WebhookDelivery.class);
        verify(repository).save(saved.capture());
        WebhookDelivery receipt = saved.getValue();
        assertThat(receipt.getWebhookId()).isEqualTo("wh-1");
        // The OWNER travels on the row: it is the read door's key, and it outlives the subscription.
        assertThat(receipt.getSubscriberAccountId()).isEqualTo(SUBSCRIBER);
        assertThat(receipt.getEvent()).isEqualTo("publish");
        assertThat(receipt.getTargetId()).isEqualTo("pub-1");
        assertThat(receipt.getOutcome()).isEqualTo(WebhookDispatcher.OUTCOME_REFUSED);
        assertThat(receipt.getStatus()).isEqualTo(500);
        assertThat(receipt.getDetail()).isEqualTo("status");
        // TWO instants: when the fact happened, and when this service knocked. They are not the same field.
        assertThat(receipt.getEventAt()).isEqualTo(AT.minusSeconds(3));
        assertThat(receipt.getAttemptedAt()).isEqualTo(AT);
        assertThat(receipt.getDeliveryId()).isNotBlank();
    }

    @Test
    void theReceiptWriteRunsInItsOWNTransactionBecauseTheFanOutIsAFTERCOMMIT() throws Exception {
        Transactional rule = WebhookDeliveryLog.class
                .getMethod("record", WebhookSubscription.class, String.class, String.class, Instant.class,
                        String.class, Integer.class, String.class)
                .getAnnotation(Transactional.class);

        assertThat(rule).isNotNull();
        assertThat(rule.propagation()).isEqualTo(Propagation.REQUIRES_NEW);
    }

    // ── the read window ───────────────────────────────────────────────────────────────────────────

    @Test
    void theWindowIsCappedFlooredAndTranslatedIntoROWS() {
        log.deliveriesOf(SUBSCRIBER, null, 20, 40);
        log.deliveriesOf(SUBSCRIBER, null, 10_000, 0);
        log.deliveriesOf(SUBSCRIBER, null, 0, -7);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository, times(3)).findBySubscriberAccountIdOrderByAttemptedAtDescDeliveryIdDesc(
                eq(SUBSCRIBER), window.capture());
        // The offset is ROWS (the trail's meaning, v388), translated into the page index Spring Data
        // speaks: 40 rows with a 20-row window is page 2, and the skip is exactly 40.
        assertThat(window.getAllValues().get(0).getPageNumber()).isEqualTo(2);
        assertThat(window.getAllValues().get(0).getOffset()).isEqualTo(40L);
        // The cap is the LOG's, not the caller's: a 10 000-row ask is a 100-row window at the newest rows.
        assertThat(window.getAllValues().get(1).getPageSize()).isEqualTo(WebhookDeliveryLog.MAX_LIST_LIMIT);
        assertThat(window.getAllValues().get(1).getOffset()).isZero();
        // A limit below one is ONE row rather than a refusal, and a negative offset is the first window.
        assertThat(window.getAllValues().get(2).getPageSize()).isEqualTo(1);
        assertThat(window.getAllValues().get(2).getOffset()).isZero();
        verify(repository, never())
                .findBySubscriberAccountIdAndWebhookIdOrderByAttemptedAtDescDeliveryIdDesc(any(), any(), any());
    }

    @Test
    void aNamedWebhookNarrowsTheQueryAndABlankOneIsTheWholeLog() {
        log.deliveriesOf(SUBSCRIBER, "wh-1", 20, 0);
        verify(repository).findBySubscriberAccountIdAndWebhookIdOrderByAttemptedAtDescDeliveryIdDesc(
                eq(SUBSCRIBER), eq("wh-1"), any(Pageable.class));

        log.deliveriesOf(SUBSCRIBER, "   ", 20, 0);
        verify(repository).findBySubscriberAccountIdOrderByAttemptedAtDescDeliveryIdDesc(
                eq(SUBSCRIBER), any(Pageable.class));
    }

    @Test
    void theCountIsTheWHOLELogNarrowedTheSameWayAsTheWindow() {
        when(repository.countBySubscriberAccountId(SUBSCRIBER)).thenReturn(12L);
        when(repository.countBySubscriberAccountIdAndWebhookId(SUBSCRIBER, "wh-1")).thenReturn(3L);

        assertThat(log.countOf(SUBSCRIBER, null)).isEqualTo(12L);
        assertThat(log.countOf(SUBSCRIBER, "  ")).isEqualTo(12L);
        assertThat(log.countOf(SUBSCRIBER, "wh-1")).isEqualTo(3L);
    }

    @Test
    void aLogWithoutASubscriberIsREFUSEDByName() {
        assertThatThrownBy(() -> log.deliveriesOf("  ", null, 20, 0))
                .isInstanceOf(InvalidWebhook.class)
                .hasMessageContaining("subscriber");
        assertThatThrownBy(() -> log.countOf(null, null))
                .isInstanceOf(InvalidWebhook.class)
                .hasMessageContaining("subscriber");
        verifyNoInteractions(repository);
    }
}
