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

    /**
     * The name's shape. The first character is alphanumeric, so a name cannot begin with a dot or dash and
     * collide with a relative path if a consumer ever maps names onto files.
     */
    private static final Pattern NAME_SHAPE = Pattern.compile("[a-z0-9][a-z0-9._-]*");

    private final ToolRepository repository;
    private final ToolRevisionRepository revisions;
    private final ToolDeprecationRepository deprecations;
    private final Clock clock;
    private final ObjectMapper mapper;

    public ToolService(
            ToolRepository repository,
            ToolRevisionRepository revisions,
            ToolDeprecationRepository deprecations,
            Clock clock,
            ObjectMapper mapper) {
        this.repository = repository;
        this.revisions = revisions;
        this.deprecations = deprecations;
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
        return saved;
    }

    /**
     * The catalog, name ascending: the whole registry when no owner is named, or one account's declarations
     * when one is. The blank owner is the absent filter — a listing is a READ, and there is no ownership to
     * enforce on it.
     */
    @Transactional(readOnly = true)
    public List<ToolEntry> catalog(String ownerId, int limit, int offset) {
        int effective = Math.min(Math.max(limit, 1), MAX_LIST_LIMIT);
        int from = Math.max(offset, 0);
        PageRequest page = PageRequest.of(from / effective, effective);
        String owner = normalizeOwner(ownerId);
        return owner == null
                ? repository.findAllByOrderByNameAsc(page)
                : repository.findByOwnerOrderByNameAsc(owner, page);
    }

    /** The WHOLE number of rows the window is a window of — narrowed the same way the window is. */
    @Transactional(readOnly = true)
    public long countOf(String ownerId) {
        String owner = normalizeOwner(ownerId);
        return owner == null ? repository.count() : repository.countByOwner(owner);
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
                    revisions.deleteByToolId(toolId);
                    deprecations.deleteByToolId(toolId);
                    repository.delete(row);
                    return true;
                })
                .orElse(false);
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
        record(saved, next, clock.instant().truncatedTo(ChronoUnit.MICROS));
        return saved;
    }

    /**
     * One declaration's recorded history, newest first. A public read like the declaration itself; an id that
     * names nothing is a 404, not an empty history, because "no such tool" and "a tool nobody ever wrote" are
     * different facts.
     *
     * @throws UnknownTool when the id names no current declaration
     */
    @Transactional(readOnly = true)
    public List<ToolRevision> history(String toolId, int limit, int offset) {
        get(toolId);
        int effective = Math.min(Math.max(limit, 1), MAX_LIST_LIMIT);
        int from = Math.max(offset, 0);
        return revisions.findByToolIdOrderByRevisionDesc(toolId, PageRequest.of(from / effective, effective));
    }

    /** The WHOLE number of recorded revisions of one declaration. */
    @Transactional(readOnly = true)
    public long revisionCount(String toolId) {
        return revisions.countByToolId(toolId);
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
        return deprecations.findByToolId(toolId)
                .map(existing -> {
                    existing.replace(sentence, target, at);
                    return deprecations.save(existing);
                })
                .orElseGet(() -> deprecations.save(new ToolDeprecation(toolId, sentence, target, at)));
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
    static String normalizeOwner(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return raw.trim();
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
