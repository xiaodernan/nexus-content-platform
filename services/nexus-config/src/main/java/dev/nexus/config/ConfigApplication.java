package dev.nexus.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.config.server.EnableConfigServer;

/**
 * The configuration address of the topology.
 *
 * <p>{@code native} mode serves the files beside this class from the classpath (see application.yml). The
 * server is read-only: it answers {@code GET /{application}/{profile}} and never writes configuration.
 */
@SpringBootApplication
@EnableConfigServer
public class ConfigApplication {

    public static void main(String[] args) {
        SpringApplication.run(ConfigApplication.class, args);
    }
}
