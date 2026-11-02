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
import java.util.Optional;
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
        log.record(row(), "d-1", "publish", "pub-1", AT.minusSeconds(3),
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
        // v563: the id is the dispatcher's (the one the endpoint saw), and a first knock has no source.
        assertThat(receipt.getDeliveryId()).isEqualTo("d-1");
        assertThat(receipt.getRedeliveryOf()).isNull();
    }

    @Test
    void aRedeliveryReceiptRepeatsTheFactsColumnsAndNamesItsSource() {
        WebhookDelivery source = new WebhookDelivery(
                "d-source", "wh-1", SUBSCRIBER, "publish", "pub-1",
                WebhookDispatcher.OUTCOME_UNREACHABLE, null, "UnknownHostException",
                AT.minusSeconds(9), AT.minusSeconds(9), null);

        log.recordRedelivery(row(), "d-new", source,
                WebhookDispatcher.OUTCOME_REFUSED, 500, "status");

        ArgumentCaptor<WebhookDelivery> saved = ArgumentCaptor.forClass(WebhookDelivery.class);
        verify(repository).save(saved.capture());
        WebhookDelivery receipt = saved.getValue();
        // The FACT is the source's, column for column: a redelivery cannot drift from what it repeats.
        assertThat(receipt.getEvent()).isEqualTo("publish");
        assertThat(receipt.getTargetId()).isEqualTo("pub-1");
        assertThat(receipt.getEventAt()).isEqualTo(AT.minusSeconds(9));
        // What is this attempt's own: its id, its outcome, its clock — and the receipt it repeats.
        assertThat(receipt.getDeliveryId()).isEqualTo("d-new");
        assertThat(receipt.getOutcome()).isEqualTo(WebhookDispatcher.OUTCOME_REFUSED);
        assertThat(receipt.getStatus()).isEqualTo(500);
        assertThat(receipt.getAttemptedAt()).isEqualTo(AT);
        assertThat(receipt.getRedeliveryOf()).isEqualTo("d-source");
        assertThat(receipt.getSubscriberAccountId()).isEqualTo(SUBSCRIBER);
    }

    @Test
    void bothWriteDoorsRunInTheirOWNTransactionBecauseTheFanOutIsAFTERCOMMIT() throws Exception {
        for (String name : new String[] {"record", "recordRedelivery"}) {
            Transactional rule = name.equals("record")
                    ? WebhookDeliveryLog.class
                            .getMethod("record", WebhookSubscription.class, String.class, String.class,
                                    String.class, Instant.class, String.class, Integer.class, String.class)
                            .getAnnotation(Transactional.class)
                    : WebhookDeliveryLog.class
                            .getMethod("recordRedelivery", WebhookSubscription.class, String.class,
                                    WebhookDelivery.class, String.class, Integer.class, String.class)
                            .getAnnotation(Transactional.class);
            assertThat(rule).as("%s is a receipt write", name).isNotNull();
            assertThat(rule.propagation()).as("%s propagation", name).isEqualTo(Propagation.REQUIRES_NEW);
        }
    }

    // ── v563: one receipt by id, for the redelivery door ──────────────────────────────────────────

    @Test
    void aReceiptIsFoundByItsIdAndTrimsTheAsk() {
        WebhookDelivery stored = new WebhookDelivery(
                "d-1", "wh-1", SUBSCRIBER, "publish", "pub-1",
                WebhookDispatcher.OUTCOME_UNREACHABLE, null, "UnknownHostException",
                AT, AT, null);
        when(repository.findById("d-1")).thenReturn(Optional.of(stored));

        assertThat(log.find("  d-1  ")).isSameAs(stored);
    }

    @Test
    void aReceiptIdThatNamesNothingIsANotFoundRatherThanAnEmptyAnswer() {
        when(repository.findById("d-gone")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> log.find("d-gone"))
                .isInstanceOf(NoSuchDelivery.class)
                .hasMessageContaining("d-gone");
    }

    @Test
    void aRedeliveryWithNoReceiptIdIsREFUSEDBeforeAnyRead() {
        assertThatThrownBy(() -> log.find("   "))
                .isInstanceOf(InvalidWebhook.class)
                .hasMessageContaining("receipt");
        verifyNoInteractions(repository);
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

    // ── v569: the owner's retention door ────────────────────────────────────────────────────────────

    @Test
    void aPruneDeletesOnlyTheSubscribersReceiptsStrictlyOlderThanTheCutoff() {
        Instant cutoff = AT.minusSeconds(60);
        when(repository.deleteBySubscriberAccountIdAndAttemptedAtBefore(SUBSCRIBER, cutoff)).thenReturn(3L);

        assertThat(log.prune(SUBSCRIBER, null, cutoff.toEpochMilli())).isEqualTo(3L);

        verify(repository).deleteBySubscriberAccountIdAndAttemptedAtBefore(SUBSCRIBER, cutoff);
        verify(repository, never())
                .deleteBySubscriberAccountIdAndWebhookIdAndAttemptedAtBefore(any(), any(), any());
    }

    @Test
    void aNarrowedPruneUsesTheSubscriptionsOwnDeleteDoorAndTrimsBothNames() {
        Instant cutoff = AT.minusSeconds(30);
        when(repository.deleteBySubscriberAccountIdAndWebhookIdAndAttemptedAtBefore(SUBSCRIBER, "wh-1", cutoff))
                .thenReturn(1L);

        assertThat(log.prune("  acct-ada  ", "  wh-1  ", cutoff.toEpochMilli())).isEqualTo(1L);

        verify(repository).deleteBySubscriberAccountIdAndWebhookIdAndAttemptedAtBefore(SUBSCRIBER, "wh-1",
                cutoff);
        verify(repository, never()).deleteBySubscriberAccountIdAndAttemptedAtBefore(any(), any());
    }

    @Test
    void aPruneWithNoPositiveInstantIsREFUSEDBeforeAnyDelete() {
        assertThatThrownBy(() -> log.prune(SUBSCRIBER, null, 0))
                .isInstanceOf(InvalidWebhook.class)
                .hasMessageContaining("instant");
        assertThatThrownBy(() -> log.prune(SUBSCRIBER, null, -1))
                .isInstanceOf(InvalidWebhook.class)
                .hasMessageContaining("instant");
        verifyNoInteractions(repository);
    }

    @Test
    void aPruneThatNamesAFutureInstantIsREFUSEDBecauseItWouldDeleteWhatHasNotBeenWrittenYet() {
        assertThatThrownBy(() -> log.prune(SUBSCRIBER, null, AT.plusSeconds(1).toEpochMilli()))
                .isInstanceOf(InvalidWebhook.class)
                .hasMessageContaining("future");
        verifyNoInteractions(repository);
    }

    @Test
    void aPruneWithoutASubscriberIsREFUSEDBeforeAnyDelete() {
        assertThatThrownBy(() -> log.prune("  ", null, AT.minusSeconds(1).toEpochMilli()))
                .isInstanceOf(InvalidWebhook.class)
                .hasMessageContaining("subscriber");
        verifyNoInteractions(repository);
    }
}
