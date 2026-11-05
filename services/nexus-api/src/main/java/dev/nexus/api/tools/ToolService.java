package dev.nexus.api.tools;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * M10 v571 — the tool registry: what exists, what it accepts, and who declared it.
 *
 * <p>M10 names "API, MCP, tool registry, webhooks". The webhook half is an instruction this service EXECUTES;
 * this half is the opposite. A registration is a DECLARATION: it names a tool, describes what the tool accepts
 * and records who said so. Nothing here executes the tool, calls a URL on its behalf, or remembers that it
 * ran — and the row shape says so by having nowhere to put an endpoint, a command or a counter. That bound is
 * the point of the slice: the registry is a catalog an external agent can READ, not a capability this service
 * exercises on a stranger's word.
 *
 * <p>Four rules, each refused BY NAME:
 *
 * <ul>
 *   <li>The NAME is globally unique and a lowercase slug: 2–64 characters, letters, digits, {@code .}, {@code _}
 *       or {@code -}, starting with a letter or digit. A per-owner namespace would let two accounts announce
 *       two different tools under one name; a name with uppercase or spaces would be two spellings of one
 *       tool. A duplicate is a 409 that NAMES the row that holds the name.
 *   <li>The SUMMARY is required and 1–280 characters. A catalog entry that is only a name is a name nobody can
 *       choose between.
 *   <li>The INPUT SCHEMA is a JSON OBJECT (not a string, not an array, not null) of at most 8192 canonical
 *       bytes, stored in compact canonical form so equal schemas are byte-identical rows. The schema is stored,
 *       not enforced: no call in this build is validated against it.
 *   <li>The OWNER is required, trimmed, and at most 200 characters — host-declared, like every other account
 *       id in this build (ADR 0018).
 * </ul>
 */
@Service
public class ToolService {

    /** The shortest a tool name may be — a one-character name is a key, not a name. */
    public static final int MIN_NAME_LENGTH = 2;

    /** The longest a tool name may be — the column's width, refused by number rather than truncated. */
    public static final int MAX_NAME_LENGTH = 64;

    /** The summary's bound: one sentence, long enough to say what the tool is for. */
    public static final int MAX_SUMMARY_LENGTH = 280;

    /** The schema's bound, measured on the CANONICAL bytes this service stores. */
    public static final int MAX_SCHEMA_BYTES = 8192;

    /** The owner column's width. */
    public static final int MAX_OWNER_LENGTH = 200;

    /** The default number of tools a listing answers with. */
    public static final int DEFAULT_LIST_LIMIT = 20;

    /** The most a caller may ask for. */
    public static final int MAX_LIST_LIMIT = 100;

    /** The longest catalog search term — long enough for a sentence fragment, short enough to bound work. */
    public static final int MAX_QUERY_LENGTH = 100;
    /** The most declarations ONE batch read may name - a list, not a scan of the registry. */
    public static final int MAX_BATCH_IDS = 50;
    /** How many characters an attestation's note may hold - the same sentence bound a deprecation carries. */
    public static final int MAX_NOTE_LENGTH = 280;

    /** What a contract pin looks like: 64 lowercase hex characters, the shape {@link ContractFingerprint} mints. */
    private static final Pattern PIN_SHAPE = Pattern.compile("[0-9a-f]{64}");
    /**
     * The eight things that can happen to a declaration, in an order that reads as a life: a birth, a new
     * contract, a handover, a warning and its withdrawal, a claim that a contract was tested and its withdrawal,
     * and the end. The list is the PROTOCOL, so the words are exact and case-sensitive: {@code Removed} is a typo,
     * not a synonym, and a feed that answered it with an empty page would hide the typo.
     */
    public static final List<String> CHANGE_KINDS =
            List.of("declared", "updated", "transferred", "deprecated", "undeprecated", "attested", "unattested", "removed");

    /**
     * The name's shape. The first character is alphanumeric, so a name cannot begin with a dot or dash and
     * collide with a relative path if a consumer ever maps names onto files.
     */
    private static final Pattern NAME_SHAPE = Pattern.compile("[a-z0-9][a-z0-9._-]*");

    private final ToolRepository repository;
    private final ToolRevisionRepository revisions;
    private final ToolDeprecationRepository deprecations;
    private final ToolOwnershipRepository ownership;
    private final ToolChangeRepository changes;
    private final ToolAttestationRepository attestations;
    private final Clock clock;
    private final ObjectMapper mapper;

    public ToolService(
            ToolRepository repository,
            ToolRevisionRepository revisions,
            ToolDeprecationRepository deprecations,
            ToolOwnershipRepository ownership,
            ToolChangeRepository changes,
            ToolAttestationRepository attestations,
            Clock clock,
            ObjectMapper mapper) {
        this.repository = repository;
        this.revisions = revisions;
        this.deprecations = deprecations;
        this.ownership = ownership;
        this.changes = changes;
        this.attestations = attestations;
        this.clock = clock;
        this.mapper = mapper;
    }

    /**
     * Declare a tool.
     *
     * @param ownerId the declaring account, host-declared and opaque
     * @param name the global name, validated by {@link #requireName}
     * @param summary one sentence, validated by {@link #requireSummary}
     * @param inputSchema the JSON object the tool accepts, canonicalized and bounded
     * @return the stored row
     */
    @Transactional
    public ToolEntry register(String ownerId, String name, String summary, JsonNode inputSchema) {
        String owner = requireOwner(ownerId);
        String toolName = requireName(name);
        String description = requireSummary(summary);
        String schema = requireSchema(inputSchema);
        repository.findByName(toolName).ifPresent(existing -> {
            throw new ToolNameTaken("the tool name \"" + toolName + "\" is already held by tool "
                    + existing.getToolId() + " — names are global, and a name can be reused only after its row is removed");
        });
        ToolEntry row = new ToolEntry(
                UUID.randomUUID().toString(),
                owner,
                toolName,
                description,
                schema,
                clock.instant().truncatedTo(ChronoUnit.MICROS));
        ToolEntry saved = repository.save(row);
        record(saved, 1, saved.getCreatedAt());
        recordChange(saved, "declared", 1, saved.getCreatedAt());
        return saved;
    }

