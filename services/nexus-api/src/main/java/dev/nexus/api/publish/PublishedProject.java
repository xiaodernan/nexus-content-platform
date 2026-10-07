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

    /** Replace this publication with a newer one. The id never moves; the version always does. */
    public void republish(String title, String documentJson, Instant publishedAt) {
        this.title = title;
        this.documentJson = documentJson;
        this.version = this.version + 1;
        this.publishedAt = publishedAt;
    }
}
