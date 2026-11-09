package com.nexus.domain.project;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * The project vocabulary, read from the schema that owns it.
 *
 * <p>Measured against the running database on 2026-11-09, {@code projects.kind} holds eleven labels and
 * {@code projects.visibility} holds three. The counts are pinned here on purpose: if the schema's
 * vocabulary changes and this service is not told, the test says so instead of the database saying so at
 * write time, as a 500 that blames the server for the caller's bad word.
 */
class ProjectVocabularyTest {

    @Test
    void theKindsAreTheOnesTheSchemaHolds() {
        assertThat(ProjectVocabulary.KINDS).hasSize(11)
                .contains("website", "webapp", "mobile-ui", "game", "interactive-story", "3d-experience",
                        "dashboard", "design-system", "prototype", "world", "video");
    }

    @Test
    void theVisibilitiesAreTheOnesTheSchemaHolds() {
        assertThat(ProjectVocabulary.VISIBILITIES).hasSize(3)
                .containsExactlyInAnyOrder("private", "unlisted", "public");
    }

    @Test
    void aKnownKindIsKept() {
        assertThat(ProjectVocabulary.requireKind("website")).isEqualTo("website");
        assertThat(ProjectVocabulary.requireKind("interactive-story")).isEqualTo("interactive-story");
    }

    @Test
    void anAbsentKindGetsTheDefault() {
        assertThat(ProjectVocabulary.requireKind(null)).isEqualTo(ProjectVocabulary.DEFAULT_KIND);
        assertThat(ProjectVocabulary.requireKind("  ")).isEqualTo(ProjectVocabulary.DEFAULT_KIND);
    }

    @Test
    void aWordThatIsNotAKindIsRefusedAndTheMessageNamesTheOnesThatAre() {
        assertThatThrownBy(() -> ProjectVocabulary.requireKind("Website"))
                .as("the column is an enum, so the case is the word")
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Website")
                .hasMessageContaining("website");
    }

    @Test
    void aKnownVisibilityIsKeptAndAnAbsentOneGetsTheDefault() {
        assertThat(ProjectVocabulary.requireVisibility("public")).isEqualTo("public");
        assertThat(ProjectVocabulary.requireVisibility(null)).isEqualTo(ProjectVocabulary.DEFAULT_VISIBILITY);
    }

    @Test
    void aWordThatIsNotAVisibilityIsRefused() {
        assertThatThrownBy(() -> ProjectVocabulary.requireVisibility("secret"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("secret")
                .hasMessageContaining("public");
    }
}
