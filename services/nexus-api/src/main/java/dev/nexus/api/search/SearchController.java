package dev.nexus.api.search;

import dev.nexus.api.publish.PublishedProject;
import dev.nexus.api.search.SearchDtos.SearchAnswer;
import dev.nexus.api.search.SearchDtos.SearchClaim;
import dev.nexus.api.search.SearchDtos.SearchEntry;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * M7 v290 — the HTTP surface for SEARCH: {@code GET /search}.
 *
 * <p>A SEPARATE door from {@code GET /projects}, and the reason is the publish package’s own: "a search
 * is a different feature with different rules". The two answer different questions — "what is published"
 * and "which of these mention this word" — and a reader who asked the second should not have to guess
 * that the first will do.
 *
 * <p>The answer carries the SAME shape as the listing’s ({@code publications}, {@code count},
 * {@code limit}, {@code offset}), so a client that knows one knows the other.
 */
@RestController
@RequestMapping("/search")
public class SearchController {

    private final SearchService service;

    public SearchController(SearchService service) {
        this.service = service;
    }

    /**
     * The publications matching a term, newest first.
     *
     * <p>{@code q} is the term; a blank one is the plain listing. {@code limit} is the cap (clamped) and
     * {@code offset} is the window. The answer says which window it is, so a caller can tell "the 25th
     * result" from "the 25th page".
     */
    @GetMapping
    public ResponseEntity<SearchAnswer> search(
            @RequestParam(name = "q", required = false) String term,
            @RequestParam(name = "owner", required = false) String owner,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        int asked = limit == null ? SearchService.DEFAULT_SEARCH_LIMIT : limit;
        int skip = offset == null ? 0 : Math.max(offset, 0);
        List<PublishedProject> rows = service.search(term, owner, asked, skip);
        List<SearchEntry> entries = rows.stream()
                .map(row -> new SearchEntry(
                        row.getProjectId(),
                        row.getTitle(),
                        row.getVersion(),
                        row.getPublishedAt(),
                        urlFor(row.getProjectId()),
                        claimOf(row)))
                .toList();
        return ResponseEntity.ok(new SearchAnswer(
                entries,
                entries.size(),
                Math.min(Math.max(asked, 0), SearchService.MAX_SEARCH_LIMIT),
                skip));
    }

    /**
     * The URL that serves a publication, built from the request that asked — the same rule the publish
     * controller follows, so a search result points at an address that actually serves it.
     */
    private static String urlFor(String projectId) {
        return ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/projects/{projectId}")
                .buildAndExpand(projectId)
                .toUriString();
    }

    /** The claim on the row, or null when the row names nobody. */
    private static SearchClaim claimOf(PublishedProject row) {
        if (row.getOwnerAccountId() == null || row.getOwnerAccountId().isBlank()) {
            return null;
        }
        return new SearchClaim(
                row.getOwnerAccountId(),
                row.getOwnerHandle(),
                row.getOwnerAssurance(),
                row.getOwnerClaimedAt() == null ? null : row.getOwnerClaimedAt().toEpochMilli());
    }
}
