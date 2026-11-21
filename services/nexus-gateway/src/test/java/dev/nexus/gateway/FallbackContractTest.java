package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ServerWebExchange;

/**
 * The server-side truth behind the Spring Cloud proof's §14 assertion
 * ({@code docs/evidence/java/spring-cloud-proof.mjs}).
 *
 * <p>The proof was corrected in e96aecbb to assert that the edge's failure answer says
 * {@code "unavailable"} AND names the upstream service. This class pins the CONTROLLER that
 * produces that answer: 503, {@code error=service_unavailable}, the service echoed back, and an
 * honest {@code cause} (never an invented exception class). If either side drifts — the proof's
 * assertion or the controller's body — the contract breaks and this test goes red with no
 * Docker, no Postgres and no registry needed.
 */
class FallbackContractTest {

    @Test
    void unavailableIsAlways503AndNamesTheService() {
        ServerWebExchange exchange = mock(ServerWebExchange.class);
        ResponseEntity<Map<String, Object>> response =
                new FallbackController().unavailable("nexus-api", exchange);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        Map<String, Object> body = response.getBody();
        assertThat(body).isNotNull();
        // §14's assertion leans on exactly these two bytes: "unavailable" + the service name.
        assertThat(body.get("error")).isEqualTo("service_unavailable");
        assertThat(String.valueOf(body.get("error"))).contains("unavailable");
        assertThat(body.get("service")).isEqualTo("nexus-api");
    }

    @Test
    void missingCauseIsReportedHonestlyNotInvented() {
        ServerWebExchange exchange = mock(ServerWebExchange.class);
        // no CIRCUITBREAKER_EXECUTION_EXCEPTION_ATTR attribute set
        when(exchange.getAttribute(ServerWebExchangeUtils.CIRCUITBREAKER_EXECUTION_EXCEPTION_ATTR))
                .thenReturn(null);

        Map<String, Object> body = new FallbackController().unavailable("nexus-domain-service", exchange).getBody();
        assertThat(body).isNotNull();
        assertThat(body.get("cause")).isEqualTo("not-reported");
        assertThat(body.get("service")).isEqualTo("nexus-domain-service");
    }

    @Test
    void aRealCauseReportsItsClassName() {
        ServerWebExchange exchange = mock(ServerWebExchange.class);
        IllegalStateException boom = new IllegalStateException("backend gone");
        when(exchange.getAttribute(ServerWebExchangeUtils.CIRCUITBREAKER_EXECUTION_EXCEPTION_ATTR))
                .thenReturn(boom);

        Map<String, Object> body = new FallbackController().unavailable("nexus-api", exchange).getBody();
        assertThat(body).isNotNull();
        assertThat(body.get("cause")).isEqualTo(IllegalStateException.class.getName());
    }
}
