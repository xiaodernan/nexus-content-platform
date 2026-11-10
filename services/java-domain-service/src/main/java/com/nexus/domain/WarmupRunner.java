package com.nexus.domain;

import com.nexus.domain.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Touches the JPA stack at boot, so the first real request does not pay Hibernate metamodel and
 * Hikari connection-pool warm-up — measured live on 2026-11-10: a cold first
 * {@code GET /api/v1/billing/plan} through the gateway answered 503 (the 5s response bound)
 * while the second, warm call answered in ~100ms.
 *
 * <p>This runner exists so that warm-up happens <b>at boot for every caller</b>, not inside the
 * smoke script. It never fails startup: a database that is down at boot is the health endpoint's
 * story (and the deployment's), not this bean's — and a smoke that assumes boot warm-up still
 * tolerates the failure mode by retrying.
 */
@Component
public class WarmupRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(WarmupRunner.class);

    private final UserRepository users;

    public WarmupRunner(UserRepository users) {
        this.users = users;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            long rows = users.count();
            log.info("warmup: shared schema reachable, users={}", rows);
        } catch (Exception e) {
            log.warn("warmup: shared schema not reachable at boot ({}); first requests may be slow",
                    e.getMessage());
        }
    }
}
