package dev.nexus.api.search;

import dev.nexus.api.publish.PublishedProject;
import dev.nexus.api.publish.PublishedProjectRepository;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * M7 v290 — SEARCH: the publication listing, narrowed by a word.
 *
 * <p>The service had a listing and no way to narrow it, so a reader looking for one publication had to
 * page through every window of the newest-first listing and hope. The publish package’s own comment
 * said the reason it had no finder: "a search is a different feature with different rules" — and this is
 * that feature, in its own door.
 *
 * <p><b>The rules, and they are the feature:</b>
 *
 * <ul>
 *   <li><b>A BLANK query is the plain listing</b>, not an error. "Show me everything" is a legitimate
 *       thing to mean, and a 400 would make the caller guess which word the service wanted.
 *   <li><b>The search reaches into the DOCUMENT</b>, not only the title. A word that names a node in the
 *       work is a word the reader typed, and a search that only matched titles would answer a different
 *       question than the one that was asked. The cost is stated rather than hidden: this is a sequential
 *       scan over a text column, and a table big enough for that to matter wants an index.
 *   <li><b>The cap is CLAMPED</b> and the window is the caller’s, exactly as the listing’s rules are — the
 *       search is the same listing with a filter, and a filter that changed the rules would make the two
 *       disagree.
 * </ul>
 */
@Service
public class SearchService {

    /** The most results one answer may carry. The cap is CLAMPED, like every cap in this service. */
    public static final int MAX_SEARCH_LIMIT = 100;

    /** How many results an answer carries when the caller names no limit. */
    public static final int DEFAULT_SEARCH_LIMIT = 20;

    /** The order every search answers in: newest first, like the listing it is a filter of. */
    private static final Sort NEWEST_FIRST = Sort.by(Sort.Direction.DESC, "publishedAt");

    private final PublishedProjectRepository repository;

    public SearchService(PublishedProjectRepository repository) {
        this.repository = repository;
    }

    /**
     * The publications matching a term, newest first.
     *
     * <p>A blank term answers with the WHOLE listing (the same rows, the same order, the same cap) —
     * because a search with nothing to search for is a listing, and the service says so rather than
     * refusing.
     */
    @Transactional(readOnly = true)
    public List<PublishedProject> search(String term, String ownerAccountId, int limit, int offset) {
        int asked = limit <= 0 ? DEFAULT_SEARCH_LIMIT : Math.min(limit, MAX_SEARCH_LIMIT);
        int skip = Math.max(offset, 0);
        Pageable window = new SearchWindow(skip, asked, NEWEST_FIRST);
        String trimmed = term == null ? "" : term.trim();
        String owner = ownerAccountId == null ? null : ownerAccountId.trim();
        if (trimmed.isEmpty()) {
            return owner == null || owner.isEmpty()
                    ? repository.findAllByOrderByPublishedAtDesc(window)
                    : repository.findByOwnerAccountIdOrderByPublishedAtDesc(owner, window);
        }
        if (owner == null || owner.isEmpty()) {
            return repository.findByTextContaining(trimmed, window);
        }
        return repository.findByOwnerAndTextContaining(owner, trimmed, window);
    }
}