    /**
     * The catalog, name ascending: the whole registry when no owner is named, or one account's declarations
     * when one is. The blank owner is the absent filter — a listing is a READ, and there is no ownership to
     * enforce on it.
     */
    /** The catalog without a search term — the shape callers had before v576. */
    @Transactional(readOnly = true)
    public List<ToolEntry> catalog(String ownerId, int limit, int offset) {
        return catalog(ownerId, null, limit, offset);
    }

    /**
     * The catalog, optionally narrowed by an owner and by a search term. A search is a case-insensitive
     * substring of the NAME or the SUMMARY; its wildcards are literal (v576), and the count is narrowed by
     * the SAME two filters, so a window can still say what it is hiding.
     */
    @Transactional(readOnly = true)
    public List<ToolEntry> catalog(String ownerId, String query, int limit, int offset) {
        return catalog(ownerId, query, null, limit, offset);
    }

    /**
     * M10 v582 — the catalog narrowed by an owner, a search term and a DEPRECATED flag, each optional.
     *
     * <p>Deprecation is its own resource (ADR 0025), so today an agent that wants to know which rows are going
     * away must fetch the catalog and the deprecation list and subtract them client-side — a second request and
     * a join nobody should have to write. {@code deprecated=true} answers only the declarations that carry a
     * deprecation, {@code false} only those that do not, and absent leaves both in. It composes with the owner
     * and the search, and narrows the COUNT the same way, the rule every filter here follows.
     *
     * @param deprecated true for deprecated only, false for live only, null for both
     */
    @Transactional(readOnly = true)
    public List<ToolEntry> catalog(
            String ownerId, String query, Boolean deprecated, int limit, int offset) {
        return catalog(ownerId, query, deprecated, null, limit, offset);
    }

    /**
     * M10 v589 — the catalog with a SECOND tri-state filter, {@code tested}, beside the deprecated one.
     *
     * <p>An attestation is its own resource (ADR 0037): one claim, one tool, naming the contract that was
     * claimed to be tested. Without this filter, "show me the tools somebody has tested" is the same client-side
     * join the deprecated flag removed in v582 — read the catalog, read every declaration's attestation, and
     * subtract. {@code tested=true} answers only declarations that carry a claim, {@code false} only those that
     * do not, and absent leaves both in. All three filters compose and narrow the WINDOW and the COUNT together.
     *
     * <p><b>The flag names the claim, not the verdict.</b> A claim survives an update that moves the contract it
     * named — that is the point of v588: it is about the contract it pinned, not about whatever is served
     * later — and this service cannot compare the two in SQL because the pin is computed from the row and never
     * stored (ADR 0028). A row answered by {@code tested=true} can therefore hold a STALE claim;
     * {@code GET /tools/{id}/attestation} is where {@code stillCurrent} is recomputed. The filter is a
     * narrowing, deliberately not a certificate.
     *
     * @param tested true for attested only, false for unattested only, null for both
     */
    @Transactional(readOnly = true)
    public List<ToolEntry> catalog(
            String ownerId, String query, Boolean deprecated, Boolean tested, int limit, int offset) {
        return catalog(ownerId, query, deprecated, tested, null, limit, offset);
    }

    /**
     * M10 v613 — the same catalog, addressable by a KEYSET cursor instead of an offset.
     *
     * <p>Offset paging is a position in a list that writes are allowed to change: register a name that sorts
     * before the page you just read and the next offset serves a row twice; remove one and it serves a row
     * never. The alternative is to remember the last NAME the caller saw and ask for what sorts after it —
     * {@code after} is that value, not a row id, so it does not need the row to still exist.
     *
     * <p>{@code after} and a non-zero {@code offset} are REFUSED together. Two cursors over one window is how a
     * page skips a row while looking correct, and the error names both parameters rather than picking one.
     * Order stays NAME ascending, which is the order the comparison uses.
     *
     * @param after the last name of the previous page, or null to start at the beginning
     * @throws InvalidTool when {@code after} is not a tool name, or is combined with a non-zero offset
     */
    @Transactional(readOnly = true)
    public List<ToolEntry> catalog(String ownerId, String query, Boolean deprecated, Boolean tested,
            String after, int limit, int offset) {
        int effective = Math.min(Math.max(limit, 1), MAX_LIST_LIMIT);
        int from = Math.max(offset, 0);
        String owner = normalizeOwner(ownerId);
        String search = normalizeQuery(query);
        String key = normalizeAfter(after);
        if (key != null && from > 0) {
            throw new InvalidTool("a keyset read carries after=, not offset= — mixing the two is how a page"
                    + " skips a row; use after=\"" + key + "\" with no offset");
        }
        PageRequest page = PageRequest.of(key == null ? from / effective : 0, effective);
        if (deprecated == null && tested == null && key == null) {
            if (search == null) {
                return owner == null
                        ? repository.findAllByOrderByNameAsc(page)
                        : repository.findByOwnerOrderByNameAsc(owner, page);
            }
            String plain = likePattern(search);
            return owner == null
                    ? repository.searchAll(plain, page)
                    : repository.searchByOwner(owner, plain, page);
        }
        String pattern = search == null ? null : likePattern(search);
        return repository.searchCatalog(owner, pattern,
                polarity(deprecated, true), polarity(deprecated, false),
                polarity(tested, true), polarity(tested, false), key, page);
    }

    /**
     * M10 v613 — the name a keyset page starts after: null when absent or blank, otherwise a tool NAME.
     *
     * <p>It is validated as a NAME rather than accepted as arbitrary text because the comparison happens in the
     * database's collation: an uppercase or spaced string would still order consistently, but it would slice the
     * catalog at a point no name can occupy, and a caller that mistyped the last name would page into a window
     * whose edges it cannot see. A 400 names the rule instead of answering a slice nobody asked for.
     */
    static String normalizeAfter(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String trimmed = raw.trim();
        if (trimmed.length() < MIN_NAME_LENGTH || trimmed.length() > MAX_NAME_LENGTH
                || !NAME_SHAPE.matcher(trimmed).matches()) {
            throw new InvalidTool("after names the last tool name of the previous page — \"" + trimmed
                    + "\" is not a tool name");
        }
        return trimmed;
    }

