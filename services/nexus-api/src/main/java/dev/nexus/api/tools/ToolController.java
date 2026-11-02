package dev.nexus.api.tools;

import dev.nexus.api.tools.ToolDtos.DeprecateRequest;
import dev.nexus.api.tools.ToolDtos.Deprecation;
import dev.nexus.api.tools.ToolDtos.DeprecationList;
import dev.nexus.api.tools.ToolDtos.DeprecatedTool;
import dev.nexus.api.tools.ToolDtos.OwnershipChain;
import dev.nexus.api.tools.ToolDtos.PruneRevisionsAnswer;
import dev.nexus.api.tools.ToolDtos.OwnershipTransfer;
import dev.nexus.api.tools.ToolDtos.RegisterRequest;
import dev.nexus.api.tools.ToolDtos.TransferRequest;
import dev.nexus.api.tools.ToolDtos.Tool;
import dev.nexus.api.tools.ToolDtos.ToolChangeList;
import dev.nexus.api.tools.ToolDtos.ToolChangeView;
import dev.nexus.api.tools.ToolDtos.ToolList;
import dev.nexus.api.tools.ToolDtos.ToolRevisionList;
import dev.nexus.api.tools.ToolDtos.ToolRevisionView;
import dev.nexus.api.tools.ToolDtos.UpdateRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * M10 v571–v579 — the HTTP surface for the tool registry. Fifteen doors, and the differences between them are the
 * rules:
 *
 * <ul>
 *   <li>{@code POST /tools} — declare a tool. 201, and the answer is the row: its id, owner, name, summary,
 *       canonical schema and creation instant.
 *   <li>{@code GET /tools?owner=&q=&deprecated=&limit=&offset=} — the catalog, name ascending. The optional owner
 *       narrows the window to one account's declarations; the optional {@code q} narrows it to declarations
 *       whose NAME or SUMMARY contains that text, case-insensitively and with LIKE wildcards treated literally;
 *       the optional {@code deprecated} answers only the declarations that carry a deprecation (true) or only
 *       those that do not (false). All three compose, and the count is the whole (narrowed) number, so a window
 *       can say what it is hiding.
 *   <li>{@code GET /tools/changes?since=&limit=&offset=} — the registry's JOURNAL, oldest first from a cursor: one
 *       entry per accepted write (declared, updated, transferred, deprecated, undeprecated, removed). It is the
 *       only read that can name a declaration whose row is gone, and the only one that faces forward.
 *   <li>{@code GET /tools/{id}} — one declaration by id. A public read, like the catalog; an id that names
 *       nothing is a 404 rather than an empty row. The answer carries the contract's PIN as a field and as a
 *       strong {@code ETag}, so an {@code If-None-Match} of the pin the caller holds is a 304 with no body.
 *   <li>{@code GET /tools/by-name/{name}} — one declaration by its GLOBAL name. The name is the key every
 *       agent shares, so it deserves a direct read rather than a paged catalog; a malformed name is a 400
 *       that names the rule, and a well-formed name that holds no row is a 404. Same pin, same conditional
 *       read as the read by id.
 *   <li>{@code GET /tools/{id}/revisions?since=&limit=&offset=} — the declaration's recorded history, newest first:
 *       what it SAID at each accepted write, with the whole count beside the window. The optional
 *       {@code since} asks only for what came AFTER a revision the caller already has, and narrows the count
 *       with it. A public read; an id that names nothing is a 404 rather than an empty history.
 *   <li>{@code PUT /tools/{id}?owner=} — REPLACE a declaration's summary and schema, for its owner only. The
 *       name, owner, id and creation instant cannot change: an update changes what a declaration SAYS, not
 *       which declaration it is.
 *   <li>{@code DELETE /tools/{id}?owner=} — remove a declaration, for its owner only. 200 either way: an id
 *       that names nothing is "already gone", not an error; another account's row is a 403.
 *   <li>{@code POST /tools/{id}/deprecation?owner=} — say a declaration is going away, for its owner only,
 *       with a message and an optional replacement NAME (a hint, not a reference).
 *   <li>{@code GET /tools/{id}/deprecation} — one declaration's deprecation. 404 {@code unknown-tool} when
 *       the id names nothing, and a DIFFERENT 404 {@code not-deprecated} when the tool is live.
 *   <li>{@code DELETE /tools/{id}/deprecation?owner=} — withdraw the deprecation, for its owner only.
 *       200 with {@code removed:false} when the tool was not deprecated.
 *   <li>{@code GET /tools/deprecations?limit=&offset=} — every deprecated declaration, newest first, with
 *       the tool's name beside its deprecation so an agent can read the whole warning list in one request.
 *   <li>{@code DELETE /tools/{id}/revisions?owner=&before=} — the owner's RETENTION: remove the revisions strictly
 *       older than {@code before}, and answer the bound, what went and what remains. A bound past the newest
 *       revision is a 400, because a declaration whose history explains nothing is not a state this door creates.
 *   <li>{@code POST /tools/{id}/transfer?owner=} — HAND THE DECLARATION OVER, for its current owner only, to
 *       the account named in the body. Same id, same name, same history, same pin; the handover is recorded in
 *       the declaration's chain of holders instead of a revision, because nothing it says changed.
 *   <li>{@code GET /tools/{id}/ownership?limit=&offset=} — that chain, newest first, with the CURRENT holder
 *       named beside the window. A public read; an id that names nothing is a 404.
 * </ul>
 *
 * <p>There is no door that EXECUTES a tool and no door that records an invocation. A tool is declared here so
 * another agent can read the catalog; the registry does not call out, because a declaration has no endpoint
 * to call and this build does not pretend it does.
 */
