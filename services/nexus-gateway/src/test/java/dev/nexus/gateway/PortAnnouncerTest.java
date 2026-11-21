package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.web.context.WebServerInitializedEvent;
import org.springframework.boot.web.server.WebServer;

/**
 * The server-side truth behind the Spring Cloud proof's §6 port announcement
 * (added in 8025c4e4). The proof waits for each of the four services to write its randomly-bound
 * port to {@code -Dnexus.port-file}; the gateway used to boot fine but never wrote it, so §6 timed out.
 *
 * <p>These tests need no web server and no Docker: they hand the listener a mocked
 * {@link WebServerInitializedEvent} and assert the file side effect directly. Blank default must
 * be a no-op so a normal deployment and the WebFlux test slice stay unaffected.
 */
class PortAnnouncerTest {

    @TempDir
    Path tempDir;

    private WebServerInitializedEvent eventFor(int port) {
        WebServerInitializedEvent event = mock(WebServerInitializedEvent.class);
        WebServer server = mock(WebServer.class);
        when(server.getPort()).thenReturn(port);
        when(event.getWebServer()).thenReturn(server);
        return event;
    }

    @Test
    void writesTheActualBoundPortToFile() throws Exception {
        Path file = tempDir.resolve("gateway.port");
        new PortAnnouncer(file.toString()).onApplicationEvent(eventFor(39117));

        assertThat(Files.exists(file)).isTrue();
        assertThat(Files.readString(file)).isEqualTo("39117");
    }

    @Test
    void blankDefaultIsANoOp() {
        Path file = tempDir.resolve("should-not-appear.port");
        new PortAnnouncer("").onApplicationEvent(eventFor(40001));
        new PortAnnouncer("   ").onApplicationEvent(eventFor(40002));

        assertThat(Files.exists(file)).isFalse();
    }

    @Test
    void anUnwritablePathFailsLoudlyRatherThanSilentlyTimingOut() {
        Path directoryAsFile = tempDir; // writing to a directory throws
        assertThatThrownBy(() ->
                new PortAnnouncer(directoryAsFile.toString()).onApplicationEvent(eventFor(41000)))
                .isInstanceOf(UncheckedIOException.class)
                .hasMessageContaining("could not write the port file");
    }
}
