package dev.nexus.api.webhooks;

import java.net.InetAddress;
import java.util.Arrays;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * M10 v558 — the resolver the service actually runs: the platform's own lookup.
 *
 * <p>No cache, deliberately. A cache would answer the name that was true a minute ago, and a name that moved
 * after the check is the exact attack the check exists to refuse. The cost of a lookup per delivery is the
 * price of the rule, and it is stated here rather than hidden behind a cache's "performance".
 */
@Component
public class SystemHostResolver implements HostResolver {

    @Override
    public List<InetAddress> resolve(String host) throws Exception {
        return Arrays.asList(InetAddress.getAllByName(host));
    }
}