    /**
     * The 0/1 pair a tri-state filter becomes: 1 on the side the caller asked for, 0 on the other.
     *
     * <p>Null (absent) is 0 on BOTH sides, which is "no constraint" rather than "require neither" — the
     * difference matters, because the latter would answer nothing.
     */
    private static int polarity(Boolean flag, boolean wanted) {
        return Boolean.valueOf(wanted).equals(flag) ? 1 : 0;
    }

    /** The WHOLE number of rows the window is a window of — narrowed the same way the window is. */
    @Transactional(readOnly = true)
    public long countOf(String ownerId) {
        return countOf(ownerId, null);
    }

    /** The whole number of rows the (owner, query) window is a window of. */
    @Transactional(readOnly = true)
    public long countOf(String ownerId, String query) {
        return countOf(ownerId, query, null);
    }

    /** The whole number of rows the (owner, query, deprecated) window is a window of. */
    @Transactional(readOnly = true)
    public long countOf(String ownerId, String query, Boolean deprecated) {
        return countOf(ownerId, query, deprecated, null);
    }

    /**
     * The whole number of rows the (owner, query, deprecated, tested) window is a window of — narrowed by the
     * SAME four filters, so a window of tested tools never claims to be the registry.
     */
    @Transactional(readOnly = true)
    public long countOf(String ownerId, String query, Boolean deprecated, Boolean tested) {
        String owner = normalizeOwner(ownerId);
        String search = normalizeQuery(query);
        if (deprecated == null && tested == null) {
            if (search == null) {
                return owner == null ? repository.count() : repository.countByOwner(owner);
            }
            String plain = likePattern(search);
            return owner == null
                    ? repository.countSearchAll(plain)
                    : repository.countSearchByOwner(owner, plain);
        }
        String pattern = search == null ? null : likePattern(search);
        return repository.countCatalog(owner, pattern,
                polarity(deprecated, true), polarity(deprecated, false),
                polarity(tested, true), polarity(tested, false));
    }

    /**
     * Remove a declaration. {@code false} when the id names nothing — "already gone" is not an error, the
     * same rule the webhook removal door follows.
     *
     * @throws NotYourTool when the row belongs to another account — 403, not 404, because the caller named a
     *     real id and the reason it could not be removed is ownership
     */
    @Transactional
    public boolean remove(String toolId, String ownerId) {
        String owner = requireOwner(ownerId);
        return repository.findById(toolId)
                .map(row -> {
                    if (!row.getOwner().equals(owner)) {
                        throw new NotYourTool("tool \"" + toolId + "\" belongs to another account");
                    }
                    // The journal entry is written BEFORE the rows go: it is the only thing that can still say a
                    // declaration was removed, because a deletion takes every row a reader could have asked.
                    recordChange(row, "removed", null, clock.instant().truncatedTo(ChronoUnit.MICROS));
                    revisions.deleteByToolId(toolId);
                    deprecations.deleteByToolId(toolId);
                    attestations.deleteByToolId(toolId);
                    ownership.deleteByToolId(toolId);
                    repository.delete(row);
                    return true;
                })
                .orElse(false);
    }

    /**
     * HAND THE DECLARATION OVER: the current owner names the account that holds it from now on.
     *
     * <p>Until this door existed a declaration could not change hands at all, and the registry's only answer
     * was "declare it again under the new owner" — which mints a new id, starts the history at revision 1 and
     * invalidates every pin a consumer holds. A handover keeps all three: the row stays, its name stays, its
     * history stays, and its contract pin does NOT change, because handing a tool over does not change one word
     * of what it says.
     *
     * <p>What it records is the thing a silent column flip would lose: an append-only {@link ToolOwnership}
     * row, so the registry can still answer who held the declaration before. It is deliberately NOT a revision:
     * a revision number means "the contract changed", and a handover leaves the contract exactly as it was.
     *
     * <p>The order is the one every owner-gated write uses — the id is resolved, the caller is checked against
     * the row's CURRENT holder, and only then is the target validated, so a stranger learns nothing about which
     * accounts would be accepted.
     *
     * <p>This is not an authorization boundary and does not pretend to be one: in this build an account id is
     * host-declared and unauthenticated (ADR 0018), so a handover records intent between the two accounts named.
     * It is a provenance boundary — the trail keeps both holders.
     *
     * @param toolId the declaration's id
     * @param ownerId the account that holds it NOW
     * @param toOwnerId the account that will hold it
     * @return the same declaration, with its new owner
     * @throws InvalidTool when the current owner is missing or the target breaks its rule
     * @throws UnknownTool when the id names no row
     * @throws NotYourTool when the row belongs to another account
     */
    @Transactional
    public ToolEntry transfer(String toolId, String ownerId, String toOwnerId) {
        String from = requireOwner(ownerId);
        ToolEntry row = repository.lockById(toolId)
                .orElseThrow(() -> new UnknownTool("tool \"" + toolId + "\" names nothing in this registry"));
        if (!row.getOwner().equals(from)) {
            throw new NotYourTool("tool \"" + toolId + "\" belongs to another account");
        }
        String to = requireTransferTarget(toOwnerId, row);
        int next = ownership.findTopByToolIdOrderByTransferDesc(toolId)
                .map(newest -> newest.getTransfer() + 1)
                .orElse(1);
        java.time.Instant at = clock.instant().truncatedTo(ChronoUnit.MICROS);
        row.setOwner(to);
        ToolEntry saved = repository.save(row);
        ownership.save(new ToolOwnership(toolId, next, from, to, at));
        recordChange(saved, "transferred", null, at);
        return saved;
    }

    /**
     * One declaration's chain of holders, newest first. A public read like the declaration itself; an id that
     * names nothing is a 404 rather than an empty chain.
     *
     * @throws UnknownTool when the id names no current declaration
     */
    @Transactional(readOnly = true)
    public List<ToolOwnership> ownershipHistory(String toolId, int limit, int offset) {
        get(toolId);
        int effective = Math.min(Math.max(limit, 1), MAX_LIST_LIMIT);
        int from = Math.max(offset, 0);
        return ownership.findByToolIdOrderByTransferDesc(toolId, PageRequest.of(from / effective, effective));
    }

    /** The WHOLE number of recorded handovers of one declaration. */
    @Transactional(readOnly = true)
    public long ownershipCount(String toolId) {
        return ownership.countByToolId(toolId);
    }

