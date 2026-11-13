package dev.nexus.gateway;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

/**
 * A real HTTP server that stands in for the service behind the edge.
 *
 * <p>It exists so the gateway's test can prove something a mocked client never could: that bytes
 * which go IN at one address come OUT of the edge with the gateway's OWN path handling applied. A
 * mock of the gateway's client would answer whatever the test told it to answer, and would keep
 * answering after the upstream was gone — which is precisely the behaviour the gateway must NOT
 * have.
 *
 * <p>It is the JDK's own {@code com.sun.net.httpserver}, so it costs the build no extra dependency.
 */
final class StubUpstream {

    private final HttpServer server;
    private final int port;

    private StubUpstream(HttpServer server) {
        this.server = server;
        this.port = server.getAddress().getPort();
    }

    /** Starts a stub on an OS-assigned port (port 0), so two runs never collide. */
    static StubUpstream start() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            StubUpstream stub = new StubUpstream(server);
            server.createContext("/echo", stub::handle);
            // The runtime loop the JDK's HttpServer uses by default is fine for a test that makes a
            // handful of requests; a non-daemon executor would keep the JVM alive after the suite.
            server.setExecutor(null);
            server.start();
            return stub;
        } catch (IOException e) {
            throw new UncheckedIOException("could not start the stub upstream", e);
        }
    }

    int port() {
        return port;
    }

    /** Stops the stub, so the next connection to its port is REFUSED — the upstream is now absent. */
    void stop() {
        server.stop(0);
    }

    /**
     * Answers with a body that names the path the upstream was asked for.
     *
     * <p>Naming the path is the point: the gateway's {@code StripPrefix=1} must be visible in what
     * comes back. A stub that answered a fixed string would let a broken prefix rule pass.
     */
    private void handle(HttpExchange exchange) throws IOException {
        byte[] body = ("STUB-OK " + exchange.getRequestURI().getPath()).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "text/plain; charset=utf-8");
        exchange.sendResponseHeaders(200, body.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(body);
        }
    }
}
