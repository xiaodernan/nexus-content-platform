package dev.nexus.api.patches;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * M9 v595 — the patch table's doors, scoped to the incident that owns the proposals.
 *
 * <p>Both reads are derived and both carry the same order: {@code createdAt DESC, patchId DESC} — newest
 * first, with the id as the tie-break so two proposals written in the same microsecond still have one
 * stable order. The count is narrowed by {@code incidentId} for the same reason the window is: a listing
 * for one incident may not report the whole table's size.
 */
public interface PatchRepository extends JpaRepository<IncidentPatch, String> {

    /** The incident's patches, newest first — the window, not the whole set. */
    List<IncidentPatch> findByIncidentIdOrderByCreatedAtDescPatchIdDesc(String incidentId, Pageable page);

    /** How many proposals that incident holds in total. */
    long countByIncidentId(String incidentId);
}
