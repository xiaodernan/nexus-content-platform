package com.nexus.domain.project;

import java.util.Set;

/**
 * The vocabulary of a project row, read from the schema that owns it.
 *
 * <p>These two lists are not this service's invention. {@code projects.kind} and
 * {@code projects.visibility} are PostgreSQL enums created by drizzle, the schema's owner — see
 * {@code apps/web/src/server/db/schema.ts} (lines 73-86). Measured against the running database on
 * 2026-11-09, the stored labels are exactly:
 *
 * <pre>
 * project_kind: website, webapp, mobile-ui, game, interactive-story, 3d-experience,
 *               dashboard, design-system, prototype, world, video
 * visibility  : private, unlisted, public
 * </pre>
 *
 * <p>So why list them here at all? Because a column of enum type is not a free-text column, and a
 * service that writes one without checking will let the DATABASE decide what a bad value is. Measured:
 * an unknown kind fails as a PostgreSQL error, which this service would report as a 500 — telling the
 * caller that the SERVER is broken, when the truth is that the CALLER sent a word that is not a kind.
 *
 * <p>Checking here turns that into a 400 that names the accepted words. The database still owns the
 * values; this class only makes the refusal happen on the right side of the boundary.
 */
public final class ProjectVocabulary {

    /** The kinds the {@code project_kind} enum holds. */
    public static final Set<String> KINDS = Set.of(
            "website",
            "webapp",
            "mobile-ui",
            "game",
            "interactive-story",
            "3d-experience",
            "dashboard",
            "design-system",
            "prototype",
            "world",
            "video");

    /** The visibilities the {@code visibility} enum holds. */
    public static final Set<String> VISIBILITIES = Set.of(
            "private",
            "unlisted",
            "public");

    /** The kind a project gets when nobody names one. */
    public static final String DEFAULT_KIND = "website";

    /** The visibility a project gets when nobody names one. */
    public static final String DEFAULT_VISIBILITY = "private";

    private ProjectVocabulary() {
    }

    /**
     * Check a kind against the schema's vocabulary.
     *
     * @param raw the word the caller sent.
     * @return the word, when it is a kind.
     * @throws IllegalArgumentException when it is not — and the message names the accepted words.
     */
    public static String requireKind(String raw) {
        if (raw == null || raw.isBlank()) {
            return DEFAULT_KIND;
        }
        String value = raw.trim();
        if (!KINDS.contains(value)) {
            throw new IllegalArgumentException(
                    "'" + raw + "' is not a project kind; the kinds are " + String.join(", ", KINDS));
        }
        return value;
    }

    /**
     * Check a visibility against the schema's vocabulary.
     *
     * @param raw the word the caller sent.
     * @return the word, when it is a visibility.
     * @throws IllegalArgumentException when it is not — and the message names the accepted words.
     */
    public static String requireVisibility(String raw) {
        if (raw == null || raw.isBlank()) {
            return DEFAULT_VISIBILITY;
        }
        String value = raw.trim();
        if (!VISIBILITIES.contains(value)) {
            throw new IllegalArgumentException(
                    "'" + raw + "' is not a visibility; the visibilities are " + String.join(", ", VISIBILITIES));
        }
        return value;
    }
}
