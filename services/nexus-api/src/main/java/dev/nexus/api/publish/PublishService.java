package dev.nexus.api.publish;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.nexus.api.publish.PublishDtos.OwnerClaim;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.PageRequest;
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
 *   <li>The document must be a JSON OBJECT. Not "valid JSON" — a bare {@code 42} parses and is not a design
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

    // === v242: the owner claim's own limits ===

    /** Matches the Studio's {@code createAccountId} output width with room for a different derivation later. */
    static final int MAX_ACCOUNT_ID_LENGTH = 200;
    /** Matches {@code HANDLE_RULES.maxLength} in the Studio's account core, so a legal handle always fits. */
    static final int MAX_HANDLE_LENGTH = 24;

    /**
     * The only assurance this service accepts. The client can honestly produce exactly one value, and
     * widening this set is what "the service now verifies claims" would MEAN — so it is one constant
     * rather than a string compared inline, and the refusal names it.
     */
    static final String UNSIGNED_LOCAL = "unsigned-local";

    private static final java.util.Set<String> KNOWN_ASSURANCES = java.util.Set.of(UNSIGNED_LOCAL);

    private final PublishedProjectRepository repository;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final dev.nexus.api.ops.AuditService audit;

    public PublishService(
            PublishedProjectRepository repository,
            ObjectMapper objectMapper,
            Clock clock,
            dev.nexus.api.ops.AuditService audit) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.clock = clock;
        this.audit = audit;
    }

    /**
     * The current publication of {@code projectId}, or empty when nothing has been published.
     */
    @Transactional(readOnly = true)
    public Optional<PublishedProject> find(String projectId) {
        return repository.findById(projectId);
    }

    /** How many publications a listing answers with when the caller names no limit. */
    public static final int DEFAULT_LIST_LIMIT = 20;
    /**
     * The most a caller may ask for. A cap rather than paging: this slice answers "what is published", and a
     * caller that wants the 5000th publication is asking a different question (search) that this service
     * does not answer yet. Without a cap, one request could read the whole table.
     */
    public static final int MAX_LIST_LIMIT = 100;

    /**
     * The newest publications first, at most {@code limit} of them.
     *
     * <p>The limit is clamped rather than refused: a caller asking for 10 000 gets the cap, because "as many
     * as you will give me" is a legitimate thing to mean and a 400 would make them guess the number. A
     * NON-POSITIVE limit is refused, because there is no honest reading of "give me fewer than one".
     */
    @Transactional(readOnly = true)
    public List<PublishedProject> list(int limit) {
        return list(limit, null);
    }

    /**
     * v270 — the listing, narrowed to one OWNER when the caller names one.
     *
     * <p>A PROFILE is "what has this account published", and the service is the only party that can answer it:
     * the owner is a COLUMN on the row, and the client holds no index of what anybody published. The same
     * rules apply as for the unfiltered listing — the limit is clamped rather than refused, and a non-positive
     * one is refused by name.
     *
     * <p>A blank owner is NOT an owner: it is the absence of one, and asking for "the publications of nobody"
     * is answered with an EMPTY list rather than with the whole table. That distinction is the difference
     * between a profile and a leak.
     */
    @Transactional(readOnly = true)
    public List<PublishedProject> list(int limit, String ownerAccountId) {
        if (limit <= 0) {
            throw new InvalidPublication("limit must be a positive number, got " + limit);
        }
        int effective = Math.min(limit, MAX_LIST_LIMIT);
        if (ownerAccountId == null) {
            return repository.findAllByOrderByPublishedAtDesc(PageRequest.of(0, effective));
        }
        String owner = ownerAccountId.trim();
        if (owner.isEmpty()) {
            return List.of();
        }
        return repository.findByOwnerAccountIdOrderByPublishedAtDesc(owner, PageRequest.of(0, effective));
    }

    /**
     * Take a publication down. Answers {@code false} for an id that has none — the repository's own answer,
     * not an error, because a missing file and an empty one are different problems and this reader will not
     * guess which was meant.
     */
    @Transactional
    public boolean unpublish(String projectId, String claimerAccountId) {
        requireUsableId(projectId);
        Optional<PublishedProject> row = repository.findById(projectId);
        if (row.isEmpty()) {
            return false;
        }
        PublishedProject publication = row.get();
        // v242: the OWNER rule. A row that names an owner may only be taken down by that owner; a row that
        // names none stays under the pre-v242 rule, because locking an anonymous publication to nobody
        // would make every publication ever written unpublishable by anybody -- a worse fault than the one
        // this increment fixes. {@code claimerAccountId == null} (the caller named nobody) is the same as
        // naming the wrong person for an owned publication.
        if (!publication.isOwnedBy(claimerAccountId)) {
            throw new NotTheOwner(
                    "publication " + projectId + " is claimed by account " + publication.getOwnerAccountId()
                            + "; a caller that is not that account may not take it down");
        }
        repository.deleteById(projectId);
        // v271 — the take-down names an account id and NOTHING else: the request carried a CLAIMER, not a
        // claim, so the service never saw a handle or an assurance for it and records none rather than
        // borrowing the publication's.
        audit.record("unpublish", claimerAccountId, null, null, projectId, dev.nexus.api.ops.AuditService.TARGET_PUBLICATION);
        return true;
    }

    /**
     * Publish {@code projectId} at the given title and document, creating version 1 or incrementing the
     * version of the row that is already there.
     *
     * @throws InvalidPublication when a rule above is broken — the controller turns that into a 400 naming
     *     the rule, rather than a 500 that says nothing.
     */
    @Transactional
    public PublishedProject publish(String projectId, String title, String documentJson, OwnerClaim claim) {
        requireUsableId(projectId);
        requireTitle(title);
        requireJsonObject(documentJson);

        // TRUNCATED TO MICROSECONDS, which is what PostgreSQL stores. A publication's instant is what was
        // RECORDED, and the proof compares the receipt against the row to say so.
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        PublishedProject row = repository.findById(projectId).orElse(null);
        if (row == null) {
            PublishedProject created = new PublishedProject(projectId, title.trim(), documentJson, 1, now);
            if (claim != null) {
                requireClaimable(claim);
                created.claimOwner(claim.accountId(), claim.handle(), claim.assurance(), claimedInstantOf(claim));
            }
            PublishedProject saved = repository.save(created);
            // v271 — the AUDIT TRAIL. The actor is recorded exactly as it was received: a claim carries an
            // account id, a handle and an assurance, and an anonymous publish carries none — and an entry
            // with no actor is a real entry, not a missing one.
            audit.record(
                    "publish",
                    claim == null ? null : claim.accountId(),
                    claim == null ? null : claim.handle(),
                    claim == null ? null : claim.assurance(),
                    projectId,
                    dev.nexus.api.ops.AuditService.TARGET_PUBLICATION);
            return saved;
        }
        // v242: the TAKEOVER rule. A row that already names an owner may not be re-published under a
        // DIFFERENT one. "The publication of project X" must have exactly one owner, exactly as it has
        // exactly one version, and letting a second caller quietly become the author of somebody else's
        // work is the fault the whole bound was describing. Re-publishing with the SAME account is the
        // ordinary path; re-publishing naming nobody keeps the owner the row already has, because a
        // client that stopped naming its author must not silently orphan a publication.
        if (claim != null) {
            requireClaimable(claim);
            if (row.hasOwner() && !row.getOwnerAccountId().equals(claim.accountId())) {
                throw new OwnerTaken(
                        "publication " + projectId + " is claimed by account " + row.getOwnerAccountId()
                                + "; a publish naming account " + claim.accountId() + " would move it");
            }
            row.claimOwner(claim.accountId(), claim.handle(), claim.assurance(), claimedInstantOf(claim));
        }
        row.republish(title.trim(), documentJson, now);
        PublishedProject saved = repository.save(row);
        // v271 — a re-publish is an event too: the publication CHANGED, and a trail that only remembered
        // creations would not say so.
        audit.record(
                "publish",
                claim == null ? null : claim.accountId(),
                claim == null ? null : claim.handle(),
                claim == null ? null : claim.assurance(),
                projectId,
                dev.nexus.api.ops.AuditService.TARGET_PUBLICATION);
        return saved;
    }

    /**
     * v243 — remix a publication into a new project.
     *
     * <p>The remix forks the source publication's document into a new project id. The source project's
     * document is used as the source for the new publication. The remix records its lineage by storing
     * the source project id in the new row's metadata (the service does not have a dedicated lineage
     * column yet; the remix records the source in the document JSON itself under a reserved key, and
     * the service can be extended with a dedicated lineage column in a future increment).
     *
     * @param sourceProjectId the project id of the publication to remix
     * @param newProjectId the new project id (optional; if null or blank, a fresh one is generated)
     * @return the remix receipt, or empty if the source project does not exist
     */
    @Transactional
    public Optional<PublishedProject> remix(String sourceProjectId, String newProjectId) {
        Optional<PublishedProject> source = find(sourceProjectId);
        if (source.isEmpty()) {
            return Optional.empty();
        }
        String targetId = (newProjectId != null && !newProjectId.isBlank()) ? newProjectId : "remix-" + java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 20);
        if (repository.existsById(targetId)) {
            throw new InvalidPublication("remix target project id already exists: " + targetId);
        }
        String sourceDocumentJson = source.get().getDocumentJson();
        // Embed the lineage in the document under a reserved key so the lineage travels with the document.
        // The document is a JSON object; we add a reserved key `_lineage` that the client can read.
        ObjectMapper objectMapper = this.objectMapper;
        JsonNode documentJsonNode;
        try {
            documentJsonNode = objectMapper.readTree(source.get().getDocumentJson());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("source document is not valid JSON", e);
        }
        ObjectNode documentNode = (ObjectNode) documentJsonNode;
        ObjectNode lineageNode = objectMapper.createObjectNode();
        lineageNode.put("sourceProjectId", source.get().getProjectId());
        lineageNode.put("remixedAt", clock.instant().truncatedTo(ChronoUnit.MICROS).toString());
        documentNode.set("_lineage", lineageNode);
        String newDocumentJson;
        try {
            newDocumentJson = objectMapper.writeValueAsString(documentNode);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("failed to serialize remixed document", e);
        }
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        PublishedProject created = new PublishedProject(targetId, source.get().getTitle() + " (remix)", newDocumentJson, 1, clock.instant().truncatedTo(ChronoUnit.MICROS));
        // The remix does NOT inherit the owner claim — the remixer becomes the author.
        return Optional.of(repository.save(created));
    }

    /**
     * v242: the SHAPE rule for an owner claim.
     *
     * <p>This checks that a claim is a claim — an account id, a handle, an assurance this build knows,
     * and an instant. It does NOT check that the account exists, because this service holds no accounts;
     * that is what ADR 0018 records and what the {@code assurance} field says out loud.
     *
     * <p>A failed restore leaves nothing half-landed: every sequence this call registered is removed again
     * before the throw. The save shape has no field for the flag — a case asserts exactly that, because it
     * is WHY the restore has to take the value from the config. A rendering flag is a runtime setting, not
     * entity state.
     */
    private static void requireClaimable(OwnerClaim claim) {
        if (claim == null) {
            throw new InvalidPublication("owner must be null or a complete claim, not a half one");
        }
        if (claim.accountId() == null || claim.accountId().isBlank()) {
            throw new InvalidPublication("owner claim must name an account id");
        }
        if (claim.accountId().length() > MAX_ACCOUNT_ID_LENGTH) {
            throw new InvalidPublication("owner account id must be at most " + MAX_ACCOUNT_ID_LENGTH + " characters, got " + claim.accountId().length());
        }
        if (claim.handle() == null || claim.handle().isBlank()) {
            throw new InvalidPublication("owner claim must name a handle");
        }
        if (claim.handle().length() > MAX_HANDLE_LENGTH) {
            throw new InvalidPublication("owner handle must be at most " + MAX_HANDLE_LENGTH + " characters, got " + claim.handle().length());
        }
        if (claim.claimedAt() == null) {
            throw new InvalidPublication("owner claim must name when it was made");
        }
        // v242 (suite-found): a null assurance must be refused, not crash. {@code Set.of(...).contains(null)}
        // THROWS NPE rather than answering false, so the null check comes first — a crash is neither the
        // named refusal the caller needs nor the "records claims and verifies nothing" sentence.
        if (claim.assurance() == null || !KNOWN_ASSURANCES.contains(claim.assurance())) {
            throw new InvalidPublication(
                    "owner assurance is " + (claim.assurance() == null ? "nothing" : "\"" + claim.assurance() + "\"")
                            + "; this service records claims and verifies nothing, so \"" + UNSIGNED_LOCAL + "\" is the only value it accepts");
        }
    }

    /**
     * The claim's instant as the row stores it. The claim states MILLISECONDS since the epoch (the client's
     * own unit, and the one `PublishDtos.OwnerClaim` documents); the row stores an {@link Instant}.
     *
     * <p>No range check, and the reason is worth stating rather than leaving to a reader: every
     * {@code long} number of milliseconds is inside {@link Instant}'s range (a {@code long} of milliseconds
     * is at most ±292 million years, and an {@code Instant} reaches ±1 billion), so a "is this a real
     * instant" guard could never fire — a rule that cannot fire is not a rule, it is a comment. What the
     * service does NOT do is compare the claimed instant against its own clock: the assurance rule says this
     * service records claims and verifies nothing, and the instant is part of the claim.
     */
    private static Instant claimedInstantOf(OwnerClaim claim) {
        return Instant.ofEpochMilli(claim.claimedAt());
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
            parsed = objectMapper.readTree(documentJson);
        } catch (JsonProcessingException e) {
            throw new InvalidPublication("document must be valid JSON: " + e.getOriginalMessage());
        }
        if (parsed == null || !parsed.isObject()) {
            throw new InvalidPublication("document must be a JSON object, got " + (parsed == null ? "nothing" : parsed.getNodeType().toString().toLowerCase()));
        }
    }
}