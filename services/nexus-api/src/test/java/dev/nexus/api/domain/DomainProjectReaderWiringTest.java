package dev.nexus.api.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import dev.nexus.api.domain.DomainDtos.DomainProject;
import dev.nexus.api.domain.DomainDtos.DomainResponse;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

/**
 * The v669 WIRING door, graded against a REAL Spring {@link AnnotationConfigApplicationContext} —
 * not a hand-instantiated reader. This is the leg the topology proof cannot cheaply give us: it
 * answers the one question unit tests structurally cannot, which is WHICH constructor Spring picks
 * for a {@code @Service} that has more than one.
 *
 * <p>{@link DomainProjectReader} deliberately has two constructors: a pass-through ({@code
 * DomainServiceClient}) that keeps every pre-v669 test trivially unit-testable, and a retry-bearing
 * one ({@code DomainServiceRetry}) that Spring must use in a running context so the v669 retry is
 * actually attached. Spring 6 has no no-arg constructor here and, without an explicit hint, cannot
 * decide between two single-argument constructors — it fails context startup. A reader that only
 * exists in unit tests would never reveal that; a real context does.
 *
 * <p>The assertion is on BEHAVIOUR, not on reflection: after {@code refresh()}, calling {@code
 * read(id)} must route through {@code DomainServiceRetry.getProject} (the retry-bearing path) and
 * must NOT touch the raw client. If Spring had picked the pass-through constructor, the exact
 * opposite would happen and this test would go red — which is why it is a behaviour leg and not a
 * "does the bean exist" smoke check.
 */
class DomainProjectReaderWiringTest {

    @Test
    void springPicksTheRetryBearingConstructorAndTheReaderUsesIt() {
        UUID id = UUID.randomUUID();
        DomainProject project =
                new DomainProject(id, UUID.randomUUID(), "slug", "Name", "website", "private", null, null);

        DomainServiceClient client = mock(DomainServiceClient.class);
        DomainServiceRetry retry = mock(DomainServiceRetry.class);
        when(retry.getProject(id)).thenReturn(project);

        try (AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext()) {
            ctx.registerBean(DomainServiceClient.class, () -> client);
            ctx.registerBean(DomainServiceRetry.class, () -> retry);
            ctx.register(DomainProjectReader.class);
            ctx.refresh();

            DomainProjectReader reader = ctx.getBean(DomainProjectReader.class);
            DomainResponse answer = reader.read(id);

            assertThat(answer.state()).as("the reader must return the project the retry produced").isEqualTo("found");
            verify(retry).getProject(id);
            verifyNoInteractions(client);
        }
    }
}
