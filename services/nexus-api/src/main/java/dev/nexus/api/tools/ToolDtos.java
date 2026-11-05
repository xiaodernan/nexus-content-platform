package dev.nexus.api.tools;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

/**
 * M10 v571 — the wire shapes for the tool registry.
 *
 * <p>The schema travels as a JSON OBJECT, not as a string that contains JSON. A string field would make every
 * client double-encode its schema and would let a caller send {@code "{}"} where an object was meant; an
 * object field can be validated by shape before it is stored, which is what {@link ToolService} does.
 */
public final class ToolDtos {

    private ToolDtos() {
    }

    /** The body a caller sends to declare a tool. The service refuses every field by name. */
    public record RegisterRequest(String owner, String name, String summary, JsonNode inputSchema) {
    }

    /**
     * The body a caller sends to REPLACE a declaration's summary and schema.
     *
     * <p>There is no {@code name}, {@code owner} or {@code id} here: the name is the registry's global lookup
     * key and the owner and id identify the row, so an update changes only what a declaration SAYS, never
     * which declaration it is.
     */
    public record UpdateRequest(String summary, JsonNode inputSchema) {
    }

    /**
     * One tool as every read door answers it.
     *
     * <p>There is no {@code url}, {@code command}, {@code invocationCount} or {@code lastCalledAt} field: this
     * build declares tools and does not run them, and an answer that carried such a field would describe a
     * capability nobody implemented.
     *
     * <p>{@code contractSha256} is the PIN: 64 lowercase hex characters over the summary and the schema, the
     * two fields an update can change. It travels on every answer that carries a whole declaration — including
     * the catalog, so equal contracts under different names are visible in one page — and it is the same value
     * the read doors compare against {@code If-None-Match}. See {@link ContractFingerprint}.
     */
    public record Tool(
            String id,
            String owner,
            String name,
            String summary,
            JsonNode inputSchema,
            String contractSha256,
            long createdAt) {
    }

    /**
     * The catalog window, and the WHOLE (narrowed) count beside it.
     *
     * <p>{@code owner}, {@code query}, {@code deprecated} and {@code tested} are the filters the answer applied —
     * each null when that filter was absent. They are echoed so a caller reading twenty rows can tell which
     * catalog those twenty came from, and so a window never has to be mistaken for the whole.
     *
     * <p>{@code tested} echoes the CLAIM filter (v589): true means every row carries an attestation, not that
     * every claim is still about the contract being served. That verdict is {@code stillCurrent}, on the
     * attestation resource, and it is recomputed per read.
     *
     * <p>{@code after} echoes the keyset cursor (v613): the last NAME of the previous page, or null when this
     * window starts at the beginning. It is a POSITION in the filtered set rather than a filter on it, which is
     * why {@code total} is the size of the whole filtered set on every page - and why a page shorter than
     * {@code limit} is how a caller learns it has reached the end.
     */
    public record ToolList(
            String owner,
            String query,
            Boolean deprecated,
            Boolean tested,
            String after,
            List<Tool> tools,
            long total,
            int limit,
            int offset) {
    }
    /**
     * v587 - the answer to a BATCH read: several declarations named by id in ONE request, in the order the caller
     * named them.
     *
     * <p>{@code requested} counts the DISTINCT ids the answer looked for (blanks dropped, duplicates collapsed), so
     * {@code found + missing.size() == requested} is a property a caller can check. {@code missing} names the ids
     * that hold nothing, in the order they were asked for: a batch read of a list is not a read of one row, so an
     * id that names nothing is not a 404 - it is one absent row among the ones that were found, and saying WHICH
     * is the whole point of the list being beside the count.
     */
    public record ToolBatch(
            int requested,
            int found,
            List<Tool> tools,
            List<String> missing) {
    }

    /**
     * One recorded revision of a declaration: what it SAID, and when this service recorded that writing.
     *
     * <p>{@code revision} is scoped to the tool: 1 is the declaration as registered (or the first state this
     * build recorded for a row that predates the history table), and every accepted update appends one more.
     *
     * <p>{@code contractSha256} is that revision's own pin, recomputed from its own stored bytes, so a consumer
     * holding a pin can find the write that produced it without shipping or diffing whole schemas.
     */
    public record ToolRevisionView(
            int revision, String summary, JsonNode inputSchema, String contractSha256, long recordedAt) {
    }

    /**
     * One declaration's history window, newest revision first, and the WHOLE count beside it.
     *
     * <p>{@code toolId} is echoed so a reader of a window can tell which contract's history it is looking at,
     * and {@code since} is echoed for the same reason as the catalog's {@code owner}: an answer must say which
     * slice of the history it is a slice of — null when the answer is the whole history.
     */
    public record ToolRevisionList(
            String toolId,
            Integer since,
            List<ToolRevisionView> revisions,
            long total,
            int limit,
            int offset) {
    }

