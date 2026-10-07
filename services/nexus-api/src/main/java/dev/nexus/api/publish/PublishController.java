package dev.nexus.api.publish;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.nexus.api.publish.PublishDtos.Publication;
import dev.nexus.api.publish.PublishDtos.PublishRequest;
import dev.nexus.api.publish.PublishDtos.Receipt;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
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
        PublishedProject saved = service.publish(projectId, request == null ? null : request.title(), documentJson);

        Receipt receipt = new Receipt(saved.getProjectId(), saved.getTitle(), saved.getVersion(), saved.getPublishedAt(), urlFor(saved.getProjectId()));
        return ResponseEntity.status(alreadyPublished ? HttpStatus.OK : HttpStatus.CREATED).body(receipt);
    }

    @GetMapping("/{projectId}")
    public ResponseEntity<Publication> read(@PathVariable String projectId) {
        return service.find(projectId)
                .map(row -> ResponseEntity.ok(new Publication(row.getProjectId(), row.getTitle(), row.getVersion(), row.getPublishedAt(), urlFor(row.getProjectId()), parseDocument(row.getDocumentJson()))))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /** A rule the caller broke is a 400 that NAMES it. Anything else is a 500 and says nothing. */
    @ExceptionHandler(InvalidPublication.class)
    public ResponseEntity<Map<String, String>> invalid(InvalidPublication e) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid-publication", "message", e.getMessage()));
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
}
