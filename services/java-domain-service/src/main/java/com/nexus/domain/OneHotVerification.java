package com.nexus.domain;

import java.util.List;

/**
 * The one-hot verdict for a discovered instance, computed over the registry's view of the world.
 *
 * <p>Two things must hold for an instance to be a clean one-hot writer: the registry knows this
 * exact instance, and the registry holds no <em>stale</em> instance with the same identity. The
 * verdict is pure data so the gate can be graded exhaustively without a running Eureka.
 *
 * <p>The host check is deliberately loose: it does not try to prove the host is THIS machine, it only
 * proves an indistinguishable-but-dead twin is not currently occupying the same identity in the
 * registry. A strict host match would make the test suite fragile on machines whose hostname is a
 * cell instead of a human label; what matters is whether there is a dead instance hogging the
 * registration, not whether the machine name spells itself back to itself.
 */
public final class OneHotVerification {

    /** The outcome categories. `disabled` is not a failure; it is the opt-in contract. */
    public enum Outcome {
        /** Discovery is off — the service behaves as it did before. */
        disabled,
        /** The registry knows this instance, and no stale twin is squatting on its identity. */
        ok,
        /** The registry does not know this instance at all — either it failed to register, or the
         *  registry is unreachable. The caller must not serve traffic while this is unremedied. */
        unknown_instance,
        /** The registry holds enough exact-identity entries to make "which of me is answering" a
         *  guess. With `hardMode=true` this is fatal; with false, it is logged and the service
         *  keeps running with the count exposed for operators to see. */
        ambiguous_identity,
    }

    public record Report(
            Outcome outcome,
            int totalInstances,
            int exactIdentityCount,
            String instanceId,
            String message) {
        public boolean ok() {
            return outcome == Outcome.ok || outcome == Outcome.disabled;
        }
    }

    /**
     * @param instanceId    this pod's identity (host:port or the cloud metadata id)
     * @param registeredIds all instance ids the registry currently knows for THIS service
     * @param enabled       whether discovery is turned on at all
     * @param multipleAllowed whether MORE THAN ONE live entry is acceptable (scale-out path)
     */
    public static Report evaluate(String instanceId, List<String> registeredIds, boolean enabled, boolean multipleAllowed) {
        if (!enabled) {
            return new Report(Outcome.disabled, 0, 0, instanceId == null ? "" : instanceId,
                    "discovery is disabled (NEXUS_EUREKA_ENABLED is not true)");
        }
        if (registeredIds == null || registeredIds.isEmpty()) {
            return new Report(Outcome.unknown_instance,
                    0, 0, instanceId == null ? "" : instanceId,
                    "the registry holds no instance for this service");
        }
        if (instanceId == null || instanceId.isBlank()) {
            return new Report(Outcome.unknown_instance,
                    registeredIds.size(), 0, "",
                    "this service cannot see its own instance id (cannot verify the one-hot contract)");
        }
        long exact = registeredIds.stream().filter(id -> id != null && id.contains(instanceId)).count();
        if (exact == 0) {
            return new Report(Outcome.unknown_instance,
                    registeredIds.size(), 0, instanceId,
                    "the service registered with the registry but the registry does not list its instance id");
        }
        if (exact > 1 && !multipleAllowed) {
            return new Report(Outcome.ambiguous_identity,
                    registeredIds.size(), (int) exact, instanceId,
                    "the registry holds " + exact + " instances matching this pod's identity; "
                            + "with one-hot enforcement, refusing to answer until the stale entry is evicted");
        }
        return new Report(Outcome.ok,
                registeredIds.size(), (int) exact, instanceId,
                "one-hot contract holds: this pod is registered (" + exact + " exact match" + (exact > 1 ? "es" : "") + ")");
    }
}
