package dev.nexus.api.tools;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * M10 v571 — the tool registry's doors.
 *
 * <p>Every query is a derived one. The listing is ordered by NAME rather than by creation instant because a
 * catalog is read by name: two tools registered a second apart must answer in the order a caller can predict
 * from the only field it must know. The whole-table query and the owner-scoped one are separate derivations
 * rather than one query with a nullable parameter, so "the whole catalog" and "one account's tools" cannot be
 * confused by a null that silently meant the other.
 */
public interface ToolRepository extends JpaRepository<ToolEntry, String> {

    /** The row that holds this name, when the name is taken — the lookup that makes a duplicate a 409. */
    Optional<ToolEntry> findByName(String name);

    /** The whole catalog, name ascending — the window, not the whole table. */
    List<ToolEntry> findAllByOrderByNameAsc(Pageable page);

    /** One owner's declarations, name ascending. */
    List<ToolEntry> findByOwnerOrderByNameAsc(String owner, Pageable page);

    /** One owner's WHOLE number of declarations — what its window is a window of. */
    long countByOwner(String owner);
}
