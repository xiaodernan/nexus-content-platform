package dev.nexus.api.publish;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Publishing, as four rules.
 *
 * <p>The service owns what a publication IS; the controller owns only HTTP. Each rule below exists because
 * the alternative would let the service record something it cannot stand behind:
 *
 * <ol>
 *   <li>A project id must be a usable path segment — not blank, not absurdly long, no control characters.
 *       A row keyed by a blank id is a row nothing can address.
 *   <li>A title must be non-blank. A publication with no title is one the Studio would have to name itself,
 *       and a name the SERVER invented is not a fact about the project.
 *   <li>The document must be a JSON OBJECT. Not "valid JSON" — a bare `42` parses and is not a design
 *       document. This is the one place the service looks INSIDE the payload, and it is a shape check
 *       rather than an interpretation: the bytes are stored verbatim afterwards.
 *   <li>Re-publishing the same id UPDATES the row and increments its version. It never creates a second
 *       row, because "the publication of project X" must have exactly one answer.
 * </ol>
 *
 * <p>{@link Clock} is injected rather than calling {@code Instant.now()} inline, so a test can pin the
 * instant it publishes at — the same discipline the rest of this repo uses for anything time-shaped.
 */
@Service
public class PublishService {

    /** Long enough for a real id, short enough that it cannot be used to fill the table with one row. */
    static final int MAX_PROJECT_ID_LENGTH = 200;
    static final int MAX_TITLE_LENGTH = 500;

    private final PublishedProjectRepository repository;
    private final ObjectMapper mapper;
    private final Clock clock;

    public PublishService(PublishedProjectRepository repository, ObjectMapper mapper, Clock clock) {
        this.repository = repository;
        this.mapper = mapper;
        this.clock = clock;
    }

    /** The current publication of {@code projectId}, or empty when nothing has been published. */
    @Transactional(readOnly = true)
    public Optional<PublishedProject> find(String projectId) {
        return repository.findById(projectId);
    }

    /**
     * Publish {@code projectId} at the given title and document, creating version 1 or incrementing the
     * version of the row that is already there.
     *
     * @throws InvalidPublication when a rule above is broken — the controller turns that into a 400 naming
     *     the rule, rather than a 500 that says nothing.
     */
    @Transactional
    public PublishedProject publish(String projectId, String title, String documentJson) {
        requireUsableId(projectId);
        requireTitle(title);
        requireJsonObject(documentJson);

        // TRUNCATED TO MICROSECONDS, which is what PostgreSQL stores. `Clock.instant()` on this JDK carries
        // nanoseconds, so the receipt used to report `…01.824829200Z` while the row read back as
        // `…01.824829Z` — the receipt claiming six digits of precision the database had already dropped.
        // Measured by the proof, which compares the two. A publication's instant is what was RECORDED.
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        PublishedProject row = repository.findById(projectId).orElse(null);
        if (row == null) {
            return repository.save(new PublishedProject(projectId, title.trim(), documentJson, 1, now));
        }
        row.republish(title.trim(), documentJson, now);
        return repository.save(row);
    }

    private static void requireUsableId(String projectId) {
        if (projectId == null || projectId.isBlank()) {
            throw new InvalidPublication("project id must not be blank");
        }
        if (projectId.length() > MAX_PROJECT_ID_LENGTH) {
            throw new InvalidPublication("project id must be at most " + MAX_PROJECT_ID_LENGTH + " characters, got " + projectId.length());
        }
        for (int i = 0; i < projectId.length(); i++) {
            if (Character.isISOControl(projectId.charAt(i))) {
                throw new InvalidPublication("project id must not contain control characters");
            }
        }
    }

    private static void requireTitle(String title) {
        if (title == null || title.isBlank()) {
            throw new InvalidPublication("title must not be blank");
        }
        if (title.length() > MAX_TITLE_LENGTH) {
            throw new InvalidPublication("title must be at most " + MAX_TITLE_LENGTH + " characters, got " + title.length());
        }
    }

    private void requireJsonObject(String documentJson) {
        if (documentJson == null || documentJson.isBlank()) {
            throw new InvalidPublication("document must not be blank");
        }
        final JsonNode parsed;
        try {
            parsed = mapper.readTree(documentJson);
        } catch (JsonProcessingException e) {
            // The parser's own message is included: it names the offset, and a caller debugging a publish
            // needs that more than it needs our sentence.
            throw new InvalidPublication("document must be valid JSON: " + e.getOriginalMessage());
        }
        if (parsed == null || !parsed.isObject()) {
            throw new InvalidPublication("document must be a JSON object, got " + (parsed == null ? "nothing" : parsed.getNodeType().toString().toLowerCase()));
        }
    }
}