@RestController
@RequestMapping("/")
public class ToolController {

    private final ToolService service;

    public ToolController(ToolService service) {
        this.service = service;
    }

    /** Declare a tool. 201 when the row was made. */
    @PostMapping("/tools")
    public ResponseEntity<Tool> register(@RequestBody RegisterRequest request) {
        ToolEntry row = service.register(
                request == null ? null : request.owner(),
                request == null ? null : request.name(),
                request == null ? null : request.summary(),
                request == null ? null : request.inputSchema());
        return ResponseEntity.status(201).body(toWire(row));
    }

    /**
     * v583 — the registry's JOURNAL, oldest first, from a cursor: everything that happened after {@code since}.
     *
     * <p>This is the only read here that can name a declaration WHOSE ROW IS GONE: a removal deletes every table
     * a reader could have asked, so the journal keeps the id, the name and the fact. It is also the only read
     * that faces FORWARD — a cursor-moving poller must not have new writes appear behind it.
     *
     * <p>{@code since} is 0 when absent, which is "from the beginning" rather than "no filter": the feed has no
     * two-state absence, because 0 is a real position before the first entry. A negative cursor is a 400.
     */
    @GetMapping("/tools/changes")
    public ResponseEntity<ToolChangeList> changes(
            @RequestParam(name = "since", required = false) Long since,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        long cursor = since == null ? 0L : since;
        int asked = limit == null ? ToolService.DEFAULT_LIST_LIMIT : limit;
        int effective = Math.min(Math.max(asked, 1), ToolService.MAX_LIST_LIMIT);
        int from = offset == null ? 0 : Math.max(offset, 0);
        List<ToolChangeView> rows =
                service.journal(cursor, asked, from).stream().map(this::toWire).toList();
        return ResponseEntity.ok(
                new ToolChangeList(cursor, rows, service.journalCount(cursor), effective, from));
    }

