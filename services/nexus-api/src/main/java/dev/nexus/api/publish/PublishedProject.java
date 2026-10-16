package dev.nexus.api.publish;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * A published project: ONE row per project id, replaced on re-publish.
 *
 * <p>Deliberately one table and one natural key. The Studio's project id IS the key — there is no separate
 * surrogate id, because a second identifier would let a caller publish the same project twice under two
 * names and the service would have no way to say which row is "the" publication.
 *
 * <p>{@code documentJson} is stored VERBATIM. This service is a record, not an interpreter: it does not
 * parse the design document beyond checking that it IS a JSON object, and it does not migrate, project or
 * summarise it. A row read back is the bytes that were published.
 */
@Entity
@Table(name = "published_project")
public class PublishedProject {

    /** The project's own id. Not generated here — the caller owns it, and a re-publish must find this row. */
    @Id
    @Column(name = "project_id", nullable = false, updatable = false, length = 200)
    private String projectId;

    @Column(name = "title", nullable = false, length = 500)
    private String title;

    /** The design document, verbatim. `text` because a document is not a short string. */
    @Column(name = "document_json", nullable = false, columnDefinition = "text")
    private String documentJson;

    /** Incremented on every publish of this project id. Starts at 1, so 0 is never a real version. */
    @Column(name = "version", nullable = false)
    private int version;

    /** When this version was published. Replaced on re-publish — the row is the CURRENT publication. */
    @Column(name = "published_at", nullable = false)
    private Instant publishedAt;

    // === M7 v242: the OWNER CLAIM (ADR 0018) ===

    /**
     * The account id this publication claims to belong to. NULLABLE, and that is the whole
     * compatibility story: every row written before v242 has no owner, and a row with no owner is
     * answered under the pre-v242 rule (anyone may take it down) rather than being locked to nobody.
     *
     * <p>It is a CLAIM. This service does not verify it — nothing here can — and ADR 0018 records why
     * recording an unverified claim is still worth doing: it makes the CONSISTENCY rules below possible,
     * and it puts the author's name on the row a remix will later be able to read. It does not stop an
     * attacker, and the receipt says so in the assurance field rather than in a sentence a reader must
     * find.
     */
    @Column(name = "owner_account_id", length = 200)
    private String ownerAccountId;

    /** The handle the claim carried. Stored beside the id because a remix wants a NAME, and an id is not one. */
    @Column(name = "owner_handle", length = 24)
    private String ownerHandle;

    /** What the claim was worth when it arrived. `unsigned-local` in this build; the field is where a
     *  verified claim will say something different. */
    @Column(name = "owner_assurance", length = 32)
    private String ownerAssurance;

    /** When the claim was made by its author — not when this row was written. */
    @Column(name = "owner_claimed_at")
    private Instant ownerClaimedAt;

    protected PublishedProject() {
        // JPA needs it; the service never builds one without values.
    }

    public PublishedProject(String projectId, String title, String documentJson, int version, Instant publishedAt) {
        this.projectId = projectId;
        this.title = title;
        this.documentJson = documentJson;
        this.version = version;
        this.publishedAt = publishedAt;
    }

    public String getProjectId() {
        return projectId;
    }

    public String getTitle() {
        return title;
    }

    public String getDocumentJson() {
        return documentJson;
    }

    public int getVersion() {
        return version;
    }

    public Instant getPublishedAt() {
        return publishedAt;
    }

    public String getOwnerAccountId() {
        return ownerAccountId;
    }

    public String getOwnerHandle() {
        return ownerHandle;
    }

    public String getOwnerAssurance() {
        return ownerAssurance;
    }

    public Instant getOwnerClaimedAt() {
        return ownerClaimedAt;
    }

    /** Whether this row names an owner at all. A pre-v242 row answers false, and false means "anyone". */
    public boolean hasOwner() {
        return ownerAccountId != null && !ownerAccountId.isBlank();
    }

    /**
     * Whether {@code accountId} may act on this publication as its owner.
     *
     * <p>A row with NO owner answers true for everyone — the pre-v242 rule, kept deliberately: locking an
     * anonymous publication to nobody would make every publication ever made unpublishable by anybody,
     * which is a worse fault than the one this increment fixes.
     *
     * <p>A row WITH an owner answers true only for that owner. The comparison is exact and
     * case-sensitive, because an account id is a derived value and not a name a person typed: two
     * spellings of one id would be two accounts, and the Studio's own {@code createAccountId} is what
     * makes that so.
     */
    public boolean isOwnedBy(String accountId) {
        if (!hasOwner()) {
            return true;
        }
        return ownerAccountId.equals(accountId);
    }

    /** Attach an owner claim. Replaces any claim the row already held — see the takeover rule. */
    void claimOwner(String accountId, String handle, String assurance, Instant claimedAt) {
        this.ownerAccountId = accountId;
        this.ownerHandle = handle;
        this.ownerAssurance = assurance;
        this.ownerClaimedAt = claimedAt;
    }

    /** Replace this publication with a newer one. The id never moves; the version always does. */
    public void republish(String title, String documentJson, Instant publishedAt) {
        this.title = title;
        this.documentJson = documentJson;
        this.version = this.version + 1;
        this.publishedAt = publishedAt;
    }
}
