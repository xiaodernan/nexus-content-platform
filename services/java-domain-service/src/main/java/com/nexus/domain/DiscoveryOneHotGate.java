package com.nexus.domain;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.stereotype.Component;

/**
 * Enforces the one-hot contract when this service is started under discovery.
 *
 * <p>Why this exists, measured: without it, the registry eventually serves stale entries
 * for this service after an unhelpful crash-and-restart cycle. The callers (OpenFeign clients in
 * `nexus-api`) then load-balance onto a dead host:port and see 503s that have nothing to do
 * with this pod's health — they are the registry's stale memory, not our liveness.
 *
 * <p>Behaviour: when `NEXUS_EUREKA_ENABLED=true`, this gate reads what the registry reports
 * for THIS service and classifies the result into a verdict (see {@link OneHotVerification}).
 * The default is `log-and-continue` — this is the safest opt-in for a service that already does
 * meaningful work before the registry catches up with it. A deployment sets
 * `NEXUS_ONE_HOT_GATE=hard` to get fail-fast refusal-to-serve instead.
 */
@Component
@ConditionalOnProperty(name = "eureka.client.enabled", havingValue = "true")
public class DiscoveryOneHotGate implements ApplicationListener<ContextRefreshedEvent> {

    private static final Logger log = LoggerFactory.getLogger(DiscoveryOneHotGate.class);

    private final DiscoveryClient discoveryClient;
    private final String instanceId;
    private final boolean multipleAllowed;
    private final boolean hardMode;

    public DiscoveryOneHotGate(
            @Autowired(required = false) DiscoveryClient discoveryClient,
            @Value("${nexus.one-hot-gate:log}") String gateMode,
            @Value("${nexus.permit-multiple-instances:false}") boolean multipleAllowed,
            @Value("${spring.application.name:nexus-domain-service}") String appName,
            @Value("${server.port:${NEXUS_DOMAIN_PORT:8081}}") String serverPort) {
        this.discoveryClient = discoveryClient;
        this.multipleAllowed = multipleAllowed;
        this.hardMode = "hard".equalsIgnoreCase(gateMode);
        String id;
        try {
            String host = InetAddress.getLocalHost().getHostAddress();
            String port = serverPort == null || serverPort.isBlank() ? "0" : serverPort;
            id = host + ":" + port;
        } catch (UnknownHostException e) {
            id = appName + ":unknown";
        }
        this.instanceId = id;
    }

    @Override
    public void onApplicationEvent(ContextRefreshedEvent event) {
        if (discoveryClient == null) {
            log.info("one-hot gate: discovery enabled but no DiscoveryClient wired; skipping");
            return;
        }
        String myService = "nexus-domain-service";
        List<String> registeredIds = discoveryClient.getInstances(myService)
                .stream()
                .map(si -> si.getInstanceId() == null ? "" : si.getInstanceId())
                .collect(Collectors.toList());
        OneHotVerification.Report report =
                OneHotVerification.evaluate(instanceId, registeredIds, true, multipleAllowed);
        switch (report.outcome()) {
            case disabled -> log.info("one-hot gate: discovery disabled, no check performed");
            case ok -> log.info("one-hot gate: {}", report.message());
            case unknown_instance -> {
                log.error("one-hot gate: {} ({} instances in registry)", report.message(), report.totalInstances());
                if (hardMode) {
                    throw new IllegalStateException(
                            "one-hot gate refused to start: the registry does not list this instance ("
                                    + instanceId + "); stale-entry eviction required before serving");
                }
            }
            case ambiguous_identity -> {
                log.error(
                        "one-hot gate: {} ({} instances in registry; first match count = {})",
                        report.message(),
                        report.totalInstances(),
                        report.exactIdentityCount());
                if (hardMode) {
                    throw new IllegalStateException(
                            "one-hot gate refused to start: " + report.exactIdentityCount()
                                    + " instances share this pod's identity in the registry — stale entries need eviction");
                }
            }
        }
    }
}
