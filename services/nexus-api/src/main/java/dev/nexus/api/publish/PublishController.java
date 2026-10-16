package dev.nexus.api.publish;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.nexus.api.publish.PublishDtos.Listing;
import dev.nexus.api.publish.PublishDtos.ListingEntry;
import dev.nexus.api.publish.PublishDtos.OwnerClaim;
import dev.nexus.api.publish.PublishDtos.Publication;
import dev.nexus.api.publish.PublishDtos.PublishRequest;
import dev.nexus.api.publish.PublishDtos.Receipt;
import dev.nexus.api.publish.PublishDtos.Removal;
import dev.nexus.api.publish.PublishDtos.RemixRequest;
import dev.nexus.api.publish.PublishDtos.RemixReceipt;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.HttpStatus;
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
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * The slice's whole HTTP surface: publish one project, read it back.
 *
 * <p><strong>The URL is built from the request that asked.</strong> {@code ServletUriComponentsBuilder}
 * composes it from this server's own scheme/host/port, so the receipt names an address that actually serves
 * the publication — not a configured "public base" that could point somewhere nothing is listening. That
 * also makes the bound honest: <em>this is this server's URL</em>, and there is no CDN, no rewrite rule and
 * no custom domain behind it (§60).
 *
 * <p>A created publication answers 201 and an updated one 200. Both carry the same receipt shape; the status
 * is the difference between "this id was new" and "this id already had a publication", which a caller
 * syncing a Studio document wants to know.
 */
@RestController
@RequestMapping("/projects")
public class PublishController {

    private final PublishService service;
    private final ObjectMapper mapper;

    public PublishController(PublishService service, ObjectMapper mapper) {
        this.service = service;
        this.mapper = mapper;
    }

    @PostMapping("/{projectId}/publish")
    public ResponseEntity<Receipt> publish(@PathVariable String projectId, @RequestBody(required = false) PublishRequest request) {
        boolean alreadyPublished = service.find(projectId).isPresent();
        // The document crosses the HTTP boundary as a JSON OBJECT and reaches the service as TEXT. The
        // service owns what a document must BE; this adapter only changes its representation. A missing or
        // JSON-null document is passed through as null so the service's own rule names the problem rather
        // than a Jackson error describing a type.
        String documentJson = request == null || request.document() == null || request.document().isNull()
                ? null
                : request.document().toString();
        PublishedProject saved = service.publish(projectId, request == null ? null : request.title(), documentJson, request == null ? null : request.owner());

        Receipt receipt = new Receipt(saved.getProjectId(), saved.getTitle(), saved.getVersion(), saved.getPublishedAt(), urlFor(saved.getProjectId()), claimOf(saved));
        return ResponseEntity.status(alreadyPublished ? HttpStatus.OK : HttpStatus.CREATED).body(receipt);
    }

