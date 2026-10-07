package dev.nexus.api.publish;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * The one repository this slice needs.
 *
 * <p>No query methods beyond the inherited ones: the slice reads by id and nothing else. A `findByTitle`
 * would be a listing feature, and listing is the NEXT M7 slice — adding it here would put an unproven
 * surface in the service.
 */
public interface PublishedProjectRepository extends JpaRepository<PublishedProject, String> {
}
