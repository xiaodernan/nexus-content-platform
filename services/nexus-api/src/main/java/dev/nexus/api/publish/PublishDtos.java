package dev.nexus.api.publish;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;

/**
 * What this slice answers.
 *
 * <p>Two shapes, and the difference is deliberate:
 *
 * <ul>
 *   <li>{@link Receipt} is the answer to a PUBLISH. It does not echo the document back — the caller just
 *       sent it, and a receipt that repeats a large payload is noise that grows with the document. It names
 *       what was recorded: the id, the title, the version, when, and the URL that now serves it.
 *   <li>{@link Publication} is the answer to a READ, and it DOES carry the document — that is what reading
 *       a publication back is for.
 * </ul>
 */
public final class PublishDtos {

    private PublishDtos() {
    }

    /**
     * The body of a publish request.
     *
     * <p>{@code document} is a {@link JsonNode}, not a {@code String}, because the contract is "the design
     * document as a JSON OBJECT" — a caller sends {@code {"title":"…","document":{"pages":[…]}}}. Declaring
     * it as a String made Jackson reject every well-formed publish with a 400 ("cannot deserialize an
     * object into a String"), which is what the proof caught on its first real run. The controller turns it
     * back into text for the service, which keeps the service's own contract (a JSON object AS TEXT) and
     * its four rules unchanged.
     */
    public record PublishRequest(String title, JsonNode document) {
    }

    /** What a publish recorded. */
    public record Receipt(
            String projectId,
            String title,
            int version,
            Instant publishedAt,
            String url) {
    }

    /** A publication read back, document included. */
    public record Publication(
            String projectId,
            String title,
            int version,
            Instant publishedAt,
            String url,
            @JsonProperty("document") Object document) {
    }

    /**
     * One row of a listing: the RECEIPT's facts and no document.
     *
     * <p>A listing that carried documents would answer "what is published" with the whole corpus — the
     * caller asking that question wants to know what exists, and a document is one GET away for the ones it
     * cares about. It is also what keeps the cap meaningful: 100 publications is a small answer, 100
     * documents is not.
     */
    public record ListingEntry(
            String projectId,
            String title,
            int version,
            Instant publishedAt,
            String url) {
    }

    /**
     * A listing. `count` is how many this answer CARRIES and `limit` is the cap that was applied — reported
     * together so a caller can tell "there are twenty" from "there are at least twenty", which a bare array
     * cannot say.
     */
    public record Listing(List<ListingEntry> publications, int count, int limit) {
    }

    /** What an unpublish did. `removed: false` means there was nothing to take down — not an error. */
    public record Removal(String projectId, boolean removed) {
    }
}
