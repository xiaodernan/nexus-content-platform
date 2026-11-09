package dev.nexus.gateway;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * What the registry knows, read at the moment of the request.
 *
 * <p>This is the platform's honest answer to "which services are deployed?" — a question the Studio and an
 * operator both ask, and which until now could only be answered by reading a config file that might name a
 * host nobody started.
 *
 * <p>Three things it deliberately does NOT claim:
 *
 * <ul>
 *   <li>An address listed here is what the REGISTRY holds. It is not a health check this gateway performed:
 *       a service that died without cancelling its lease stays listed until the lease expires. The field is
 *       named {@code addresses}, not {@code healthy}, and {@code note} says so on every answer.
 *   <li>{@code measuredAt} is the instant of THIS read. The answer is a point-in-time snapshot, not a
 *       subscription, and a caller that caches it is caching a fact with a date on it.
 *   <li>With no discovery client wired, or with a registry that knows nobody, the answer is an empty list
 *       and a note saying which of those two it is — not a fabricated entry and not a 500.
 * </ul>
 */
@RestController
public class PlatformServicesController {

    private final ObjectProvider<DiscoveryClient> discovery;

    public PlatformServicesController(ObjectProvider<DiscoveryClient> discovery) {
        this.discovery = discovery;
    }

    @GetMapping("/platform/services")
    public Map<String, Object> services() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("measuredAt", Instant.now().toString());
        DiscoveryClient client = discovery.getIfAvailable();
        if (client == null) {
            out.put("source", "none");
            out.put("services", List.of());
            out.put("total", 0);
            out.put("note", "no discovery client is wired in this gateway, so it cannot name any service");
            return out;
        }
        out.put("source", client.description());
        List<Map<String, Object>> rows = new ArrayList<>();
        for (String id : client.getServices()) {
            List<ServiceInstance> instances = client.getInstances(id);
            List<String> addresses = new ArrayList<>();
            for (ServiceInstance instance : instances) {
                addresses.add(instance.getUri().toString());
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", id);
            row.put("instances", instances.size());
            row.put("addresses", addresses);
            rows.add(row);
        }
        out.put("services", rows);
        out.put("total", rows.size());
        out.put(
                "note",
                rows.isEmpty()
                        ? "the registry answered and knows no service; nothing is deployed or nothing has registered yet"
                        : "addresses are what the registry holds, not a health check this gateway performed");
        return out;
    }
}