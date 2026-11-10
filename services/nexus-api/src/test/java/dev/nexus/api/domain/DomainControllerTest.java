package dev.nexus.api.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.domain.DomainDtos.DomainProject;
import dev.nexus.api.domain.DomainDtos.DomainResponse;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

/**
 * The door that reads a project THROUGH the domain service: three answers, three status codes.
 *
 * <p>This is the class where a collapse would hurt. If "the domain service is unreachable" were
 * answered as a 404, a caller would conclude the project had been deleted — and would say so, to a
 * user, in a list, in a message. The reader keeps the three facts apart; this class is what turns
 * that into HTTP, and it is tested here because the mapping is the part a caller actually sees.
 *
 * <p>The 503 body NAMES the domain service. A 503 that said only "unavailable" would leave an
 * operator guessing which of the services behind the edge had failed.
 */
@ExtendWith(MockitoExtension.class)
class DomainControllerTest {

    private static final UUID PROJECT_ID = UUID.fromString("6fef79cf-a5f7-4d27-9e7e-30309e567dad");

    @Mock
    private DomainProjectReader reader;

    private DomainController controller;

    @BeforeEach
    void setUp() {
        controller = new DomainController(reader);
    }

    @Test
    void aProjectTheDomainServiceHoldsAnswersTwoHundredWithTheRow() {
        DomainProject project = new DomainProject(
                PROJECT_ID, UUID.randomUUID(), "a-slug", "A name", "website", "private", null, null);
        when(reader.read(PROJECT_ID)).thenReturn(DomainResponse.found(project));

        ResponseEntity<DomainResponse> answer = controller.read(PROJECT_ID);

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getBody()).isNotNull();
        assertThat(answer.getBody().state()).isEqualTo("found");
        assertThat(answer.getBody().project()).isEqualTo(project);
        verify(reader).read(PROJECT_ID);
    }

    @Test
    void aProjectTheDomainServiceDoesNotHoldAnswersFourOhFour() {
        when(reader.read(PROJECT_ID)).thenReturn(DomainResponse.notFound());

        ResponseEntity<DomainResponse> answer = controller.read(PROJECT_ID);

        assertThat(answer.getStatusCode().value())
                .as("the row is not there: that is a fact about the PROJECT")
                .isEqualTo(404);
        assertThat(answer.getBody()).isNotNull();
        assertThat(answer.getBody().state()).isEqualTo("not-found");
        assertThat(answer.getBody().project()).isNull();
    }

    @Test
    void aDomainServiceThatCannotBeReachedAnswersFiveZeroThreeAndNamesIt() {
        when(reader.read(PROJECT_ID)).thenReturn(DomainResponse.unavailable(new DomainFailure(
                DomainFailure.CONNECTION_REFUSED,
                "the domain service could not be reached: the connection was refused")));

        ResponseEntity<DomainResponse> answer = controller.read(PROJECT_ID);

        assertThat(answer.getStatusCode().value())
                .as("the SERVICE is unreachable: that is a fact about the SERVICE, and it must not be reported as a missing project")
                .isEqualTo(503);
        assertThat(answer.getBody()).isNotNull();
        assertThat(answer.getBody().state()).isEqualTo("downstream-unavailable");
        assertThat(answer.getBody().project()).isNull();
        assertThat(answer.getBody().reason()).contains("domain service");
        assertThat(answer.getBody().failure())
                .as("the body carries the KIND as well, so a caller that cannot parse a sentence can still branch on it")
                .isEqualTo(DomainFailure.CONNECTION_REFUSED);
    }

    @Test
    void everyAnswerCarriesItsStateEvenWhenTheBodyIsAllTheCallerReads() {
        when(reader.read(PROJECT_ID)).thenReturn(DomainResponse.notFound());

        ResponseEntity<DomainResponse> answer = controller.read(PROJECT_ID);

        assertThat(answer.getBody()).isNotNull();
        assertThat(answer.getBody().state())
                .as("the state is in the BODY too, so a caller that reads only the body still learns which fact happened")
                .isEqualTo("not-found");
    }
}
