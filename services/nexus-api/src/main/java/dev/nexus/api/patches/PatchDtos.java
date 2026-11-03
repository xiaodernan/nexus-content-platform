package dev.nexus.api.patches;

import java.util.List;

/**
 * M9 v595 — the wire shapes for patches.
 *
 * <p>One record is used by every answer that carries a patch, including every row of a listing. The diff
 * travels in the record: a proposal without its bytes is a title, and a caller that must fetch each patch
 * separately would read the same row twice. The listing's cap bounds the payload; a caller that wants
 * headings only should not ask for a hundred maximal patches at once, and the record does not hide that.
 *
 * <p>Times are epoch milliseconds at the wire, the client's own unit, like every other instant here.
 */
public final class PatchDtos {

    private PatchDtos() {
    }

    /** The body a caller sends to propose a patch. The title and the bytes are required. */
    public record OpenPatch(String title, String summary, String diff, String author) {
    }

    /** One patch as every answer carries it: eight fields, the diff among them. */
    public record PatchRecord(
            String id,
            String incidentId,
            String title,
            String summary,
            String diff,
            String author,
            String status,
            long createdAt) {
    }

    /**
     * The window a listing answers with, and the two counts beside it.
     *
     * <p>{@code count} is what this answer carried; {@code total} is what the incident's whole set holds.
     * Both travel because the window alone cannot say whether the incident has more proposals than it was
     * shown, and the narrowed count is computed by the same {@code incidentId} as the window.
     */
    public record PatchList(
            List<PatchRecord> patches,
            int count,
            long total,
            int limit,
            int offset) {
    }
}
