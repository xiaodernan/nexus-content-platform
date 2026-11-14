package com.nexus.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The one-hot contract, answered for every possibility the gate can face.
 *
 * <p>The gate exists to stop two specific lies: "this pod registered, so everything is fine" when
 * the registry serves a dead twin; and "the registry is unreachable, so start anyway". Each of
 * those is an answer that costs an operator minutes they do not know they spent.
 */
class OneHotVerificationTest {

    @Test
    void discovery_disabled_never_thinks_it_is_a_proof() {
        OneHotVerification.Report r = OneHotVerification.evaluate("10.0.0.1:8081", List.of("x"), false, false);
        assertThat(r.outcome()).isEqualTo(OneHotVerification.Outcome.disabled);
        assertThat(r.ok()).isTrue();
    }

    @Test
    void registry_empty_means_register_or_evict() {
        OneHotVerification.Report r = OneHotVerification.evaluate("10.0.0.1:8081", List.of(), true, false);
        assertThat(r.outcome()).isEqualTo(OneHotVerification.Outcome.unknown_instance);
        assertThat(r.ok()).isFalse();
    }

    @Test
    void registry_serving_the_instance_is_a_pass() {
        OneHotVerification.Report r =
                OneHotVerification.evaluate("10.0.0.1:8081", List.of("http://10.0.0.1:8081/eureka/apps/nexus-domain-service/10.0.0.1:8081"), true, false);
        assertThat(r.outcome()).isEqualTo(OneHotVerification.Outcome.ok);
        assertThat(r.exactIdentityCount()).isEqualTo(1);
        assertThat(r.ok()).isTrue();
    }

    @Test
    void two_instances_sharing_an_identity_is_an_ambiguous_flag() {
        OneHotVerification.Report r = OneHotVerification.evaluate(
                "10.0.0.1:8081",
                List.of(
                        "http://10.0.0.1:8081/eureka/apps/nexus-domain-service/10.0.0.1:8081",
                        "http://10.0.0.2:8081/eureka/apps/nexus-domain-service/10.0.0.1:8081"),
                true,
                false);
        assertThat(r.outcome()).isEqualTo(OneHotVerification.Outcome.ambiguous_identity);
        assertThat(r.exactIdentityCount()).isEqualTo(2);
        assertThat(r.ok()).isFalse();
    }

    @Test
    void multiple_instances_with_permission_pass() {
        OneHotVerification.Report r = OneHotVerification.evaluate(
                "10.0.0.1:8081",
                List.of(
                        "http://10.0.0.1:8081/eureka/apps/nexus-domain-service/10.0.0.1:8081",
                        "http://10.0.0.2:8081/eureka/apps/nexus-domain-service/10.0.0.1:8081"),
                true,
                true);
        assertThat(r.outcome()).isEqualTo(OneHotVerification.Outcome.ok);
        assertThat(r.ok()).isTrue();
    }

    @Test
    void missing_own_id_is_a_failure_even_when_registry_is_full() {
        OneHotVerification.Report r = OneHotVerification.evaluate("not-a-host-port", List.of("one"), true, false);
        assertThat(r.outcome()).isEqualTo(OneHotVerification.Outcome.unknown_instance);
        assertThat(r.totalInstances()).isEqualTo(1);
    }

    @Test
    void nothing_matches_at_all() {
        OneHotVerification.Report r =
                OneHotVerification.evaluate("10.0.0.99:8081", List.of("http://10.0.0.1:8081/eureka/apps/nexus-domain-service/10.0.0.1:8081"), true, false);
        assertThat(r.outcome()).isEqualTo(OneHotVerification.Outcome.unknown_instance);
    }
}
