package dev.nexus.api.incidents;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * M9 v594 — the incident table's doors.
 *
 * <p>Every query is a derived one, so the SQL is Spring Data's and the meaning is the method name's. The
 * order is {@code openedAt DESC, incidentId DESC}: the newest record first, and an id tie-break so two
 * records written in the same microsecond still have ONE stable order rather than whatever the database
 * felt like returning. A reader can check the order it was given, and the live proof does.
 *
 * <p>There are four read shapes rather than one query with an optional predicate: the filter is applied
 * IN THE QUERY, so the window and the count are narrowed together and the browser never receives the rows
 * a filter excluded. Each shape pairs with a count of the same narrowing.
 */
public interface IncidentRepository extends JpaRepository<Incident, String> {

    /** Every incident, newest first — the window, not the whole table. */
    List<Incident> findAllByOrderByOpenedAtDescIncidentIdDesc(Pageable page);

    /** The whole table's size, narrowed to one status when the caller asked for one. */
    long countByStatus(String status);

    /** The whole table's size, narrowed to one severity when the caller asked for one. */
    long countBySeverity(String severity);

    /** The whole table's size, narrowed on both axes at once. */
    long countByStatusAndSeverity(String status, String severity);

    /** One status, newest first. */
    List<Incident> findByStatusOrderByOpenedAtDescIncidentIdDesc(String status, Pageable page);

    /** One severity, newest first. */
    List<Incident> findBySeverityOrderByOpenedAtDescIncidentIdDesc(String severity, Pageable page);

    /** Both narrowings at once, newest first. */
    List<Incident> findByStatusAndSeverityOrderByOpenedAtDescIncidentIdDesc(
            String status, String severity, Pageable page);
}
