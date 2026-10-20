package dev.nexus.api.social;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * M7 v297 — the repository for TIPS.
 *
 * <p>Every windowed finder carries a {@link Pageable}, so the cap reaches the DATABASE: a tip list read
 * whole and trimmed in memory would be a table scan on every page load.
 */
public interface TipRepository extends JpaRepository<TipEntry, String> {

    /** The tips one account RECEIVED, newest first, capped by the caller's `Pageable`. */
    List<TipEntry> findByRecipientAccountIdOrderByCreatedAtDesc(String recipientAccountId, Pageable pageable);

    /** The tips one account GAVE, newest first, capped by the caller's `Pageable`. */
    List<TipEntry> findByPayerAccountIdOrderByCreatedAtDesc(String payerAccountId, Pageable pageable);

    /** How much one account was given, in cents — summed by the DATABASE, not by the service. */
    @org.springframework.data.jpa.repository.Query(
            "SELECT COALESCE(SUM(t.amountCents), 0) FROM TipEntry t WHERE t.recipientAccountId = :recipient")
    long sumAmountCentsByRecipientAccountId(@org.springframework.data.repository.query.Param("recipient") String recipientAccountId);

    /** How many tips one account received. */
    long countByRecipientAccountId(String recipientAccountId);
}