    @GetMapping("/{projectId}")
    public ResponseEntity<Publication> read(@PathVariable String projectId) {
        return service.find(projectId)
                .map(row -> ResponseEntity.ok(new Publication(row.getProjectId(), row.getTitle(), row.getVersion(), row.getPublishedAt(), urlFor(row.getProjectId()), parseDocument(row.getDocumentJson()), claimOf(row))))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * What is published, newest first, capped.
     *
     * <p>The cap is CLAMPED rather than refused (asking for 10 000 gets {@link PublishService#MAX_LIST_LIMIT})
     * but a non-positive limit is a 400: there is no honest reading of "give me fewer than one". The answer
     * carries `count` AND `limit` so a caller can tell "there are twenty" from "there are at least twenty".
     */
    @GetMapping
    public ResponseEntity<Listing> list(@RequestParam(name = "limit", required = false) Integer limit) {
        int asked = limit == null ? PublishService.DEFAULT_LIST_LIMIT : limit;
        List<ListingEntry> entries = service.list(asked).stream()
                .map(row -> new ListingEntry(row.getProjectId(), row.getTitle(), row.getVersion(), row.getPublishedAt(), urlFor(row.getProjectId()), claimOf(row)))
                .toList();
        return ResponseEntity.ok(new Listing(entries, entries.size(), Math.min(Math.max(asked, 0), PublishService.MAX_LIST_LIMIT)));
    }

    /**
     * Take a publication down. 200 with `removed: false` when there was nothing to take down — the same
     * "already gone is not an error" rule the Studio's own disk lane uses — and 200 with `removed: true`
     * when a row was deleted. There is no 404: the URL names a project, not a resource that must exist.
     */
    @DeleteMapping("/{projectId}")
    public ResponseEntity<Removal> unpublish(
            @PathVariable String projectId,
            @RequestParam(name = "claimer", required = false) String claimerAccountId) {
        // v242: the claim arrives as a QUERY PARAMETER, not a body — a DELETE with no body is the
        // conventional shape, and the parameter can be omitted entirely (which for a publication that
        // names nobody is exactly the answer it deserves).
        return ResponseEntity.ok(new Removal(projectId, service.unpublish(projectId, claimerAccountId)));
    }

    /**
     * A rule the caller broke is a 400 that NAMES it. Anything else is a 500 and says nothing.
     */
    @ExceptionHandler(InvalidPublication.class)
    public ResponseEntity<Map<String, String>> invalid(InvalidPublication e) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid-publication", "message", e.getMessage()));
    }
    /**
     * v242: a caller who is not the owner, and a re-publish that would move the owner (ADR 0018).
     *
     * <p>403 rather than 400, and deliberately not a subtype of {@link InvalidPublication}: the request
     * was well-formed, so a 400 would tell the caller to fix a field that is fine. 403 means
     * <em>understood, and no</em>, which is exactly what this service can honestly say — it knows two
     * account ids are not equal, and it does NOT know whether either of them is real. The `error` code
     * names which of the two refusals it was, so a Studio can tell "you may not" from "you would move it"
     * without matching on a sentence.
     */
    @ExceptionHandler({ NotTheOwner.class, OwnerTaken.class })
    public ResponseEntity<Map<String, String>> notTheOwner(RuntimeException e) {
        String error = e instanceof OwnerTaken ? "owner-taken" : "not-the-owner";
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", error, "message", e.getMessage()));
    }


    /**
     * The row's claim as the wire shape, or {@code null} when the row names nobody.
     *
     * <p>One mapper for all three answers (receipt, read, listing), because three copies would drift the
     * day a field is added — and the field that must never drift is {@code assurance}.
     */
    private static OwnerClaim claimOf(PublishedProject row) {
        if (!row.hasOwner()) {
            return null;
        }
        return new OwnerClaim(row.getOwnerAccountId(), row.getOwnerHandle(), row.getOwnerAssurance(), row.getOwnerClaimedAt());
    }

    private String urlFor(String projectId) {
        return ServletUriComponentsBuilder.fromCurrentContextPath().path("/projects/{projectId}").buildAndExpand(projectId).toUriString();
    }

    /**
     * The stored document as JSON, not as a string.
     *
     * <p>The column holds TEXT and the response must not: a document returned as an escaped string is the
     * classic double-encoding bug, and a caller would have to parse it twice to use it. The service already
     * proved it parses as an object on the way IN, so a failure here would mean the row was written by
     * something other than this service — which is worth an exception rather than a silent null.
     */
    private Object parseDocument(String documentJson) {
        try {
            return mapper.readTree(documentJson);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("a stored publication is not valid JSON; the row was not written by this service", e);
        }
    }

    /**
     * v243 — remix a publication into a new project.
     *
     * <p>The remix forks a publication's document into a new project id. The source publication's
     * document is used as the source for the new publication. The remix records its lineage by
     * storing the source project id in the new row's document (under a reserved key `_lineage`).
     *
     * <p>The request body may optionally provide a new project id; if omitted, a fresh one is generated.
     * The remix records its lineage by storing the source project id in the document JSON under
     * a reserved key `_lineage` (which the client can read back).
     */
    @PostMapping("/{projectId}/remix")
    public ResponseEntity<RemixReceipt> remix(
            @PathVariable String projectId,
            @RequestBody(required = false) RemixRequest request) {
        String targetId = (request != null && request.newProjectId() != null && !request.newProjectId().isBlank())
                ? request.newProjectId()
                : "remix-" + java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 20);
        Optional<PublishedProject> remixed = service.remix(projectId, targetId);
        if (remixed.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        PublishedProject remixedProject = remixed.get();
        RemixReceipt receipt = new RemixReceipt(
                remixedProject.getProjectId(),
                remixedProject.getTitle(),
                remixedProject.getVersion(),
                remixedProject.getPublishedAt(),
                urlFor(remixedProject.getProjectId()),
                projectId);
        return ResponseEntity.status(HttpStatus.CREATED).body(receipt);
    }
}