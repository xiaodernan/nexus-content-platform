package dev.nexus.api.webhooks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

/**
 * M10 v558 — the one class that touches a real socket, graded against a socket of the test's own.
 *
 * <p>No {@code HttpServer} and no external network: a {@link ServerSocket} on loopback accepts exactly ONE
 * request, records it, and answers with the status the test chose. That keeps the two facts that matter
 * provable without a dependency — the request carries what the dispatcher signed, and the STATUS the endpoint
 * answered is what the transport reports (a 3xx included, because redirects are not followed).
 */
class HttpClientTransportTest {

    private final HttpClientTransport transport = new HttpClientTransport();

    /** One request, read off the wire: what a subscriber's server would have seen. */
    private record Recorded(String method, String path, Map<String, String> headers, String body) {
    }

    /** A loopback endpoint that answers one request and dies. */
    private static final class Endpoint implements AutoCloseable {

        private final ServerSocket socket;
        private final Thread thread;
        private final AtomicReference<Recorded> recorded = new AtomicReference<>();

        Endpoint(int status, String location) throws IOException {
            socket = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"));
            socket.setSoTimeout(10_000);
            thread = new Thread(() -> serve(status, location));
            thread.setDaemon(true);
            thread.start();
        }

        private void serve(int status, String location) {
            try (Socket client = socket.accept()) {
                InputStream in = client.getInputStream();
                String head = readHead(in);
                String[] lines = head.split("\r\n");
                String requestLine = lines.length == 0 ? "" : lines[0];
                Map<String, String> headers = new LinkedHashMap<>();
                for (int i = 1; i < lines.length; i++) {
                    int colon = lines[i].indexOf(':');
                    if (colon > 0) {
                        headers.put(lines[i].substring(0, colon).trim().toLowerCase(Locale.ROOT),
                                lines[i].substring(colon + 1).trim());
                    }
                }
                int length = Integer.parseInt(headers.getOrDefault("content-length", "0"));
                String body = new String(in.readNBytes(length), StandardCharsets.UTF_8);
                String[] parts = requestLine.split(" ");
                recorded.set(new Recorded(parts.length > 0 ? parts[0] : "", parts.length > 1 ? parts[1] : "",
                        headers, body));

                OutputStream out = client.getOutputStream();
                String reason = status == 200 ? "OK" : status == 204 ? "No Content" : "Status";
                StringBuilder response = new StringBuilder("HTTP/1.1 " + status + " " + reason + "\r\n");
                if (location != null) {
                    response.append("Location: ").append(location).append("\r\n");
                }
                response.append("Content-Length: 0\r\nConnection: close\r\n\r\n");
                out.write(response.toString().getBytes(StandardCharsets.US_ASCII));
                out.flush();
            } catch (IOException e) {
                // A test that fails to be reached fails at the assertion on the answer, not here.
            }
        }

        /** Everything up to the blank line that ends the head, exactly as it arrived. */
        private static String readHead(InputStream in) throws IOException {
            ByteArrayOutputStream head = new ByteArrayOutputStream();
            int run = 0;
            int b;
            while ((b = in.read()) != -1) {
                head.write(b);
                run = (b == '\r' || b == '\n') ? run + 1 : 0;
                if (run == 4) {
                    break;
                }
            }
            return head.toString(StandardCharsets.UTF_8).replaceAll("\r\n$", "");
        }

        String url(String path) {
            return "http://127.0.0.1:" + socket.getLocalPort() + path;
        }

        Recorded await() throws InterruptedException {
            thread.join(10_000);
            return recorded.get();
        }

        @Override
        public void close() throws IOException {
            socket.close();
        }
    }

    @Test
    void theRequestOnTheWireIsTheBodyAndHeadersThatWereHandedOver() throws Exception {
        String body = "{\"event\":\"ping\",\"targetId\":\"wh-1\",\"at\":1790000000000}";
        try (Endpoint endpoint = new Endpoint(204, null)) {
            WebhookTransport.WebhookResponse response = transport.post(
                    endpoint.url("/nexus"),
                    body,
                    Map.of("Content-Type", "application/json; charset=utf-8", "Nexus-Signature", "t=1,v1=abc"),
                    Duration.ofSeconds(5));

            Recorded seen = endpoint.await();
            assertThat(response.status()).isEqualTo(204);
            assertThat(seen.method()).isEqualTo("POST");
            assertThat(seen.path()).isEqualTo("/nexus");
            assertThat(seen.body()).isEqualTo(body);
            assertThat(seen.headers().get("nexus-signature")).isEqualTo("t=1,v1=abc");
            assertThat(seen.headers().get("content-type")).isEqualTo("application/json; charset=utf-8");
        }
    }

    @Test
    void aNonTwoHundredIsReportedAsTheStatusItIs() throws Exception {
        try (Endpoint endpoint = new Endpoint(500, null)) {
            WebhookTransport.WebhookResponse response = transport.post(
                    endpoint.url("/nexus"), "{}", Map.of(), Duration.ofSeconds(5));
            assertThat(response.status()).isEqualTo(500);
            assertThat(endpoint.await().method()).isEqualTo("POST");
        }
    }

    @Test
    void aRedirectIsReportedRatherThanFollowed() throws Exception {
        try (Endpoint endpoint = new Endpoint(302, "http://127.0.0.1:1/elsewhere")) {
            WebhookTransport.WebhookResponse response = transport.post(
                    endpoint.url("/nexus"), "{}", Map.of(), Duration.ofSeconds(5));

            // Following a redirect would send the signed body to an address the subscriber never registered,
            // so the 3xx itself is the delivery's answer — and it is a refusal, not a crash.
            assertThat(response.status()).isEqualTo(302);
            Recorded seen = endpoint.await();
            assertThat(seen.path()).isEqualTo("/nexus");
        }
    }

    @Test
    void aPortNobodyListensOnSurfacesAsAnExceptionRatherThanAStatus() throws Exception {
        int port;
        try (ServerSocket closed = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            port = closed.getLocalPort();
        }

        assertThatThrownBy(() -> transport.post(
                "http://127.0.0.1:" + port + "/nexus", "{}", Map.of(), Duration.ofSeconds(2)))
                .isInstanceOf(IOException.class);
    }
}
