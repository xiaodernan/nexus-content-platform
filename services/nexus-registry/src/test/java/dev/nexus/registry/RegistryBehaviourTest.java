package dev.nexus.registry;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.netflix.appinfo.DataCenterInfo;
import com.netflix.appinfo.InstanceInfo;
import com.netflix.appinfo.LeaseInfo;
import com.netflix.appinfo.MyDataCenterInfo;
import com.netflix.discovery.converters.EurekaJacksonCodec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

/**
 * The registry graded over HTTP, against a real servlet container on a port the OS chose.
 *
 * <p>Not a mock of Eureka and not a bean-level assertion: every leg below sends the request a real client
 * sends and reads the answer a real client reads. The registration body is produced by
 * {@link EurekaJacksonCodec} — Eureka's OWN wire codec, the same one its client uses — rather than a
 * hand-written JSON literal, because a literal guesses at a format whose port and data-center fields are
 * not ordinary bean properties and would go stale the day the codec changes.
 *
 * <p>Each leg names its OWN application id, so no leg depends on another having run first. The one shared
 * claim (the registry does not register itself) is read from the full list, which every leg leaves intact.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.register-with-eureka=false",
            "eureka.client.fetch-registry=false",
            "eureka.server.enable-self-preservation=false",
            "eureka.server.use-read-only-response-cache=false",
            "eureka.server.response-cache-update-interval-ms=100",
            // Eviction must not run during a test: a leg that takes a second must not lose the lease it
            // just wrote because a background timer decided the client had gone quiet.
            "eureka.server.eviction-interval-timer-in-ms=600000",
            "logging.level.root=warn"
        })
class RegistryBehaviourTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final HttpClient HTTP =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    @LocalServerPort
    int port;

    private String base() {
        return "http://127.0.0.1:" + port;
    }

    private HttpResponse<String> send(String method, String path, String body, String contentType)
            throws Exception {
        HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(base() + path))
                .timeout(Duration.ofSeconds(20))
                .header("Accept", "application/json");
        if (body == null) {
            req.method(method, HttpRequest.BodyPublishers.noBody());
        } else {
            req.header("Content-Type", contentType)
                    .method(method, HttpRequest.BodyPublishers.ofString(body));
        }
        return HTTP.send(req.build(), HttpResponse.BodyHandlers.ofString());
    }

    private static InstanceInfo instance(String app, String instanceId, int servicePort) {
        return InstanceInfo.Builder.newBuilder()
                .setAppName(app)
                .setInstanceId(instanceId)
                .setHostName("127.0.0.1")
                .setIPAddr("127.0.0.1")
                .setPort(servicePort)
                .enablePort(InstanceInfo.PortType.UNSECURE, true)
                .setStatus(InstanceInfo.InstanceStatus.UP)
                .setDataCenterInfo(new MyDataCenterInfo(DataCenterInfo.Name.MyOwn))
                .setLeaseInfo(LeaseInfo.Builder.newBuilder()
                        .setRenewalIntervalInSecs(30)
                        .setDurationInSecs(90)
                        .build())
                .setVIPAddress(app.toLowerCase(java.util.Locale.ROOT))
                .build();
    }

    private static String registrationBody(String app, String instanceId, int servicePort) {
        InstanceInfo info = instance(app, instanceId, servicePort);
        String body = EurekaJacksonCodec.getInstance().writeToString(info);
        assertThat(body).contains(instanceId);
        return body;
    }

    @Test
    void theRegistryDoesNotRegisterItself() throws Exception {
        HttpResponse<String> res = send("GET", "/eureka/apps", null, null);
        assertThat(res.statusCode()).isEqualTo(200);
        JsonNode apps = JSON.readTree(res.body()).path("applications");
        // The shape a client parses: a delta version and a hash code, not an HTML page and not an error.
        assertThat(apps.has("versions__delta")).isTrue();
        assertThat(apps.has("apps__hashcode")).isTrue();
        // `register-with-eureka: false` is the whole reason this is a standalone registry. If it ever flips,
        // the registry appears in its own list and a gateway routing by service id can route to IT.
        assertThat(res.body()).doesNotContain("NEXUS-REGISTRY");
    }

    @Test
    void anApplicationNobodyRegisteredIs404() throws Exception {
        HttpResponse<String> res = send("GET", "/eureka/apps/SC-NEVER-REGISTERED", null, null);
        assertThat(res.statusCode()).isEqualTo(404);
    }

    @Test
    void aRegistrationIsRecordedAndReadBackWithTheAddressItSent() throws Exception {
        String app = "SC-REGISTER";
        String instanceId = "sc-register-1";
        HttpResponse<String> post =
                send("POST", "/eureka/apps/" + app, registrationBody(app, instanceId, 8123), "application/json");
        assertThat(post.statusCode()).isEqualTo(204);

        HttpResponse<String> get = send("GET", "/eureka/apps/" + app, null, null);
        assertThat(get.statusCode()).isEqualTo(200);
        JsonNode found = JSON.readTree(get.body()).path("application");
        assertThat(found.path("name").asText()).isEqualTo(app);
        JsonNode instances = found.path("instance");
        assertThat(instances.isArray()).isTrue();
        assertThat(instances.size()).isEqualTo(1);
        JsonNode one = instances.get(0);
        assertThat(one.path("instanceId").asText()).isEqualTo(instanceId);
        assertThat(one.path("status").asText()).isEqualTo("UP");
        // The address is the point of a registry: a reader must get back the port the service announced,
        // not the registry's own port and not a default.
        assertThat(one.path("port").path("$").asInt()).isEqualTo(8123);
        assertThat(one.path("ipAddr").asText()).isEqualTo("127.0.0.1");
    }

    @Test
    void aRenewalIsAcceptedForAKnownInstanceAndRefusedForAnUnknownOne() throws Exception {
        String app = "SC-RENEW";
        String instanceId = "sc-renew-1";
        assertThat(send("POST", "/eureka/apps/" + app, registrationBody(app, instanceId, 8124), "application/json")
                        .statusCode())
                .isEqualTo(204);

        HttpResponse<String> renew =
                send("PUT", "/eureka/apps/" + app + "/" + instanceId, null, null);
        assertThat(renew.statusCode()).isEqualTo(200);

        HttpResponse<String> stranger =
                send("PUT", "/eureka/apps/" + app + "/not-an-instance", null, null);
        assertThat(stranger.statusCode()).isEqualTo(404);
    }

    @Test
    void aCancelledRegistrationIsGoneFromTheList() throws Exception {
        String app = "SC-CANCEL";
        String instanceId = "sc-cancel-1";
        assertThat(send("POST", "/eureka/apps/" + app, registrationBody(app, instanceId, 8125), "application/json")
                        .statusCode())
                .isEqualTo(204);
        assertThat(send("GET", "/eureka/apps/" + app, null, null).statusCode()).isEqualTo(200);

        HttpResponse<String> cancel =
                send("DELETE", "/eureka/apps/" + app + "/" + instanceId, null, null);
        assertThat(cancel.statusCode()).isEqualTo(200);

        assertThat(send("GET", "/eureka/apps/" + app, null, null).statusCode()).isEqualTo(404);
        HttpResponse<String> all = send("GET", "/eureka/apps", null, null);
        assertThat(all.statusCode()).isEqualTo(200);
        assertThat(all.body()).doesNotContain(instanceId);
    }

    @Test
    void twoInstancesOfOneServiceAreBothListed() throws Exception {
        String app = "SC-SCALE";
        assertThat(send("POST", "/eureka/apps/" + app, registrationBody(app, "sc-scale-1", 8126), "application/json")
                        .statusCode())
                .isEqualTo(204);
        assertThat(send("POST", "/eureka/apps/" + app, registrationBody(app, "sc-scale-2", 8127), "application/json")
                        .statusCode())
                .isEqualTo(204);

        JsonNode instances = JSON.readTree(send("GET", "/eureka/apps/" + app, null, null).body())
                .path("application")
                .path("instance");
        assertThat(instances.size()).isEqualTo(2);
        assertThat(instances.toString()).contains("sc-scale-1").contains("sc-scale-2");
        assertThat(instances.toString()).contains("8126").contains("8127");
    }
}