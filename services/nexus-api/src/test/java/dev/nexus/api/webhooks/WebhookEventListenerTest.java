package dev.nexus.api.webhooks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.ops.AuditRecorded;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * M10 v559 — the producer seam, graded for the two facts that make it correct.
 *
 * <p>The first is the MAPPING: a recorded entry becomes a delivery of the verb, target and instant it names,
 * with no field invented and none dropped. The second is the PHASE, and it is asserted off the annotation
 * rather than assumed: {@code AFTER_COMMIT} is what keeps a rolled-back publish from being announced, and a
 * listener that quietly regressed to {@code @EventListener} would still pass a mapping test. That is why the
 * phase is read back here — the annotation IS the rule.
 */
@ExtendWith(MockitoExtension.class)
class WebhookEventListenerTest {

    private static final Instant AT = Instant.parse("2026-10-30T09:00:00Z");

    @Mock
    private WebhookDispatcher dispatcher;

    @Test
    void aRecordedEntryIsDeliveredAsTheVerbTargetAndInstantItNames() {
        when(dispatcher.deliver("publish", "pub-1", AT)).thenReturn(List.of());

        new WebhookEventListener(dispatcher).recorded(new AuditRecorded("publish", "pub-1", AT));

        verify(dispatcher).deliver("publish", "pub-1", AT);
    }

    @Test
    void theDeliveryIsScheduledAFTERCOMMITandNotInsideTheTransaction() throws Exception {
        TransactionalEventListener rule = WebhookEventListener.class
                .getDeclaredMethod("recorded", AuditRecorded.class)
                .getAnnotation(TransactionalEventListener.class);

        assertThat(rule).isNotNull();
        assertThat(rule.phase()).isEqualTo(TransactionPhase.AFTER_COMMIT);
    }
}
