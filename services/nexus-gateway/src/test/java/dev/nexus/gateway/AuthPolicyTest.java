package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The single source of truth's own rules (SC-32).
 *
 * <p>{@link AuthWhitelistParityTest} proves the two doors AGREE; this proves the thing they agree on is
 * actually CORRECT. That distinction matters once the copied whitelists collapse into {@link AuthPolicy}:
 * if someone reverts {@link AuthPolicy#isOpen} to a bare {@code startsWith}, BOTH doors drift together and
 * parity alone stays green — the /fallbackish hole reopens unnoticed. These assertions are the second lock.
 */
class AuthPolicyTest {

    private static final List<String> EXACT = AuthPolicy.OPEN_EXACT;
    private static final List<String> PREFIXES = AuthPolicy.OPEN_PREFIXES;

    @Test
    void exactEntriesAreOpenButTheirLookalikesAreNot() {
        assertThat(AuthPolicy.isOpen("/platform/health", EXACT, PREFIXES)).isTrue();
        assertThat(AuthPolicy.isOpen("/actuator/health", EXACT, PREFIXES)).isTrue();
        // exact != prefix: a longer sibling must not inherit an open decision
        assertThat(AuthPolicy.isOpen("/platform/healthz", EXACT, PREFIXES)).isFalse();
        assertThat(AuthPolicy.isOpen("/actuator/health/extra", EXACT, PREFIXES)).isFalse();
        assertThat(AuthPolicy.isOpen("/platform", EXACT, PREFIXES)).isFalse();
    }

    @Test
    void aPrefixOpensItsSegmentChildrenButNotCharacterSiblings() {
        assertThat(AuthPolicy.isOpen("/fallback", EXACT, PREFIXES)).isTrue(); // the prefix root itself
        assertThat(AuthPolicy.isOpen("/fallback/nexus-api", EXACT, PREFIXES)).isTrue(); // a child (SC-24/29/31)
        assertThat(AuthPolicy.isOpen("/fallback/a/b", EXACT, PREFIXES)).isTrue(); // a deep child
        // the first-run defect: these share "/fallback" as a STRING but are not its segment children
        assertThat(AuthPolicy.isOpen("/fallbackish", EXACT, PREFIXES)).isFalse();
        assertThat(AuthPolicy.isOpen("/fallback-other", EXACT, PREFIXES)).isFalse();
        assertThat(AuthPolicy.isOpen("/fallbackX/y", EXACT, PREFIXES)).isFalse();
    }

    @Test
    void aTrailingSlashOnAConfiguredPrefixIsToleratedNotDoubled() {
        List<String> slashed = List.of("/fallback/");
        assertThat(AuthPolicy.isOpen("/fallback", EXACT, slashed)).isTrue();
        assertThat(AuthPolicy.isOpen("/fallback/nexus-api", EXACT, slashed)).isTrue();
        assertThat(AuthPolicy.isOpen("/fallbackish", EXACT, slashed)).isFalse();
    }

    @Test
    void realRoutesAndANullPathStayGuarded() {
        assertThat(AuthPolicy.isOpen("/api/publications", EXACT, PREFIXES)).isFalse();
        assertThat(AuthPolicy.isOpen("/platform/services", EXACT, PREFIXES)).isFalse();
        assertThat(AuthPolicy.isOpen("/actuator/circuitbreakers", EXACT, PREFIXES)).isFalse();
        assertThat(AuthPolicy.isOpen(null, EXACT, PREFIXES)).isFalse();
    }

    @Test
    void failClosedIsSharedAndOnlyBitesAnEnabledDoorWithABlankSecret() {
        assertThatThrownBy(() -> AuthPolicy.requireSecret(true, "  "))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> AuthPolicy.requireSecret(true, null))
                .isInstanceOf(IllegalStateException.class);
        // an enabled door WITH a secret, and a disabled door with no secret, are both legitimate
        assertThatCode(() -> AuthPolicy.requireSecret(true, "real-secret")).doesNotThrowAnyException();
        assertThatCode(() -> AuthPolicy.requireSecret(false, "")).doesNotThrowAnyException();
        assertThatCode(() -> AuthPolicy.requireSecret(false, null)).doesNotThrowAnyException();
    }

    @Test
    void theRefusalDialectIsStableAndNamesTheOpenPaths() {
        assertThat(AuthPolicy.refusalBody("missing_token"))
                .isEqualTo("{\"error\":\"unauthorized\",\"reason\":\"missing_token\","
                        + "\"note\":\"present Authorization: Bearer <token>; /platform/health and /fallback/** are open\"}");
    }
}
