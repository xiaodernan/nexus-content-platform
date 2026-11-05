package dev.nexus.api.tools;

import java.util.List;

/**
 * M10 v614 — the answer to "what changed between these two contracts": both ends' identity, and the SCHEMA
 * paths that differ, in RFC 6901 JSON Pointer form.
 *
 * <p>It names WHERE the bytes differ, never the values themselves. The two pins are the way back to the
 * values ({@code GET /tools/{id}/at?pin=}), so an answer that is read together with the pins does not repeat
 * up to 8192 bytes of schema per side.
 *
 * <p>A path appears in exactly one of the three lists: {@code added} exists only on the newer side,
 * {@code removed} only on the older one, {@code changed} on both with a different value. Array elements are
 * compared by INDEX, which is what a JSON array is; an insertion near the front therefore reads as a change
 * at every later index rather than as a move. That is stated rather than guessed.
 *
 * <p>{@code identical} is decided by the PINS, not by walking: a pin hashes the summary and the canonical
 * schema together, so two equal pins are two equal contracts and there is nothing to walk.
 */
record ContractComparison(
        String toolId,
        Side from,
        Side to,
        boolean identical,
        boolean summaryChanged,
        SchemaDiff schema) {

    /** One end of the comparison: which revision, the sentence it carried, and the pin it hashes to. */
    record Side(int revision, String summary, String contractSha256, long recordedAt) {
    }

    /** The three ways a schema path can differ. */
    record SchemaDiff(List<String> added, List<String> removed, List<String> changed) {

        static SchemaDiff none() {
            return new SchemaDiff(List.of(), List.of(), List.of());
        }
    }
}