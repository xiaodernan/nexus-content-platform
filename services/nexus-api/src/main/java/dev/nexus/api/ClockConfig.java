package dev.nexus.api;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The one bean this slice wires by hand.
 *
 * <p>{@link Clock} is a dependency rather than a static call so a test can publish at a PINNED instant and
 * assert the timestamp it stored — the same discipline the TypeScript side uses for anything time-shaped.
 * {@code Clock.systemUTC()} because a publication's instant is a fact about the world, not about a locale.
 */
@Configuration
public class ClockConfig {

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
