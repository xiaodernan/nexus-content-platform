package com.nexus.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nexus.domain.billing.BillingService;
import com.nexus.domain.community.CommunityService;
import com.nexus.domain.permission.PermissionService;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The guard against a FABRICATED answer coming back.
 *
 * <p>This service shipped three domain services whose methods answered with values the service had
 * never established: a credit balance of {@code 0}, an admin flag of {@code false}, a plan of
 * {@code "free"}, and — worse — five {@code void} methods that did nothing at all while the caller
 * received SUCCESS. This repository's rule is that no surface may answer with a fact it did not
 * establish (§159), so those bodies now refuse.
 *
 * <p>A refusal is easy to undo by accident. One "helpful" edit that restores {@code return 0;} puts
 * the lie back, and nothing else in the build would notice — the service still compiles, the other
 * tests still pass, and the fake is invisible until a user is told they have no credits.
 *
 * <p>So this case does not test any one method. It <b>enumerates</b> the public methods of the
 * three services that do not own their writes and requires that EVERY one of them REFUSES, by
 * name. A method that starts answering again fails here, whatever the answer is — which is the
 * point: the test does not care whether the new answer is plausible, only that it is an answer this
 * service never established.
 *
 * <p>The enumeration is derived from the class, not written out by hand. A hand-written list is a
 * list that goes stale the moment a method is added, and a stale list is a hole in a guard.
 */
class NoFabricatedAnswersTest {

    /** The services whose writes this service does not own. */
    private static final List<Class<?>> NOT_OWNED = List.of(
            BillingService.class,
            CommunityService.class,
            PermissionService.class);

    @Test
    void everyMethodOnAServiceThatDoesNotOwnItsWritesRefusesByName() throws Exception {
        List<String> answered = new ArrayList<>();

        for (Class<?> service : NOT_OWNED) {
            for (Method method : service.getDeclaredMethods()) {
                if (!Modifier.isPublic(method.getModifiers())) {
                    continue;
                }
                if (method.getDeclaringClass() == Object.class) {
                    continue;
                }
                if (method.isSynthetic()) {
                    continue;
                }

                Object instance = service.getDeclaredConstructor().newInstance();
                Object[] arguments = argumentsFor(method);

                try {
                    Object result = method.invoke(instance, arguments);
                    // It RETURNED. That is the failure: this service answered a question it does
                    // not own, with a value it never established.
                    answered.add(service.getSimpleName() + "." + method.getName() + " returned " + result);
                } catch (InvocationTargetException e) {
                    Throwable cause = e.getCause();
                    assertThat(cause)
                            .as("%s.%s must refuse with UnimplementedOperation, not something else",
                                    service.getSimpleName(), method.getName())
                            .isInstanceOf(UnimplementedOperation.class);

                    UnimplementedOperation refusal = (UnimplementedOperation) cause;
                    assertThat(refusal.getOperation())
                            .as("%s.%s must NAME the operation it refused",
                                    service.getSimpleName(), method.getName())
                            .isNotBlank()
                            .contains(method.getName());
                    assertThat(refusal.getReason())
                            .as("%s.%s must say WHY it is not implemented",
                                    service.getSimpleName(), method.getName())
                            .isNotBlank();
                    assertThat(refusal.getMessage())
                            .as("the message must carry both halves, so a caller reading only the message learns the whole truth")
                            .contains(refusal.getOperation())
                            .contains(refusal.getReason());
                }
            }
        }

        assertThat(answered)
                .as("these methods ANSWERED instead of refusing — a made-up answer is worse than a refusal (§159)")
                .isEmpty();
    }

    @Test
    void theGuardItselfCoversEveryMethodItMeansTo() {
        // A guard that enumerates nothing is a guard that passes forever. The population is DERIVED
        // from the classes, so it cannot silently shrink to zero.
        int covered = 0;
        for (Class<?> service : NOT_OWNED) {
            for (Method method : service.getDeclaredMethods()) {
                if (Modifier.isPublic(method.getModifiers())
                        && method.getDeclaringClass() != Object.class
                        && !method.isSynthetic()) {
                    covered += 1;
                }
            }
        }
        assertThat(covered)
                .as("the three services that do not own their writes expose 15 methods; a smaller population means the guard stopped seeing something")
                .isEqualTo(15);
    }

    @Test
    void aRefusalCarriesItsOwnTruthRatherThanAStringSomebodyHasToParse() {
        UnimplementedOperation refusal = new UnimplementedOperation("billing.getCreditBalance", "the ledger lives elsewhere");

        assertThat(refusal.getOperation()).isEqualTo("billing.getCreditBalance");
        assertThat(refusal.getReason()).isEqualTo("the ledger lives elsewhere");
        assertThat(refusal.getMessage())
                .contains("billing.getCreditBalance")
                .contains("the ledger lives elsewhere");
        assertThatThrownBy(() -> { throw refusal; })
                .isInstanceOf(UnimplementedOperation.class);
    }

    /** A value for every parameter of the method, so it can be invoked. */
    private static Object[] argumentsFor(Method method) {
        Class<?>[] types = method.getParameterTypes();
        Object[] arguments = new Object[types.length];
        for (int i = 0; i < types.length; i += 1) {
            Class<?> type = types[i];
            if (type == String.class) {
                arguments[i] = "an-argument";
            } else if (type == int.class || type == Integer.class) {
                arguments[i] = 1;
            } else if (type == boolean.class || type == Boolean.class) {
                arguments[i] = Boolean.TRUE;
            } else if (type == long.class || type == Long.class) {
                arguments[i] = 1L;
            } else {
                arguments[i] = null;
            }
        }
        return arguments;
    }
}
