package dev.nexus.api.tools;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * M10 v588 - attestations, one row per attested declaration.
 */
public interface ToolAttestationRepository extends JpaRepository<ToolAttestation, String> {

    /** The claim about one tool, when its owner has made one. */
    Optional<ToolAttestation> findByToolId(String toolId);

    /** Remove a declaration's claim with the declaration itself. */
    void deleteByToolId(String toolId);
}