    /**
     * The account a handover names: trimmed, bounded like every owner id, and refused when it already holds the
     * declaration. A transfer to the current holder is a mistake rather than a no-op, and writing a handover row
     * for it would put a holder change in the chain that never happened.
     */
    static String requireTransferTarget(String raw, ToolEntry row) {
        String to = normalizeOwner(raw);
        if (to == null) {
            throw new InvalidTool("a transfer needs the account that receives the tool — the body field \"to\" is empty");
        }
        if (to.length() > MAX_OWNER_LENGTH) {
            throw new InvalidTool("an owner id is at most " + MAX_OWNER_LENGTH
                    + " characters — this one is " + to.length());
        }
        if (to.equals(row.getOwner())) {
            throw new InvalidTool("a transfer must name a different account — " + to + " already holds tool " + row.getName());
        }
        return to;
    }

    /**
     * One declaration by its GLOBAL name - the key every agent shares.
     *
     * <p>ADR 0022 made the name globally unique because a caller holds names, not ids; until now the only
     * name-addressed read was a paged catalog, so a caller holding a name could miss the row it meant behind
     * a window. The name is validated by the SAME rule registration uses (a malformed name is a 400 that
     * names the rule, not a 404), trimmed, and then looked up; a well-formed name that names nothing is a 404.
     *
     * @throws InvalidTool when the path is not a legal tool name
     * @throws UnknownTool when the name holds no row
     */
    @Transactional(readOnly = true)
    public ToolEntry getByName(String rawName) {
        String name = requireName(rawName);
        return repository.findByName(name)
                .orElseThrow(() -> new UnknownTool("tool name \"" + name + "\" names nothing in this registry"));
    }

    /**
     * One declaration by id. This is a READ of a public catalog, so there is no ownership to check; an id that
     * names nothing is a 404 rather than an empty row, because "no such tool" and "a tool with no fields" are
     * different facts.
     *
     * @throws UnknownTool when the id names no row
     */
    @Transactional(readOnly = true)
    public ToolEntry get(String toolId) {
        return repository.findById(toolId)
                .orElseThrow(() -> new UnknownTool("tool \"" + toolId + "\" names nothing in this registry"));
    }

    /**
     * Replace a declaration's summary and schema.
     *
     * <p>The owner is required before any read, and the row's owner is checked before either field is
     * validated — a stranger learns nothing about which summary or schema the owner would accept. The NAME is
     * not updated: it is the registry's global lookup key, and a different name would be a different
     * declaration.
     *
     * @throws InvalidTool when the owner is missing or a field breaks its rule
     * @throws UnknownTool when the id names no row
     * @throws NotYourTool when the row belongs to another account
     */
    @Transactional
    public ToolEntry update(String toolId, String ownerId, String summary, JsonNode inputSchema) {
        String owner = requireOwner(ownerId);
        ToolEntry row = repository.lockById(toolId)
                .orElseThrow(() -> new UnknownTool("tool \"" + toolId + "\" names nothing in this registry"));
        if (!row.getOwner().equals(owner)) {
            throw new NotYourTool("tool \"" + toolId + "\" belongs to another account");
        }
        row.setSummary(requireSummary(summary));
        row.setInputSchema(requireSchema(inputSchema));
        ToolEntry saved = repository.save(row);
        int next = revisions.findTopByToolIdOrderByRevisionDesc(toolId)
                .map(newest -> newest.getRevision() + 1)
                .orElse(1);
        java.time.Instant at = clock.instant().truncatedTo(ChronoUnit.MICROS);
        record(saved, next, at);
        recordChange(saved, "updated", next, at);
        return saved;
    }

    /**
     * One declaration's recorded history, newest first. A public read like the declaration itself; an id that
     * names nothing is a 404, not an empty history, because "no such tool" and "a tool nobody ever wrote" are
     * different facts.
     *
     * <p>M10 v580: {@code since} narrows the history to what a caller does not already have — everything newer
     * than that revision number. A consumer holding revision 5 asks for what came after it instead of walking
     * pages to find out whether anything did. Both the window AND the count are narrowed, the same rule the
     * catalog search follows.
     *
     * @param since the last revision the caller already has, or null for the whole history
     * @throws UnknownTool when the id names no current declaration
     * @throws InvalidTool when {@code since} is not a revision number (0 or more)
     */
    @Transactional(readOnly = true)
    public List<ToolRevision> history(String toolId, Integer since, int limit, int offset) {
        get(toolId);
        Integer after = requireSince(since);
        int effective = Math.min(Math.max(limit, 1), MAX_LIST_LIMIT);
        int from = Math.max(offset, 0);
        PageRequest page = PageRequest.of(from / effective, effective);
        return after == null
                ? revisions.findByToolIdOrderByRevisionDesc(toolId, page)
                : revisions.findByToolIdAndRevisionGreaterThanOrderByRevisionDesc(toolId, after, page);
    }

    /**
     * M10 v590 — the declaration AS IT WAS at one pin: the recorded revision whose own bytes hash to the
     * 64-hex pin the caller holds.
     *
     * <p>A consumer that pinned a contract knows the pin, not the revision number, and the number is the
     * server's bookkeeping rather than something the caller ever chose. This door answers "give me exactly the
     * bytes I pinned" from the history the registry already keeps, so a caller that was told its pin went
     * stale can read the old contract and diff it against the new one without having stored the schema.
     *
     * <p>The lookup is a SCAN of one declaration's history: the pin is computed from each revision's stored
     * bytes and is never a column (ADR 0028), so there is nothing to index. That is bounded by the two facts
     * that make it acceptable — it never leaves one tool's rows, and retention is the owner's (ADR 0032) — and
     * a pruned revision is simply no longer here, which is why an unknown pin is a 404 rather than a 500.
     *
     * @throws UnknownTool when the id names no current declaration
     * @throws InvalidTool when the pin is absent or not 64 lowercase hex characters
     * @throws UnknownPin when the declaration has no revision carrying that pin
     */
    @Transactional(readOnly = true)
    public ToolRevision atPin(String toolId, String pin) {
        get(toolId);
        if (pin == null || pin.isBlank()) {
            throw new InvalidTool("a read by pin must name the contract pin it wants");
        }
        String wanted = requirePin(pin);
        return revisions.findByToolIdOrderByRevisionDesc(toolId).stream()
                .filter(revision -> wanted.equals(contractSha256(revision)))
                .findFirst()
                .orElseThrow(() -> new UnknownPin("tool \"" + toolId + "\" has no revision carrying the pin \""
                        + wanted + "\" — it may never have been written here, or retention may have removed it"));
    }
    /**
     * The WHOLE number of recorded revisions of one declaration — of the NARROWED history when {@code since}
     * is given, because a window must not claim to be the whole when it is not.
     */
    @Transactional(readOnly = true)
    public long revisionCount(String toolId, Integer since) {
        Integer after = requireSince(since);
        return after == null
                ? revisions.countByToolId(toolId)
                : revisions.countByToolIdAndRevisionGreaterThan(toolId, after);
    }

