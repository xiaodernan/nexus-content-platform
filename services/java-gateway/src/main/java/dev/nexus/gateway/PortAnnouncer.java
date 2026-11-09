package dev.nexus.gateway;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.context.WebServerInitializedEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.stereotype.Component;

/**
 * Writes the port this service actually bound to {@code nexus.port-file}, once the web server is up.
 *
 * <p>Why this exists: a service started with {@code server.port=0} asks the OS for a port, and a
 * caller then has to LEARN which one it got. The usual way is to parse "Netty started on port N"
 * out of the log — which is a proof that fails when someone tunes logging. The port is reported as
 * DATA here instead, from the event that says the server is listening.
 *
 * <p>This is the same rule {@code services/nexus-api} and {@code services/java-registry} follow.
 * The copies are deliberate for now: NEXUS's Java services are independent Maven projects with no
 * shared parent, and introducing a shared module to carry one 40-line class would trade a real
 * duplication for a structural change that touches every Java build. When a third service needs it,
 * the shared module is the right answer — and that decision belongs in an ADR, not in a silent copy.
 */
@Component
public class PortAnnouncer implements ApplicationListener<WebServerInitializedEvent> {

    private static final Logger log = LoggerFactory.getLogger(PortAnnouncer.class);

    private final String portFile;

    public PortAnnouncer(@Value("${nexus.port-file:}") String portFile) {
        this.portFile = portFile;
    }

    @Override
    public void onApplicationEvent(WebServerInitializedEvent event) {
        int port = event.getWebServer().getPort();
        log.info("nexus-gateway listening on port {}", port);
        if (portFile == null || portFile.isBlank()) {
            return;
        }
        try {
            Files.writeString(Path.of(portFile), Integer.toString(port));
        } catch (IOException e) {
            // A caller that ASKED for the port file and did not get one is a caller that cannot connect, so
            // this is an error rather than a warning — but it must not take the service down, because the
            // service itself is healthy and serving.
            throw new UncheckedIOException("could not write the port file " + portFile, e);
        }
    }
}
