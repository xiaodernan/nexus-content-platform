package dev.nexus.api.publish;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
     * document as a JSON OBJECT" — a caller sends {@code {"title":"...","document":{"pages":[...]}}}. Declaring
     * it as a String made Jackson reject every well-formed publish with a 400 ("cannot deserialize an
     * object into a String"), which is what the proof caught on its first real run. The controller turns it
     * back into text for the service, which keeps the service's own contract (a JSON object AS TEXT) and
     * its four rules unchanged.
     */
    public record PublishRequest(String title, JsonNode document, OwnerClaim owner) {
    }

    /** What a publish recorded. */
    public record Receipt(
            String projectId,
            String title,
            int version,
            Instant publishedAt,
            String url,
            /**
             * v242: who this publication CLAIMS to belong to, or {@code null} when the publisher named
             * nobody. Reported on the receipt rather than only on the row so a Studio can show the author
             * of the thing it just published without a second GET — and reported at all so the assurance
             * travels with the name instead of being implied by its presence.
             */
            OwnerClaim owner) {
    }

    /** A publication read back, document included. */
    public record Publication(
            String projectId,
            String title,
            int version,
            Instant publishedAt,
            String url,
            @JsonProperty("document") Object document,
            /** v242: the claim on the row, or null. A reader gets the author and what the author is worth. */
            OwnerClaim owner) {
    }

    /**
     * A listing. `count` is how many this answer CARRIES and `limit` is the cap that was applied — reported
     * together so a caller can tell "there are twenty" from "there are at least twenty", which a bare array
     * cannot say.
     */
    public record Listing(List<ListingEntry> publications, int count, int limit) {
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
            String url,
            /** v242: the claim on the row, or null. A listing can name authors without a GET per row. */
            OwnerClaim owner) {
    }

    /**
     * What an unpublish did. {@code removed: false} means there was nothing to take down — not an error.
     */
    public record Removal(String projectId, boolean removed) {
    }

    /**
     * v243 — the request to remix a publication.
     *
     * <p>The remix forks a publication into a new project. The caller provides the target project id
     * (the source publication) and an optional new project id; if omitted, a fresh one is generated.
     * The remix records its lineage by storing the source project id.
     */
    public record RemixRequest(String sourceProjectId, String newProjectId) {
    }

    /**
     * What a remix answers.
     */
    public record RemixReceipt(
            String projectId,
            String title,
            int version,
            Instant publishedAt,
            String url,
            /** v243: the source project this remix was forked from, or null if lineage was not recorded. */
            String sourceProjectId) {
    }

    /**
     * v242 — who a publication CLAIMS to belong to (ADR 0018).
     *
     * <p>{@code assurance} is the field a consumer must read rather than guess at: this service records a
     * claim and does NOT verify it, so a receipt carrying {@code "unsigned-local"} is naming an unverified
     * author. ADR 0018 is where the reasoning lives — short version: a claim that says it is a claim is
     * true, and a claim that looks like an identity is false the moment nothing checked it.
     *
     * <p>The shape is deliberately the one the Studio's own {@code ownerClaim} produces, so a service-side
     * check is the only thing that can ever widen {@code assurance}: the client puts this on the wire, and
     * the value it puts there is the only one it has.
     */
    public record OwnerClaim(String accountId, String handle, String assurance, Instant claimedAt) {
    }
}