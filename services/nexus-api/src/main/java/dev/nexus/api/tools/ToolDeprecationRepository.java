package dev.nexus.api.tools;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * M10 v575 - deprecations, newest first, one row per deprecated declaration.
 */
public interface ToolDeprecationRepository extends JpaRepository<ToolDeprecation, String> {

    /** The deprecation of one tool, when it has one. */
    Optional<ToolDeprecation> findByToolId(String toolId);

    /** The whole list of deprecated tools, newest deprecation first - the window, not the whole table. */
    List<ToolDeprecation> findAllByOrderByDeprecatedAtDesc(Pageable page);

    /** Remove a declaration's deprecation with the declaration itself. */
    void deleteByToolId(String toolId);
}
