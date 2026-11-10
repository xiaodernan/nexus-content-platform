package dev.nexus.configserver;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.config.server.EnableConfigServer;

/**
 * NEXUS config server (Spring Cloud Config, native profile).
 *
 * <p>Which properties each service reads from here is declared in {@code infra/config/}.
 * The services import it with {@code spring.config.import=optional:configserver:…}: a deployment
 * without the config door still starts, it just starts with the local {@code application.yml}.
 */
@SpringBootApplication
@EnableConfigServer
public class NexusConfigServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(NexusConfigServerApplication.class, args);
    }
}