    /**
     * M10 v590 - the declaration AS IT WAS at one pin: one recorded revision, chosen by the 64-hex pin the
     * caller holds rather than by a revision number it never chose.
     *
     * <p>{@code current} is recomputed on every read: true when this pin is ALSO the contract being served
     * now. It is the one fact a consumer needs after fetching old bytes - "is this what I would install today,
     * or is there a newer one?" - and it is derived rather than stored, like the attestation's
     * {@code stillCurrent}, because a stored flag would drift from the row it describes.
     */
    public record RevisionAtPin(
            String toolId,
            int revision,
            String summary,
            JsonNode inputSchema,
            String contractSha256,
            long recordedAt,
            boolean current) {
    }
    /**
     * One entry in the registry's journal: what happened, to which declaration, in what order.
     *
     * <p>{@code seq} is the cursor a caller advances. {@code name} is the declaration's name AT the time of the
     * write, which is why a {@code removed} entry can still name the tool it describes. {@code revision} is present
     * only for changes that wrote a contract ({@code declared}, {@code updated}) and points at the revision a
     * caller can then read — the journal says WHERE to look, not what it said.
     */
    public record ToolChangeView(
            long seq, String toolId, String name, String kind, Integer revision, long at) {
    }

    /**
     * One page of the journal, OLDEST first, with the whole count of entries the same filters match.
     *
     * <p>{@code since} is echoed because it is the cursor the answer starts after: 0 means "from the beginning",
     * which is a real cursor rather than an absent filter, so it is never null. {@code kind} and {@code toolId}
     * are echoed the same way the catalog echoes its filters: the normalized word or id, and null for the absent
     * filter - so "the whole feed" and "the feed narrowed to nothing that matched" can be told apart by looking at
     * what the answer says it applied.
     */
    public record ToolChangeList(
            long since,
            String kind,
            String toolId,
            List<ToolChangeView> changes,
            long total,
            int limit,
            int offset) {
    }

    /**
     * v588 - the body of an attestation: the CONTRACT PIN the caller tested, and an optional sentence about how.
     *
     * <p>The pin is required and explicit rather than implied by "latest": a caller that has not read the contract
     * has nothing to attest, and the service refuses a pin that is not the one being served (409) instead of
     * quietly recording a claim about bytes nobody tested.
     */
    public record AttestRequest(String contractSha256, String note) {
    }

    /**
     * v588 - one declaration's attestation.
     *
     * <p>{@code stillCurrent} is DERIVED, never stored: it compares the pinned contract with the one being served
     * now. An update does not delete the claim (it is still true about the contract it names) and does not move
     * it (that would be a claim about bytes nobody tested) - it makes {@code stillCurrent} false, which is the
     * whole reason a pin travels beside the claim.
     */
    public record Attestation(
            String toolId,
            String contractSha256,
            String note,
            long attestedAt,
            boolean stillCurrent) {
    }

    /** v588 - what a withdrawal did: {@code false} when there was no claim to withdraw. */
    public record WithdrawAttestationAnswer(String toolId, boolean removed) {
    }
    /**
     * What a retention prune did: the boundary it applied, how many rows it removed, and what the history still
     * holds.
     *
     * <p>The same three numbers the receipt prune answers with. {@code remaining} is the WHOLE count after the
     * delete, so an owner can see the cost of the bound it named in the same breath as the bound itself.
     */
    public record PruneRevisionsAnswer(String toolId, int before, int pruned, long remaining) {
    }

    /** The body that deprecates a declaration. Both fields are the owner's words, never an id. */
    public record DeprecateRequest(String message, String replacement) {
    }

    /**
     * One deprecation: why this tool is going away, and the name of what replaces it (or null).
     *
     * <p>{@code replacement} is a HINT: it must be a legal tool name but it need not hold a row.
     */
    public record Deprecation(String toolId, String message, String replacement, long deprecatedAt) {
    }

    /** One row of the public list of deprecated tools: the declaration's name beside its deprecation. */
    public record DeprecatedTool(
            String toolId, String name, String message, String replacement, long deprecatedAt) {
    }

    /** The deprecation window, newest first, and the WHOLE number of deprecated declarations beside it. */
    public record DeprecationList(
            List<DeprecatedTool> deprecations, long total, int limit, int offset) {
    }

    /**
     * The body that hands a declaration over: the account that will hold it.
     *
     * <p>One field, and no name/owner/id: the row is named in the path and the CURRENT holder is the required
     * {@code owner} query parameter, so a body cannot quietly supply either.
     */
    public record TransferRequest(String to) {
    }

    /**
     * One recorded handover: who held the declaration, who holds it, and when this service recorded the change.
     *
     * <p>{@code transfer} is scoped to the tool exactly as a revision is: 1 is the first time that declaration
     * changed hands.
     */
    public record OwnershipTransfer(int transfer, String from, String to, long transferredAt) {
    }

    /**
     * One declaration's chain of holders, newest first, with the CURRENT holder named beside the window.
     *
     * <p>{@code owner} is the declaration's holder now — the same account the transfer door would check against
     * — so a reader of a window does not have to walk the chain to learn who holds the tool today.
     */
    public record OwnershipChain(
            String toolId, String owner, List<OwnershipTransfer> transfers, long total, int limit, int offset) {
    }
}
