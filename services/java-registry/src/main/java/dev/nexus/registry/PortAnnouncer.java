package dev.nexus.registry;

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
 * caller then has to LEARN which one it got. The usual way is to parse "Tomcat started on port N"
 * out of the log — which broke the first version of this repo's publish proof, because the
 * service's own logging config sets {@code root: warn} and that line is INFO. A proof that depends
 * on a log level is a proof that fails when someone tunes logging.
 *
 * <p>So the port is reported as DATA, from the event that says the server is listening, and it is
 * written only when {@code nexus.port-file} is configured. Unset (the normal deployment) means this
 * component does nothing at all.
 *
 * <p>This is the same rule `services/nexus-api` follows. The two copies are deliberate for now:
 * NEXUS's Java services are independent Maven projects with no shared parent, and introducing a
 * shared module to carry one 40-line class would trade a real duplication for a structural change
 * that touches every Java build. When a third service needs it, the shared module is the right
 * answer — and that decision belongs in an ADR, not in a silent copy.
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
        log.info("nexus-registry listening on port {}", port);
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