    /**
     * A revision number a caller may ask to start AFTER: null when absent, otherwise 0 or more.
     *
     * <p>A negative value is REFUSED rather than floored to 0, unlike a paging offset: {@code limit} and
     * {@code offset} describe the SHAPE of an answer, so clamping them and echoing the clamp keeps the answer
     * honest; {@code since} describes WHICH FACTS are being asked for, and guessing there would answer a
     * different question than the one asked. There is no revision -3 to start after.
     */
    static Integer requireSince(Integer raw) {
        if (raw == null) {
            return null;
        }
        if (raw < 0) {
            throw new InvalidTool("a revision 'since' is 0 or more — this one is " + raw);
        }
        return raw;
    }

    /**
     * RETENTION: the owner removes the revisions strictly older than {@code before}, and is told how many went.
     *
     * <p>The history grows by one row per accepted update and nothing pruned it. A silent cap was never an
     * option — a pruned revision is a PIN that can no longer be explained — so the door exists, it is the
     * owner's, and the answer names its boundary and its cost. The bound is EXCLUSIVE ("keep everything from
     * this revision on"), the same sentence the receipt prune uses for its instant.
     *
     * <p>Two refusals carry the whole safety of the door: a prune without a {@code before} has no boundary to
     * check, and one whose bound is past the NEWEST revision would leave a declaration whose history explains
     * nothing about the contract it serves. Both are 400s that remove nothing. Pruning the same bound twice is
     * not an error — the second answer is {@code pruned: 0}, the same "already gone is not a failure" rule the
     * removal door follows.
     *
     * @param before keep every revision with a number this or higher
     * @return how many revision rows this call removed
     * @throws InvalidTool when the owner is missing, the bound is missing or not a revision number, or the bound
     *     would remove the newest revision
     * @throws UnknownTool when the id names no row
     * @throws NotYourTool when the row belongs to another account
     */
    @Transactional
    public int pruneRevisions(String toolId, String ownerId, Integer before) {
        String owner = requireOwner(ownerId);
        ToolEntry row = repository.lockById(toolId)
                .orElseThrow(() -> new UnknownTool("tool \"" + toolId + "\" names nothing in this registry"));
        if (!row.getOwner().equals(owner)) {
            throw new NotYourTool("tool \"" + toolId + "\" belongs to another account");
        }
        if (before == null) {
            throw new InvalidTool("the before parameter is missing — a prune must name the revision it keeps");
        }
        if (before < 1) {
            throw new InvalidTool("a revision number is 1 or more — this one is " + before);
        }
        int newest = revisions.findTopByToolIdOrderByRevisionDesc(toolId)
                .map(ToolRevision::getRevision)
                .orElse(0);
        if (newest == 0) {
            // A declaration with no recorded history (a row written before this build kept one) has nothing to
            // prune. Answering 0 is truthful; refusing a bound would be refusing a delete of nothing.
            return 0;
        }
        if (before > newest) {
            throw new InvalidTool("a prune keeps the newest revision (" + newest + ") — before is at most that, "
                    + "not " + before);
        }
        return revisions.deleteByToolIdAndRevisionLessThan(toolId, before);
    }

    /**
     * Append one entry to the registry's JOURNAL - the ordered record of writes that happened (v583).
     *
     * <p>Called inside the writing transaction, so a rolled-back write leaves no claim that it happened. It
     * duplicates no state: it exists for the two changes state cannot hold at all (a removal and an
     * undeprecation delete the rows that would have said so) and to put every change on ONE order, which three
     * tables with three clocks cannot do.
     */
    private void recordChange(ToolEntry row, String kind, Integer revision, java.time.Instant at) {
        changes.save(new ToolChange(row.getToolId(), row.getName(), kind, revision, at));
    }

    /**
     * The registry's journal, OLDEST first, from a cursor: everything that happened after {@code since},
     * optionally narrowed to one KIND and one declaration.
     *
     * <p>Facing forward, unlike the history and ownership windows, because the reader is a process moving a
     * cursor: ascending {@code seq} lets it advance without skipping an entry allocated before the page it holds.
     * The count is the number of entries the same three predicates match, so a page never claims to be the whole
     * journal - and a watcher that asks only for removals is told how many removals it is a page of.
     *
     * @param kind   one of {@link #CHANGE_KINDS}, or null for every kind
     * @param toolId one declaration's entries, or null for the whole registry
     * @param since  the last seq the caller processed; 0 (the default) is "from the beginning"
     * @throws InvalidTool when {@code since} is negative, or when {@code kind} is not one of the six
     */
    @Transactional(readOnly = true)
    public List<ToolChange> journal(String kind, String toolId, long since, int limit, int offset) {
        String changeKind = normalizeChangeKind(kind);
        String tool = normalizeOwner(toolId);
        if (since < 0) {
            throw new InvalidTool("a journal cursor is 0 or more — this one is " + since);
        }
        int effective = Math.min(Math.max(limit, 1), MAX_LIST_LIMIT);
        int from = Math.max(offset, 0);
        return changes.feed(since, changeKind, tool, PageRequest.of(from / effective, effective));
    }

    /** The WHOLE number of journal entries the window is a window of - the SAME cursor and filters. */
    @Transactional(readOnly = true)
    public long journalCount(String kind, String toolId, long since) {
        String changeKind = normalizeChangeKind(kind);
        String tool = normalizeOwner(toolId);
        if (since < 0) {
            throw new InvalidTool("a journal cursor is 0 or more — this one is " + since);
        }
        return changes.feedCount(since, changeKind, tool);
    }

