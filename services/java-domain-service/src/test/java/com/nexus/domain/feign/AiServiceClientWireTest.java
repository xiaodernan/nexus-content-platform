package com.nexus.domain.feign;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import feign.Feign;
import feign.Response;
import feign.codec.Decoder;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.openfeign.support.SpringMvcContract;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The Feign mapping against a real socket (the same pattern the gateway's lane proofs use): a stub
 * answering the body shape {@code apps/ai-service} really returns must be reached at exactly the path
 * the interface declares, and decoded into the map the interface promises.
 *
 * <p>Built with plain Feign + {@code SpringMvcContract} so the SPRING annotations ({@code @GetMapping})
 * are what get parsed — that is the part that can silently drift. What this test cannot grade (and does
 * not pretend to) is Spring's bean wiring of {@code @FeignClient} with {@code url="${...}"}; these tests
 * start no context, so the URL default is read by the Spring builder in production, not here.
 */
class AiServiceClientWireTest {

    /** The report shape from apps/ai-service/src/ai_service/app.py healthz(). */
    private static final String HEALTHZ_BODY = "{"
            + "\"service\":\"nexus-ai\",\"version\":\"0.1.0\",\"capability\":\"demo\","
            + "\"providers\":[{\"kind\":\"demo\",\"name\":\"demo\",\"status\":\"ok\",\"models\":[],\"reason\":null}],"
            + "\"queue\":{\"pending\":0,\"running\":0}}";

    @Test
    void healthzReachesTheDeclaredPathAndDecodesTheReport() throws Exception {
        AtomicReference<String> seenPath = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/healthz", exchange -> {
            seenPath.set(exchange.getRequestURI().getPath());
            byte[] bytes = HEALTHZ_BODY.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            try (var out = exchange.getResponseBody()) {
                out.write(bytes);
            }
        });
        server.start();
        try {
            ObjectMapper mapper = new ObjectMapper();
            Decoder decoder = (Response response, java.lang.reflect.Type type) -> {
                try (InputStream in = response.body().asInputStream()) {
                    return mapper.readValue(in, mapper.constructType(type));
                } catch (IOException e) {
                    throw new IllegalStateException("healthz body did not decode", e);
                }
            };
            AiServiceClient client = Feign.builder()
                    .contract(new SpringMvcContract())
                    .decoder(decoder)
                    .target(AiServiceClient.class, "http://127.0.0.1:" + server.getAddress().getPort());

            Map<String, Object> report = client.healthz();

            assertThat(seenPath.get()).as("the request must go where @GetMapping says").isEqualTo("/healthz");
            assertThat(report.get("service")).isEqualTo("nexus-ai");
            assertThat(report.get("queue")).isInstanceOf(Map.class);
        } finally {
            server.stop(0);
        }
    }
}
