package com.nexus.domain.status;

import java.io.IOException;
import java.net.URI;
import java.security.CodeSource;
import java.sql.Connection;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.jar.Attributes;
import java.util.jar.JarInputStream;
import java.util.jar.Manifest;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * The health answer: the process is alive, and the database is MEASURED rather than assumed.
 *
 * <p>The measurement is ONE borrow, ONE validity check, ONE close. There is no retry and no background
 * probe: when the pool has no usable connection, the borrow waits for the pool's own
 * {@code connectionTimeout}, and this service does not invent a competing deadline. A health door that
 * added its own timeout would answer "down" while the pool was still trying, which is a different claim
 * from the one this door makes.
 *
 * <p>{@code version} is the version the BUILD wrote into the packaged jar's manifest. It is read once,
 * when this bean is constructed; an unpackaged tree (a unit test, an IDE run) has no such manifest, and
 * the answer is honestly {@code "unknown"} rather than a guessed or hard-coded number.
 *
 * <p>Nothing is written. No audit entry, no webhook delivery, no table: a health read is not a fact about
 * the world. The only state this class keeps is {@code startedAt}, which is the process's own.
 */
@Service
public class HealthService {

    /** The token used when a connection was borrowed but refused to validate itself. */
    public static final String INVALID_CONNECTION = "invalid-connection";

    /** The token used when this build has no packaged manifest to read a version from. */
    public static final String UNKNOWN_VERSION = "unknown";

    private final DataSource dataSource;
    private final Clock clock;
    private final String service;
    private final String version;
    private final Instant startedAt;

    public HealthService(
            DataSource dataSource,
            @Value("${spring.application.name:nexus-domain-service}") String service) {
        this(dataSource, service, Clock.systemUTC());
    }

    /** The seam a test uses: the same service, with a clock it can pin. */
    HealthService(DataSource dataSource, String service, Clock clock) {
        this.dataSource = dataSource;
        this.clock = clock;
        this.service = service;
        this.version = runtimeVersion();
        this.startedAt = clock.instant();
    }

    /**
     * Answer the two facts. Uptime is measured against the SAME clock that stamped {@code startedAt}, so a
     * test can pin both; a clock that moves backwards is clamped to zero rather than answered as a
     * negative age.
     */
    public HealthDtos.Health report() {
        return new HealthDtos.Health(service, version, startedAt, uptimeSeconds(), database());
    }

    /**
     * The process fact alone. This method does not read the database, does not borrow a connection and
     * does not start a timer: a liveness probe that walked into the pool would inherit the pool's
     * {@code connectionTimeout} and turn "the process is up" into "the process is up, unless the database
     * is down" — exactly the fact a liveness probe must not have.
     */
    public HealthDtos.Liveness liveness() {
        return new HealthDtos.Liveness(service, version, startedAt, uptimeSeconds());
    }

    private long uptimeSeconds() {
        return Math.max(0L, Duration.between(startedAt, clock.instant()).toSeconds());
    }

    private HealthDtos.Database database() {
        long began = System.nanoTime();
        boolean reachable = false;
        String detail;
        Connection connection = null;
        try {
            connection = dataSource.getConnection();
            if (connection.isValid(1)) {
                reachable = true;
                detail = null;
            } else {
                detail = INVALID_CONNECTION;
            }
        } catch (Exception e) {
            // The SIMPLE NAME only: a message can carry a host, a user or a password, and this body is
            // served without authentication. Naming the failure must not describe the machine.
            detail = e.getClass().getSimpleName();
        } finally {
            if (connection != null) {
                try {
                    connection.close();
                } catch (Exception ignored) {
                    // A close that fails does not change what the borrow already measured.
                }
            }
        }
        long latencyMs = Math.max(0L, Duration.ofNanos(System.nanoTime() - began).toMillis());
        return new HealthDtos.Database(reachable, latencyMs, detail);
    }

    /**
     * The version this process is running, read from the package first (a plain jar exposes it there) and
     * then from the outer jar's manifest (a Spring Boot executable jar nests its classes, so the package
     * can lack the attribute). {@code "unknown"} when neither is available.
     */
    static String runtimeVersion() {
        Package pkg = HealthService.class.getPackage();
        String packaged = pkg == null ? null : pkg.getImplementationVersion();
        if (packaged != null && !packaged.isBlank()) {
            return packaged.trim();
        }
        String fromManifest = manifestVersion();
        return fromManifest == null ? UNKNOWN_VERSION : fromManifest;
    }

    private static String manifestVersion() {
        try {
            CodeSource source = HealthService.class.getProtectionDomain().getCodeSource();
            if (source == null || source.getLocation() == null) {
                return null;
            }
            String location = source.getLocation().toString();
            String outer = location.startsWith("jar:") ? location.substring("jar:".length()) : location;
            int nested = outer.indexOf("!/");
            if (nested >= 0) {
                outer = outer.substring(0, nested);
            }
            if (!outer.endsWith(".jar")) {
                // An unpackaged classes directory has no manifest to read; do not guess from the path.
                return null;
            }
            try (JarInputStream jar = new JarInputStream(URI.create(outer).toURL().openStream())) {
                Manifest manifest = jar.getManifest();
                if (manifest == null) {
                    return null;
                }
                String value = manifest.getMainAttributes().getValue(Attributes.Name.IMPLEMENTATION_VERSION);
                if (value == null || value.isBlank()) {
                    return null;
                }
                return value.trim();
            }
        } catch (IOException | RuntimeException e) {
            // Metadata that cannot be read is not a reason for the health door to fail to start.
            return null;
        }
    }
}