    /** Append one revision row - the write both the registration and every accepted update go through. */
    private void record(ToolEntry row, int revision, java.time.Instant recordedAt) {
        revisions.save(new ToolRevision(row.getToolId(), revision, row.getSummary(), row.getInputSchema(), recordedAt));
    }

    /**
     * Deprecate a declaration: say it is going away, and optionally name what replaces it.
     *
     * <p>The owner is required before any read and checked before either field, the same order an update uses:
     * a stranger learns nothing about which sentence the owner would accept. The message is one trimmed
     * sentence bounded like a summary. The replacement is a HINT - it must pass the same name rule, and it
     * cannot name the tool itself, but it need not hold a row: a successor may be declared later.
     *
     * <p>One row per tool: deprecating again replaces the sentence, the hint and the instant.
     *
     * @throws InvalidTool when the owner is missing or the message/replacement breaks its rule
     * @throws UnknownTool when the id names no row
     * @throws NotYourTool when the row belongs to another account
     */
    @Transactional
    public ToolDeprecation deprecate(String toolId, String ownerId, String message, String replacement) {
        String owner = requireOwner(ownerId);
        ToolEntry row = repository.lockById(toolId)
                .orElseThrow(() -> new UnknownTool("tool \"" + toolId + "\" names nothing in this registry"));
        if (!row.getOwner().equals(owner)) {
            throw new NotYourTool("tool \"" + toolId + "\" belongs to another account");
        }
        String sentence = requireDeprecationMessage(message);
        String target = requireReplacement(replacement, row.getName());
        java.time.Instant at = clock.instant().truncatedTo(ChronoUnit.MICROS);
        ToolDeprecation stored = deprecations.findByToolId(toolId)
                .map(existing -> {
                    existing.replace(sentence, target, at);
                    return deprecations.save(existing);
                })
                .orElseGet(() -> deprecations.save(new ToolDeprecation(toolId, sentence, target, at)));
        recordChange(row, "deprecated", null, at);
        return stored;
    }

    /**
     * Withdraw a deprecation. {@code false} when the tool was not deprecated - "already live" is not an error,
     * the same rule the removal door follows for an id that names nothing.
     *
     * @throws UnknownTool when the id names no row
     * @throws NotYourTool when the row belongs to another account
     */
    @Transactional
    public boolean undeprecate(String toolId, String ownerId) {
        String owner = requireOwner(ownerId);
        ToolEntry row = repository.lockById(toolId)
                .orElseThrow(() -> new UnknownTool("tool \"" + toolId + "\" names nothing in this registry"));
        if (!row.getOwner().equals(owner)) {
            throw new NotYourTool("tool \"" + toolId + "\" belongs to another account");
        }
        return deprecations.findByToolId(toolId)
                .map(existing -> {
                    deprecations.delete(existing);
                    // A withdrawal deletes the row that said the tool was going away, so the journal entry is the
                    // only remaining record that it happened at all.
                    recordChange(row, "undeprecated", null, clock.instant().truncatedTo(ChronoUnit.MICROS));
                    return true;
                })
                .orElse(false);
    }

    /**
     * One declaration's deprecation. A 404 when the tool exists but is not deprecated, distinct by name from
     * the 404 for an id that names nothing: "this tool is live" and "there is no such tool" are different
     * facts, and a reader deciding whether to migrate needs to tell them apart.
     */
    @Transactional(readOnly = true)
    public ToolDeprecation deprecationOf(String toolId) {
        get(toolId);
        return deprecations.findByToolId(toolId)
                .orElseThrow(() -> new UnknownDeprecation("tool \"" + toolId + "\" is not deprecated"));
    }

    /**
     * Record that a NAMED contract of this declaration was tested - the owner's claim, at the pin it tested.
     *
     * <p>The pin must be the one being served RIGHT NOW. A claim about an older contract is not wrong, but it is
     * not a claim about what a consumer would install today, and accepting it silently would make the two
     * indistinguishable. A mismatch is a 409 that names the pin now being served: the caller re-reads and says it
     * again, which costs one round trip and keeps every stored claim true about the bytes it names.
     *
     * <p>One row per tool: re-attesting REPLACES the claim (pin, note, instant) rather than appending, because a
     * claim is a current state and the revisions door already holds the contracts.
     *
     * @param toolId      the declaration
     * @param ownerId     the holder; required before anything is read
     * @param pin         the 64-hex contract pin the caller tested, required
     * @param note        an optional sentence about how it was tested, trimmed and bounded
     * @throws InvalidTool      when the owner or pin is missing or malformed, or the note is too long
     * @throws UnknownTool      when the id names no row
     * @throws NotYourTool      when the row belongs to another account
     * @throws StaleContract    when the pin is not the one being served
     */
    @Transactional
    public ToolAttestation attest(String toolId, String ownerId, String pin, String note) {
        String owner = requireOwner(ownerId);
        String claimed = requirePin(pin);
        String sentence = normalizeNote(note);
        ToolEntry row = repository.lockById(toolId)
                .orElseThrow(() -> new UnknownTool("tool \"" + toolId + "\" names nothing in this registry"));
        if (!row.getOwner().equals(owner)) {
            throw new NotYourTool("tool \"" + toolId + "\" belongs to another account");
        }
        String current = contractSha256(row);
        if (!current.equals(claimed)) {
            throw new StaleContract("the pin \"" + claimed + "\" is not the contract being served — tool \""
                    + toolId + "\" now serves \"" + current + "\"; read it again and attest that one");
        }
        java.time.Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        attestations.findByToolId(toolId).ifPresent(attestations::delete);
        ToolAttestation saved = attestations.save(new ToolAttestation(toolId, claimed, sentence, now));
        recordChange(row, "attested", null, now);
        return saved;
    }

    /**
     * One declaration's attestation. A claim is a 404 under its own name ({@code not-attested}) when there is
     * none, so "nobody has claimed this" is never mistaken for "nothing is known about this tool".
     *
     * @throws UnknownTool        when the id names no row
     * @throws UnknownAttestation when the tool has no claim
     */
    @Transactional(readOnly = true)
    public ToolAttestation attestationOf(String toolId) {
        get(toolId);
        return attestations.findByToolId(toolId)
                .orElseThrow(() -> new UnknownAttestation("tool \"" + toolId + "\" has no attestation"));
    }

