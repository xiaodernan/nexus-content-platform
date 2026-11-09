package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cloud.client.DefaultServiceInstance;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;

/**
 * The probe graded on the wire: a real socket answers UP, another answers DOWN, another answers too late.
 *
 * <p>No mocked {@code WebClient}: the claim is that this gateway issues a real GET to a real address, so the
 * test asserts the path the stub actually received. Timeouts are measured against a socket that really
 * sleeps — a mock that returns {@code Mono.error(TimeoutException)} would prove nothing about the configured
 * timeout reaching Netty.
 */
class ServiceHealthProbeTest {

    @Test
    void upDownUnknownAndAnEmptyServiceAreEachReportedAsMeasured() {
        StubUpstream up = StubUpstream.start();
        StubUpstream down = StubUpstream.start();
        StubUpstream silent = StubUpstream.start();
        try {
            up.answer(200, "{\"status\":\"UP\"}");
            down.answer(503, "{\"status\":\"DOWN\"}");
            silent.answer(200, "{\"status\":\"UP\"}");
            silent.delay(600);

            DiscoveryClient discovery = mock(DiscoveryClient.class);
            when(discovery.description()).thenReturn("stub-registry");
            when(discovery.getServices()).thenReturn(List.of("nexus-api", "nexus-domain-service", "nexus-silent", "nexus-ghost"));
            when(discovery.getInstances("nexus-api")).thenReturn(List.of(instance("nexus-api", up.uri())));
            when(discovery.getInstances("nexus-domain-service")).thenReturn(List.of(instance("nexus-domain-service", down.uri())));
            when(discovery.getInstances("nexus-silent")).thenReturn(List.of(instance("nexus-silent", silent.uri())));
            when(discovery.getInstances("nexus-ghost")).thenReturn(List.of());

            Map<String, Object> answer = probe(discovery, 150).probe().block(java.time.Duration.ofSeconds(5));

            assertThat(answer.get("source")).isEqualTo("stub-registry");
            assertThat(answer.get("allUp")).isEqualTo(false);
            assertThat(statusOf(answer, "nexus-api")).isEqualTo("UP");
            assertThat(statusOf(answer, "nexus-domain-service")).isEqualTo("DOWN");
            assertThat(statusOf(answer, "nexus-silent")).isEqualTo("UNKNOWN");
            assertThat(detailOf(answer, "nexus-silent")).contains("no answer within 150 ms");
            assertThat(instancesOf(answer, "nexus-ghost")).isEmpty();
            assertThat(up.paths()).containsExactly("/actuator/health");
            assertThat(down.paths()).containsExactly("/actuator/health");
        } finally {
            stop(up, down, silent);
        }
    }

    @Test
    void aRefusedConnectionIsDownBecauseNothingIsListening() {
        StubUpstream dead = StubUpstream.start();
        String uri = dead.uri();
        dead.stop();

        DiscoveryClient discovery = mock(DiscoveryClient.class);
        when(discovery.getServices()).thenReturn(List.of("nexus-api"));
        when(discovery.getInstances("nexus-api")).thenReturn(List.of(instance("nexus-api", uri)));

        Map<String, Object> answer = probe(discovery, 400).probe().block(java.time.Duration.ofSeconds(5));

        assertThat(statusOf(answer, "nexus-api")).isEqualTo("DOWN");
        assertThat(detailOf(answer, "nexus-api")).isEqualTo("connection refused");
        assertThat(answer.get("allUp")).isEqualTo(false);
    }

    @Test
    void allUpIsTrueOnlyWhenEveryInstanceAnsweredUp() {
        StubUpstream first = StubUpstream.start();
        StubUpstream second = StubUpstream.start();
        try {
            first.answer(200, "{\"status\":\"UP\"}");
            second.answer(200, "{\"status\":\"UP\"}");

            DiscoveryClient discovery = mock(DiscoveryClient.class);
            when(discovery.getServices()).thenReturn(List.of("nexus-api"));
            when(discovery.getInstances("nexus-api"))
                    .thenReturn(List.of(instance("nexus-api", first.uri()), instance("nexus-api", second.uri())));

            Map<String, Object> answer = probe(discovery, 500).probe().block(java.time.Duration.ofSeconds(5));

            assertThat(answer.get("allUp")).isEqualTo(true);
            assertThat(answer.get("instances")).isEqualTo(2);
        } finally {
            stop(first, second);
        }
    }

    @Test
    void noDiscoveryClientMeansNothingWasMeasured() {
        @SuppressWarnings("unchecked")
        ObjectProvider<DiscoveryClient> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(null);

        Map<String, Object> answer = new ServiceHealthProbe(provider, 100)
                .probe()
                .block(java.time.Duration.ofSeconds(5));

        assertThat(answer.get("source")).isEqualTo("none");
        assertThat(answer.get("allUp")).isEqualTo(false);
        assertThat(instancesOf(answer, "anything")).isEmpty();
        assertThat((String) answer.get("note")).contains("nothing was measured");
    }

    private static ServiceHealthProbe probe(DiscoveryClient discovery, long timeoutMs) {
        @SuppressWarnings("unchecked")
        ObjectProvider<DiscoveryClient> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(discovery);
        return new ServiceHealthProbe(provider, timeoutMs);
    }

    private static ServiceInstance instance(String serviceId, String uri) {
        java.net.URI parsed = java.net.URI.create(uri);
        return new DefaultServiceInstance(
                serviceId + "-1", serviceId, parsed.getHost(), parsed.getPort(), false, Map.of());
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> instancesOf(Map<String, Object> answer, String serviceId) {
        List<Map<String, Object>> services = (List<Map<String, Object>>) answer.get("services");
        return services.stream()
                .filter(service -> serviceId.equals(service.get("id")))
                .findFirst()
                .map(service -> (List<Map<String, Object>>) service.get("instances"))
                .orElse(List.of());
    }

    private static String statusOf(Map<String, Object> answer, String serviceId) {
        List<Map<String, Object>> rows = instancesOf(answer, serviceId);
        return rows.isEmpty() ? null : (String) rows.get(0).get("status");
    }

    private static String detailOf(Map<String, Object> answer, String serviceId) {
        List<Map<String, Object>> rows = instancesOf(answer, serviceId);
        return rows.isEmpty() ? null : (String) rows.get(0).get("detail");
    }

    private static void stop(StubUpstream... stubs) {
        for (StubUpstream stub : stubs) {
            stub.stop();
        }
    }
}
