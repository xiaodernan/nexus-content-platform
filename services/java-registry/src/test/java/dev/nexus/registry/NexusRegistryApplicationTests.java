package dev.nexus.registry;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.netflix.appinfo.InstanceInfo;
import com.netflix.appinfo.MyDataCenterInfo;
import com.netflix.discovery.converters.jackson.EurekaJsonJacksonCodec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

/**
 * The registry's own contract, exercised over its real HTTP surface.
 *
 * <p>What is proved here is not "the context loads" — that is the weakest thing a Spring test can
 * say. What is proved is the ONE job this service exists to do: <em>an instance that registers is
 * an instance the registry reports</em>. The test registers over Eureka's own REST API and then
 * reads the registry back, so a registry that starts but never stores anything — the failure mode
 * a context-load test cannot see — fails here.
 *
 * <p>The payload is encoded with EUREA'S OWN CODEC ({@code EurekaJsonJacksonCodec}), not with a
 * hand-written JSON string. That is not a style preference. {@code InstanceInfo} carries an
 * abstract {@code DataCenterInfo}, so a hand-written payload has to guess the server's type-info
 * shape — and the first draft of this test did exactly that, and the registry answered
 * {@code 400 {"error":"cannot parse request body"}}. Encoding with the codec means the bytes are
 * the ones a real Eureka client sends, which is the only version of this question worth asking.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            // The read cache refreshes every second (the default is 30 s). Without this the read-back
            // below is a race against the cache, and a race is not a test.
            "eureka.server.response-cache-update-interval-ms=1000",
            "eureka.server.enable-self-preservation=false"
        })
class NexusRegistryApplicationTests {

    @LocalServerPort
    int port;

    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @Test
    void anInstanceThatRegistersIsAnInstanceTheRegistryReports() throws Exception {
        String appId = "NEXUS-PROOF";
        String base = "http://127.0.0.1:" + port;

        HttpResponse<String> registered = client.send(
                HttpRequest.newBuilder(URI.create(base + "/eureka/apps/" + appId))
                        .header("Content-Type", "application/json")
                        .timeout(Duration.ofSeconds(10))
                        .POST(HttpRequest.BodyPublishers.ofString(instanceJson(appId)))
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(registered.statusCode())
                .as("Eureka answers a registration with 204 No Content; its own answer was: %s", registered.body())
                .isEqualTo(204);

        // The registry's read cache is refreshed on a timer, so the read-back is a POLL with a deadline
        // rather than an instant assertion. The deadline is generous on purpose: the thing being proved
        // is "the registry stores what it was told", not "the registry is fast".
        String body = "";
        Instant deadline = Instant.now().plusSeconds(20);
        while (Instant.now().isBefore(deadline)) {
            HttpResponse<String> listed = client.send(
                    HttpRequest.newBuilder(URI.create(base + "/eureka/apps"))
                            .timeout(Duration.ofSeconds(10))
                            .GET()
                            .build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(listed.statusCode()).isEqualTo(200);
            body = listed.body();
            if (body.contains(appId)) {
                break;
            }
            Thread.sleep(250);
        }
        assertThat(body)
                .as("the registry must REPORT the instance it was given; a registry that starts and stores nothing is not a registry")
                .contains(appId);
    }

    @Test
    void theRegistryAnswersItsOwnHealthQuestion() throws Exception {
        HttpResponse<String> health = client.send(
                HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/actuator/health"))
                        .timeout(Duration.ofSeconds(10))
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(health.statusCode()).isEqualTo(200);
        assertThat(health.body()).contains("UP");
    }

    /**
     * The registration payload, encoded by Eureka's own codec.
     *
     * <p>A Eureka client sends the {@code InstanceInfo} ITSELF as the request body — not wrapped in
     * an envelope — so that is what is sent here too.
     */
    private static String instanceJson(String appId) throws Exception {
        InstanceInfo instance = InstanceInfo.Builder.newBuilder()
                .setInstanceId("127.0.0.1:" + appId + ":8080")
                .setAppName(appId)
                .setHostName("127.0.0.1")
                .setIPAddr("127.0.0.1")
                .setStatus(InstanceInfo.InstanceStatus.UP)
                .setPort(8080)
                .setVIPAddress(appId)
                .setDataCenterInfo(new MyDataCenterInfo(MyDataCenterInfo.Name.MyOwn))
                .setHomePageUrl("http://127.0.0.1:8080/", appId)
                .setStatusPageUrl("http://127.0.0.1:8080/actuator/info", appId)
                .setHealthCheckUrls(
                        "http://127.0.0.1:8080/actuator/health",
                        "http://127.0.0.1:8080/actuator/health",
                        appId)
                .build();

        ObjectMapper mapper = new EurekaJsonJacksonCodec().getObjectMapper(InstanceInfo.class);
        return mapper.writeValueAsString(instance);
    }
}