    /**
     * Withdraw the claim. {@code false} when there was none - "nothing to withdraw" is not an error, the same rule
     * the removal and undeprecation doors follow. The entry it leaves is the ONLY record that a claim existed:
     * the row it deletes cannot say it was withdrawn.
     */
    @Transactional
    public boolean withdrawAttestation(String toolId, String ownerId) {
        String owner = requireOwner(ownerId);
        ToolEntry row = repository.lockById(toolId)
                .orElseThrow(() -> new UnknownTool("tool \"" + toolId + "\" names nothing in this registry"));
        if (!row.getOwner().equals(owner)) {
            throw new NotYourTool("tool \"" + toolId + "\" belongs to another account");
        }
        return attestations.findByToolId(toolId)
                .map(existing -> {
                    attestations.delete(existing);
                    recordChange(row, "unattested", null, clock.instant().truncatedTo(ChronoUnit.MICROS));
                    return true;
                })
                .orElse(false);
    }

    /** The required pin: trimmed, and refused by name when it is not 64 lowercase hex characters. */
    static String requirePin(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidTool("an attestation must name the contract pin it tested");
        }
        String trimmed = raw.trim();
        if (!PIN_SHAPE.matcher(trimmed).matches()) {
            throw new InvalidTool("a contract pin is " + ContractFingerprint.HEX_LENGTH
                    + " lowercase hex characters — this one is \"" + trimmed + "\"");
        }
        return trimmed;
    }

    /** The optional note: null when absent or blank, trimmed otherwise, bounded like a deprecation sentence. */
    static String normalizeNote(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String trimmed = raw.trim();
        if (trimmed.length() > MAX_NOTE_LENGTH) {
            throw new InvalidTool("an attestation note is at most " + MAX_NOTE_LENGTH
                    + " characters — this one is " + trimmed.length());
        }
        return trimmed;
    }
    /** The public list of deprecated declarations, newest first - the window, not the whole table. */
    @Transactional(readOnly = true)
    public List<ToolDeprecation> deprecationPage(int limit, int offset) {
        int effective = Math.min(Math.max(limit, 1), MAX_LIST_LIMIT);
        int from = Math.max(offset, 0);
        return deprecations.findAllByOrderByDeprecatedAtDesc(PageRequest.of(from / effective, effective));
    }

    /** The WHOLE number of deprecated declarations the window is a window of. */
    @Transactional(readOnly = true)
    public long deprecationCount() {
        return deprecations.count();
    }

    /**
     * Several declarations by id, in ONE read, answered in the order the caller named them.
     *
     * <p>A batch is the shape a caller has after reading the feed: the journal names what changed, and the next
     * question is what those declarations ARE now. Asking one at a time makes a poller's cost proportional to the
     * number of changes; this read makes it one request.
     *
     * <p>The ids are normalized first (trimmed, blanks dropped, duplicates collapsed) so the answer's count and
     * order describe what was actually asked. An id that holds nothing is simply absent from the answer - the
     * controller reports it in {@code missing} rather than turning a member of a list into a failed request.
     *
     * @throws InvalidTool when no id remains, or when more than {@link #MAX_BATCH_IDS} distinct ids are named
     */
    @Transactional(readOnly = true)
    public List<ToolEntry> batch(List<String> rawIds) {
        List<String> wanted = normalizeIds(rawIds);
        java.util.Map<String, ToolEntry> held = byIds(wanted);
        return wanted.stream().map(held::get).filter(java.util.Objects::nonNull).toList();
    }

    /**
     * The ids a batch read will look for: trimmed, blanks dropped, duplicates collapsed in FIRST-SEEN order.
     *
     * <p>The order is kept because it is the caller's - a batch answer is a list the caller can zip with the list
     * it sent, which a catalog's name order would destroy. A blank is not an id (the same rule the filters
     * follow), and naming an id twice is asking for one row twice.
     */
    static List<String> normalizeIds(List<String> rawIds) {
        if (rawIds == null || rawIds.isEmpty()) {
            throw new InvalidTool("a batch read names at least one id");
        }
        List<String> wanted = new java.util.ArrayList<>();
        for (String raw : rawIds) {
            if (raw == null || raw.isBlank()) {
                continue;
            }
            String id = raw.trim();
            if (!wanted.contains(id)) {
                wanted.add(id);
            }
        }
        if (wanted.isEmpty()) {
            throw new InvalidTool("a batch read names at least one id");
        }
        if (wanted.size() > MAX_BATCH_IDS) {
            throw new InvalidTool("a batch read names at most " + MAX_BATCH_IDS
                    + " ids — this one names " + wanted.size());
        }
        return wanted;
    }
    /** The declarations behind a page of deprecations, in one read rather than one query per row. */
    @Transactional(readOnly = true)
    public java.util.Map<String, ToolEntry> byIds(List<String> ids) {
        return repository.findAllById(ids).stream()
                .collect(java.util.stream.Collectors.toMap(ToolEntry::getToolId, tool -> tool));
    }

    /** The required one-sentence deprecation message, trimmed and bounded like a summary. */
    static String requireDeprecationMessage(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidTool("a deprecation needs a message - one sentence about why the tool is going away");
        }
        String trimmed = raw.trim();
        if (trimmed.length() > MAX_SUMMARY_LENGTH) {
            throw new InvalidTool("a deprecation message is at most " + MAX_SUMMARY_LENGTH
                    + " characters - this one is " + trimmed.length());
        }
        return trimmed;
    }

    /**
     * The optional replacement name: absent when blank, otherwise a legal tool name that is not this tool.
     * A blank hint and no hint are the same request, so the wire needs no third state.
     */
    static String requireReplacement(String raw, String toolName) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String replacement = requireName(raw);
        if (replacement.equals(toolName)) {
            throw new InvalidTool("a deprecation cannot name its own tool \"" + toolName + "\" as the replacement");
        }
        return replacement;
    }

    /** The stored canonical text as the tree the wire shape carries. Trusting internal storage here. */
    public JsonNode schemaOf(ToolEntry row) {
        return parseSchema(row.getInputSchema(), row.getToolId());
    }

    /** The same read for a recorded revision, whose schema is the one it SAID at that instant. */
    public JsonNode schemaOf(ToolRevision revision) {
        return parseSchema(revision.getInputSchema(), revision.getToolId());
    }

    /**
     * The PIN of a declaration's live contract: 64 lowercase hex characters over the summary it serves and the
     * schema it accepts.
     *
     * <p>Computed from the stored bytes on every read rather than kept in a column — see
     * {@link ContractFingerprint} for why the rows stay the only truth and what the digest is over.
     */
    public String contractSha256(ToolEntry row) {
        return ContractFingerprint.of(mapper, row.getSummary(), parseSchema(row.getInputSchema(), row.getToolId()));
    }

    /**
     * The same pin for one recorded revision: what THIS write's contract hashed to, recomputed from the bytes
     * that write left behind.
     */
    public String contractSha256(ToolRevision revision) {
        return ContractFingerprint.of(
                mapper, revision.getSummary(), parseSchema(revision.getInputSchema(), revision.getToolId()));
    }

    private JsonNode parseSchema(String stored, String toolId) {
        try {
            return mapper.readTree(stored);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("stored input schema of tool " + toolId + " is not JSON", e);
        }
    }

    /**
     * The declaring account, trimmed. Package-private so the controller echoes the SAME normalization the
     * service applied rather than a second trim that could disagree.
     */
    static String requireOwner(String raw) {
        String owner = normalizeOwner(raw);
        if (owner == null) {
            throw new InvalidTool("a tool needs an owner — the account that declares it");
        }
        if (owner.length() > MAX_OWNER_LENGTH) {
            throw new InvalidTool("an owner id is at most " + MAX_OWNER_LENGTH
                    + " characters — this one is " + owner.length());
        }
        return owner;
    }

    /**
     * The optional owner FILTER: null when absent or blank, otherwise trimmed. A blank filter is not an
     * account, and treating it as one would answer an empty catalog instead of the whole one.
     */
    /**
     * The optional journal kind: null when absent or blank, otherwise one of {@link #CHANGE_KINDS}.
     *
     * <p>A closed vocabulary is validated HERE rather than left to answer an empty page, because an empty page
     * is a true answer to "nothing matched" and a lie about "you spelled it wrong". The refusal names the whole
     * vocabulary so a caller can fix the call without reading this source.
     */
    static String normalizeChangeKind(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String trimmed = raw.trim();
        if (!CHANGE_KINDS.contains(trimmed)) {
            throw new InvalidTool("a journal kind is one of " + String.join(", ", CHANGE_KINDS)
                    + " — this one is \"" + trimmed + "\"");
        }
        return trimmed;
    }
    static String normalizeOwner(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return raw.trim();
    }

    /**
     * The optional catalog search: null when absent or blank, trimmed otherwise, bounded so a pattern cannot
     * be arbitrarily long. Blank is the absent filter — searching for nothing is not searching for everything.
     */
    static String normalizeQuery(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String trimmed = raw.trim();
        if (trimmed.length() > MAX_QUERY_LENGTH) {
            throw new InvalidTool("a catalog search is at most " + MAX_QUERY_LENGTH
                    + " characters — this one is " + trimmed.length());
        }
        return trimmed;
    }

    /**
     * The LIKE pattern for a search, lowercased, with {@code \}, {@code %} and {@code _} escaped so the
     * caller's text is searched for literally. Without this a query of "%" would answer the whole catalog
     * while claiming to search for a percent sign.
     */
    static String likePattern(String query) {
        String escaped = query.toLowerCase(java.util.Locale.ROOT)
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return "%" + escaped + "%";
    }

    /** The global name, validated and refused by name. Package-private so the rules are asserted directly. */
    static String requireName(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidTool("a tool name is required — " + ruleText());
        }
        String trimmed = raw.trim();
        if (trimmed.length() < MIN_NAME_LENGTH || trimmed.length() > MAX_NAME_LENGTH) {
            throw new InvalidTool("a tool name is " + MIN_NAME_LENGTH + " to " + MAX_NAME_LENGTH
                    + " characters — this one is " + trimmed.length());
        }
        if (!NAME_SHAPE.matcher(trimmed).matches()) {
            throw new InvalidTool("a tool name must be " + ruleText() + " — \"" + trimmed + "\" is not");
        }
        return trimmed;
    }

    /** The required one-sentence summary, trimmed and bounded. */
    static String requireSummary(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidTool("a tool needs a summary — one sentence about what it does");
        }
        String trimmed = raw.trim();
        if (trimmed.length() > MAX_SUMMARY_LENGTH) {
            throw new InvalidTool("a tool summary is at most " + MAX_SUMMARY_LENGTH
                    + " characters — this one is " + trimmed.length());
        }
        return trimmed;
    }

    /**
     * The input schema: a JSON OBJECT, canonicalized to compact bytes and bounded.
     *
     * <p>The bound is measured AFTER canonicalization because that is what the row stores. A caller that sends
     * pretty-printed JSON cannot inflate the stored row with whitespace, and two schemas that differ only in
     * formatting become one byte-identical declaration.
     */
    String requireSchema(JsonNode schema) {
        if (schema == null || schema.isNull() || schema.isMissingNode()) {
            throw new InvalidTool("a tool needs an inputSchema — a JSON object, at most "
                    + MAX_SCHEMA_BYTES + " bytes");
        }
        if (!schema.isObject()) {
            throw new InvalidTool("a tool's inputSchema must be a JSON OBJECT — this one is "
                    + schema.getNodeType().name().toLowerCase(java.util.Locale.ROOT));
        }
        String canonical;
        try {
            canonical = mapper.writeValueAsString(schema);
        } catch (JsonProcessingException e) {
            throw new InvalidTool("a tool's inputSchema could not be serialized: " + e.getOriginalMessage());
        }
        int bytes = canonical.getBytes(StandardCharsets.UTF_8).length;
        if (bytes > MAX_SCHEMA_BYTES) {
            throw new InvalidTool("a tool's inputSchema is at most " + MAX_SCHEMA_BYTES
                    + " bytes in canonical form — this one is " + bytes);
        }
        return canonical;
    }

    private static String ruleText() {
        return "2 to 64 characters of lowercase letters, digits, '.', '_' or '-', starting with a letter or digit";
    }
}
