package com.nexus.domain;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;

// SC-18: registers the declarative clients (AiServiceClient); none are injected yet, so the machinery
// is inert until a caller needs it — the same posture as discovery and config above.
@EnableFeignClients
@SpringBootApplication
public class DomainServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(DomainServiceApplication.class, args);
    }
}
