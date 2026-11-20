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
 * <p>Why this exists: a proof started this service with {@code -Dserver.port=<free port>} and then waits
 * for a file to learn which port it bound, rather than parsing "Tomcat started on port N" out of a log the
 * service's own {@code root: warn} level suppresses. The port is reported as DATA, from the event that says
 * the server is listening, and is only written when {@code nexus.port-file} is configured — the normal
 * deployment leaves it blank and this component does nothing at all.
 *
 * <p>This is the same rule {@code services/nexus-api}, {@code services/java-domain-service} follow. The copy
 * is deliberate: NEXUS's Java services are independent Maven projects with no shared parent, and a shared
 * module to carry one 40-line class would trade a real duplication for a structural change across every
 * Java build. Consistent with ADR-0237's one-family naming, this one lives in {@code dev.nexus.registry}.
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
            // A caller that ASKED for the port file and did not get one cannot connect, so this is an error
            // rather than a warning — but it must not take the service down, which is healthy and serving.
            throw new UncheckedIOException("could not write the port file " + portFile, e);
        }
    }
}
