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
 * <p>The spring-cloud topology proof starts each of the four services with {@code -Dnexus.port-file=<path>}
 * and waits for that file to learn the randomly-bound port. Without this component the gateway boots fine
 * but never announces its port, so the proof times out at section 6 even though the service is healthy —
 * the exact defect the registry had until the same component was added there. Blank default = no-op in a
 * normal deployment and in the WebFlux test slice; only a caller that asks for the port file gets one.
 *
 * <p>Consistent with ADR-0237's one-family naming and the copies already in {@code nexus-api},
 * {@code nexus-registry} and {@code java-domain-service}.
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
            throw new UncheckedIOException("could not write the port file " + portFile, e);
        }
    }
}
