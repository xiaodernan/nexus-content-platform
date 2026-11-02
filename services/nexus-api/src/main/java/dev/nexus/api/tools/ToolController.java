package dev.nexus.api.tools;

import dev.nexus.api.tools.ToolDtos.RegisterRequest;
import dev.nexus.api.tools.ToolDtos.Tool;
import dev.nexus.api.tools.ToolDtos.ToolList;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * M10 v571 — the HTTP surface for the tool registry. Three doors, and the differences between them are the
 * rules:
 *
 * <ul>
 *   <li>{@code POST /tools} — declare a tool. 201, and the answer is the row: its id, owner, name, summary,
 *       canonical schema and creation instant.
 *   <li>{@code GET /tools?owner=&limit=&offset=} — the catalog, name ascending. The optional owner narrows
 *       the window to one account's declarations; without it the answer is the whole registry. The count is
 *       the whole (narrowed) number, so a window can say what it is hiding.
 *   <li>{@code DELETE /tools/{id}?owner=} — remove a declaration, for its owner only. 200 either way: an id
 *       that names nothing is "already gone", not an error; another account's row is a 403.
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
     * The catalog. A missing or blank {@code owner} is the WHOLE registry rather than a refusal: this is a
     * read of a public catalog, and there is no ownership to enforce on it.
     */
    @GetMapping("/tools")
    public ResponseEntity<ToolList> list(
            @RequestParam(name = "owner", required = false) String owner,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        int asked = limit == null ? ToolService.DEFAULT_LIST_LIMIT : limit;
        int effective = Math.min(Math.max(asked, 1), ToolService.MAX_LIST_LIMIT);
        int from = offset == null ? 0 : Math.max(offset, 0);
        String filter = ToolService.normalizeOwner(owner);
        List<Tool> rows = service.catalog(owner, asked, from).stream().map(this::toWire).toList();
        return ResponseEntity.ok(new ToolList(filter, rows, service.countOf(owner), effective, from));
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

    private Tool toWire(ToolEntry row) {
        return new Tool(
                row.getToolId(),
                row.getOwner(),
                row.getName(),
                row.getSummary(),
                service.schemaOf(row),
                row.getCreatedAt().toEpochMilli());
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
}
