package dev.nexus.api.tools;

import java.time.Instant;

/**
 * M10 v617 — where a deprecation page ended: the (deprecatedAt, toolId) PAIR the list is ordered by.
 *
 * <p>The list is newest first at the WIRE's millisecond precision, and an instant is not unique: two owners can
 * deprecate in the same millisecond, and an offset over a tie is a position the database is free to renumber. A
 * cursor that names the LAST ROW's whole sort key — the millisecond the caller saw, then the id — is a position
 * in the order itself, so the next page is the rows strictly after it even when instants tie.
 *
 * <p>The wire form is {@code <epochMillis>:<toolId>}. Millis are non-negative digits (the value the row exposes),
 * the id is an opaque string length-bounded like the column, and anything else is a 400 naming the shape: a
 * cursor no row can equal is not a smaller page, it is a different question.
 */
record DeprecationCursor(Instant at, String toolId) {

    private static final int MAX_TOOL_ID_LENGTH = 64;

    static DeprecationCursor parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String text = raw.trim();
        int split = text.indexOf(':');
        if (split <= 0 || split == text.length() - 1) {
            throw shape(text);
        }
        String millis = text.substring(0, split);
        String toolId = text.substring(split + 1).trim();
        if (millis.isEmpty() || toolId.isEmpty() || toolId.length() > MAX_TOOL_ID_LENGTH
                || !millis.chars().allMatch(Character::isDigit)) {
            throw shape(text);
        }
        long value;
        try {
            value = Long.parseLong(millis);
        } catch (NumberFormatException overflow) {
            throw shape(text);
        }
        return new DeprecationCursor(Instant.ofEpochMilli(value), toolId);
    }

    String text() {
        return at.toEpochMilli() + ":" + toolId;
    }

    private static InvalidTool shape(String text) {
        return new InvalidTool("before names where the previous page ended as <epochMillis>:<toolId> — \""
                + text + "\" is not that shape");
    }
}