    /**
     * The catalog. A missing or blank {@code owner} is the WHOLE registry rather than a refusal: this is a
     * read of a public catalog, and there is no ownership to enforce on it.
     */
    @GetMapping("/tools")
    public ResponseEntity<ToolList> list(
            @RequestParam(name = "owner", required = false) String owner,
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "deprecated", required = false) Boolean deprecated,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        int asked = limit == null ? ToolService.DEFAULT_LIST_LIMIT : limit;
        int effective = Math.min(Math.max(asked, 1), ToolService.MAX_LIST_LIMIT);
        int from = offset == null ? 0 : Math.max(offset, 0);
        String filter = ToolService.normalizeOwner(owner);
        String search = ToolService.normalizeQuery(q);
        List<Tool> rows = service.catalog(owner, q, deprecated, asked, from).stream().map(this::toWire).toList();
        return ResponseEntity.ok(new ToolList(
                filter, search, deprecated, rows, service.countOf(owner, q, deprecated), effective, from));
    }

    /**
     * One declaration by id. A public read, like the catalog; an id that names nothing is a 404.
     *
     * <p>The answer carries the contract's PIN both as a field and as a strong {@code ETag}, so a caller that
     * already holds this contract can ask to be told only when it changes: an {@code If-None-Match} of the pin
     * it holds answers 304 with no body. Existence is settled FIRST — an unknown id is a 404 whether or not the
     * caller sent a tag, because 304 would claim the caller's copy is current when there is no copy.
     */
    @GetMapping("/tools/{toolId}")
    public ResponseEntity<Tool> read(
            @PathVariable String toolId,
            @RequestHeader(name = "If-None-Match", required = false) String ifNoneMatch) {
        return answer(service.get(toolId), ifNoneMatch);
    }

    /**
     * One declaration by its global NAME, the key every agent shares.
     *
     * <p>This mapping is more specific than {@code /tools/{id}} and therefore wins for the literal segment
     * {@code by-name}; an id can never be the string "by-name..." in practice, and the ordering is declared in
     * the live proof rather than assumed.
     */
    @GetMapping("/tools/by-name/{name}")
    public ResponseEntity<Tool> readByName(
            @PathVariable String name,
            @RequestHeader(name = "If-None-Match", required = false) String ifNoneMatch) {
        return answer(service.getByName(name), ifNoneMatch);
    }

    /**
     * Deprecate a declaration: say it is going away, and optionally name what replaces it.
     *
     * <p>The owner is REQUIRED before anything is read and checked before either field. The message is one
     * trimmed sentence; the replacement is a legal tool name that is not this tool, and it need not hold a
     * row because a successor may be declared later.
     */
    @PostMapping("/tools/{toolId}/deprecation")
    public ResponseEntity<?> deprecate(
            @PathVariable String toolId,
            @RequestParam(name = "owner", required = false) String owner,
            @RequestBody(required = false) DeprecateRequest request) {
        if (owner == null || owner.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid-tool",
                    "message", "the owner parameter is missing — only the owner may deprecate a tool"));
        }
        ToolDeprecation row = service.deprecate(
                toolId,
                owner,
                request == null ? null : request.message(),
                request == null ? null : request.replacement());
        return ResponseEntity.ok(toWire(row));
    }

    /**
     * One declaration's deprecation. A tool that is live is a 404 NOT-DEPRECATED, and the handler below
     * answers it under that name rather than pretending the tool does not exist.
     */
    @GetMapping("/tools/{toolId}/deprecation")
    public ResponseEntity<Deprecation> deprecation(@PathVariable String toolId) {
        return ResponseEntity.ok(toWire(service.deprecationOf(toolId)));
    }

    /**
     * Withdraw a deprecation. Owner required; 200 with {@code removed:false} when the tool was not deprecated,
     * the same "already gone is not an error" shape the removal door uses.
     */
    @DeleteMapping("/tools/{toolId}/deprecation")
    public ResponseEntity<Map<String, Object>> undeprecate(
            @PathVariable String toolId,
            @RequestParam(name = "owner", required = false) String owner) {
        if (owner == null || owner.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid-tool",
                    "message", "the owner parameter is missing — only the owner may withdraw a deprecation"));
        }
        boolean removed = service.undeprecate(toolId, owner);
        return ResponseEntity.ok(Map.of("toolId", toolId, "removed", removed));
    }

    /**
     * v581 — the owner's RETENTION door: remove every revision STRICTLY older than {@code before}.
     *
     * <p>200 with {@link PruneRevisionsAnswer}: the bound applied, how many rows went and what the history still
     * holds. A missing owner, a missing bound, a non-positive bound and a bound past the newest revision are
     * 400s that remove nothing — a delete that cannot name its boundary has no business running, and one that
     * would leave a declaration with no record of itself has even less. Pruning the same bound twice answers
     * {@code pruned: 0}: already gone is not a failure.
     */
    @DeleteMapping("/tools/{toolId}/revisions")
    public ResponseEntity<?> pruneRevisions(
            @PathVariable String toolId,
            @RequestParam(name = "owner", required = false) String owner,
            @RequestParam(name = "before", required = false) Integer before) {
        if (owner == null || owner.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid-tool",
                    "message", "the owner parameter is missing — a prune belongs to the account that holds the tool"));
        }
        if (before == null) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid-tool",
                    "message", "the before parameter is missing — a prune must name the revision it keeps"));
        }
        int pruned = service.pruneRevisions(toolId, owner, before);
        return ResponseEntity.ok(
                new PruneRevisionsAnswer(toolId, before, pruned, service.revisionCount(toolId, null)));
    }

    /**
     * HAND THE DECLARATION OVER, for its current owner only.
     *
     * <p>Before this door a tool could not change hands: the registry's only answer was "declare it again under
     * the new account", which mints a new id, restarts the history at revision 1 and invalidates every pin a
     * consumer holds. The answer here is the SAME declaration with its new owner — same id, same name, same
     * schema, same pin — and the handover itself is recorded in the declaration's chain of holders.
     */
    @PostMapping("/tools/{toolId}/transfer")
    public ResponseEntity<?> transfer(
            @PathVariable String toolId,
            @RequestParam(name = "owner", required = false) String owner,
            @RequestBody(required = false) TransferRequest request) {
        if (owner == null || owner.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid-tool",
                    "message", "the owner parameter is missing — only the current owner may transfer a tool"));
        }
        ToolEntry row = service.transfer(toolId, owner, request == null ? null : request.to());
        return ResponseEntity.ok(toWire(row));
    }

    /**
     * One declaration's chain of holders, newest first, with the current holder named beside the window.
     *
     * <p>A public read like the declaration itself; an id that names nothing is a 404 rather than an empty
     * chain, because "no such tool" and "a tool that never changed hands" are different facts.
     */
    @GetMapping("/tools/{toolId}/ownership")
    public ResponseEntity<OwnershipChain> ownership(
            @PathVariable String toolId,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        int asked = limit == null ? ToolService.DEFAULT_LIST_LIMIT : limit;
        int effective = Math.min(Math.max(asked, 1), ToolService.MAX_LIST_LIMIT);
        int from = offset == null ? 0 : Math.max(offset, 0);
        ToolEntry row = service.get(toolId);
        List<OwnershipTransfer> rows =
                service.ownershipHistory(toolId, asked, from).stream().map(this::toWire).toList();
        return ResponseEntity.ok(new OwnershipChain(
                toolId, row.getOwner(), rows, service.ownershipCount(toolId), effective, from));
    }

    /**
     * The public list of deprecated declarations, newest first, each carrying its tool's NAME. One request
     * answers "which tools are going away and what replaces them", which is the question a catalog reader has.
     */
    @GetMapping("/tools/deprecations")
    public ResponseEntity<DeprecationList> deprecations(
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        int asked = limit == null ? ToolService.DEFAULT_LIST_LIMIT : limit;
        int effective = Math.min(Math.max(asked, 1), ToolService.MAX_LIST_LIMIT);
        int from = offset == null ? 0 : Math.max(offset, 0);
        List<ToolDeprecation> rows = service.deprecationPage(asked, from);
        Map<String, ToolEntry> tools = service.byIds(rows.stream().map(ToolDeprecation::getToolId).toList());
        List<DeprecatedTool> wire = rows.stream()
                .map(row -> {
                    ToolEntry tool = tools.get(row.getToolId());
                    return new DeprecatedTool(
                            row.getToolId(),
                            tool == null ? null : tool.getName(),
                            row.getMessage(),
                            row.getReplacementName(),
                            row.getDeprecatedAt().toEpochMilli());
                })
                .toList();
        return ResponseEntity.ok(new DeprecationList(wire, service.deprecationCount(), effective, from));
    }

    /**
     * One declaration's recorded history, newest first. A public read, and a 404 when the id names nothing:
     * "no such tool" is not "a tool with no history".
     */
    @GetMapping("/tools/{toolId}/revisions")
    public ResponseEntity<ToolRevisionList> revisions(
            @PathVariable String toolId,
            @RequestParam(name = "since", required = false) Integer since,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        int asked = limit == null ? ToolService.DEFAULT_LIST_LIMIT : limit;
        int effective = Math.min(Math.max(asked, 1), ToolService.MAX_LIST_LIMIT);
        int from = offset == null ? 0 : Math.max(offset, 0);
        List<ToolRevisionView> rows = service.history(toolId, since, asked, from).stream().map(this::toWire).toList();
        return ResponseEntity.ok(new ToolRevisionList(
                toolId, ToolService.requireSince(since), rows, service.revisionCount(toolId, since), effective, from));
    }

    /**
     * Replace a declaration's summary and schema, for its owner only.
     *
     * <p>The owner is REQUIRED before anything is read, and the name is not part of the body: an update
     * changes what a declaration SAYS, not which declaration it is. A missing owner is a 400 that touches
     * nothing; an unknown id is a 404; another account's row is a 403.
     */
    @PutMapping("/tools/{toolId}")
    public ResponseEntity<?> update(
            @PathVariable String toolId,
            @RequestParam(name = "owner", required = false) String owner,
            @RequestBody(required = false) UpdateRequest request) {
        if (owner == null || owner.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid-tool",
                    "message", "the owner parameter is missing — only the owner may update a tool"));
        }
        ToolEntry row = service.update(
                toolId,
                owner,
                request == null ? null : request.summary(),
                request == null ? null : request.inputSchema());
        return ResponseEntity.ok(toWire(row));
    }

    /**
     * Remove a declaration. The owner is REQUIRED: a registry whose removal door could be opened without an
     * account would let anybody delete anybody's row by naming an id.
     *
     * <p>200 with {@code removed: true} or {@code removed: false} — an id that names nothing is already gone,
     * not an error, the same rule the webhook removal follows. A row that belongs to another account is a 403
     * from the service.
     */
    @DeleteMapping("/tools/{toolId}")
    public ResponseEntity<Map<String, Object>> remove(
            @PathVariable String toolId,
            @RequestParam(name = "owner", required = false) String owner) {
        if (owner == null || owner.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid-tool",
                    "message", "the owner parameter is missing — only the owner may remove a tool"));
        }
        boolean removed = service.remove(toolId, owner);
        return ResponseEntity.ok(Map.of("ok", true, "toolId", toolId, "removed", removed));
    }

    /**
     * The answer for a whole declaration, and the conditional read the pin makes possible.
     *
     * <p>A strong tag, not a weak one: the value is a digest of the exact contract served, so two answers that
     * carry the same tag are the same declaration to the byte. {@code *} matches any existing representation
     * (RFC 9110); anything else is compared with its {@code W/} prefix and surrounding quotes removed, because
     * a caller echoing a tag back must not have to know how this door formats it. Matching is otherwise a
     * plain string comparison, not a re-parse of every tag syntax — that bound is stated in ADR 0028.
     */
    private ResponseEntity<Tool> answer(ToolEntry row, String ifNoneMatch) {
        String pin = service.contractSha256(row);
        if (matchesPin(ifNoneMatch, pin)) {
            return ResponseEntity.status(304).eTag(pin).build();
        }
        return ResponseEntity.ok().eTag(pin).body(toWire(row, pin));
    }

    /** Whether an {@code If-None-Match} header names the pin this declaration currently serves. */
    static boolean matchesPin(String ifNoneMatch, String pin) {
        if (ifNoneMatch == null || pin == null) {
            return false;
        }
        for (String candidate : ifNoneMatch.split(",")) {
            String tag = candidate.trim();
            if (tag.isEmpty()) {
                continue;
            }
            if ("*".equals(tag)) {
                return true;
            }
            if (tag.startsWith("W/")) {
                tag = tag.substring(2).trim();
            }
            if (tag.length() >= 2 && tag.startsWith("\"") && tag.endsWith("\"")) {
                tag = tag.substring(1, tag.length() - 1);
            }
            if (tag.equals(pin)) {
                return true;
            }
        }
        return false;
    }

    private Tool toWire(ToolEntry row) {
        return toWire(row, service.contractSha256(row));
    }

    private Tool toWire(ToolEntry row, String pin) {
        return new Tool(
                row.getToolId(),
                row.getOwner(),
                row.getName(),
                row.getSummary(),
                service.schemaOf(row),
                pin,
                row.getCreatedAt().toEpochMilli());
    }

    private ToolRevisionView toWire(ToolRevision revision) {
        return new ToolRevisionView(
                revision.getRevision(),
                revision.getSummary(),
                service.schemaOf(revision),
                service.contractSha256(revision),
                revision.getRecordedAt().toEpochMilli());
    }

    private ToolChangeView toWire(ToolChange row) {
        return new ToolChangeView(
                row.getSeq(),
                row.getToolId(),
                row.getName(),
                row.getKind(),
                row.getRevision(),
                row.getChangedAt().toEpochMilli());
    }

    private OwnershipTransfer toWire(ToolOwnership row) {
        return new OwnershipTransfer(
                row.getTransfer(),
                row.getFromOwner(),
                row.getToOwner(),
                row.getTransferredAt().toEpochMilli());
    }

    private Deprecation toWire(ToolDeprecation row) {
        return new Deprecation(
                row.getToolId(),
                row.getMessage(),
                row.getReplacementName(),
                row.getDeprecatedAt().toEpochMilli());
    }

    /** A rule the caller broke is a 400 that NAMES it. */
    @ExceptionHandler(InvalidTool.class)
    public ResponseEntity<Map<String, String>> invalid(InvalidTool e) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid-tool", "message", e.getMessage()));
    }

    /** A name already held is a 409: the request was legal, the registry already has the row. */
    @ExceptionHandler(ToolNameTaken.class)
    public ResponseEntity<Map<String, String>> taken(ToolNameTaken e) {
        return ResponseEntity.status(409).body(Map.of("error", "tool-name-taken", "message", e.getMessage()));
    }

    /** Somebody else's row is a 403: the request was well-formed, the account was not the owner. */
    @ExceptionHandler(NotYourTool.class)
    public ResponseEntity<Map<String, String>> notYours(NotYourTool e) {
        return ResponseEntity.status(403).body(Map.of("error", "not-your-tool", "message", e.getMessage()));
    }

    /** A tool that is live has no deprecation: 404 under its own name, distinct from an unknown id. */
    @ExceptionHandler(UnknownDeprecation.class)
    public ResponseEntity<Map<String, String>> notDeprecated(UnknownDeprecation e) {
        return ResponseEntity.status(404).body(Map.of("error", "not-deprecated", "message", e.getMessage()));
    }

    /** An id that names nothing is a 404, not an empty row and not a 400. */
    @ExceptionHandler(UnknownTool.class)
    public ResponseEntity<Map<String, String>> unknown(UnknownTool e) {
        return ResponseEntity.status(404).body(Map.of("error", "unknown-tool", "message", e.getMessage()));
    }
}
