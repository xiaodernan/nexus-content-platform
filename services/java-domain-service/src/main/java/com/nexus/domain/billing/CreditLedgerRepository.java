package com.nexus.domain.billing;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

/** Reads the §134 ledger. No write methods: the ledger is append-only, and its only writer is the web layer. */
public interface CreditLedgerRepository extends JpaRepository<CreditLedger, UUID> {

    /**
     * The balance IS the sum — the table has no balance column (see CreditLedger), so this query is not an
     * optimisation over a stored number, it is the definition of the number.
     */
    @Query("select coalesce(sum(l.delta), 0) from CreditLedger l where l.userId = :userId and l.kind = :kind")
    long balanceOf(@Param("userId") UUID userId, @Param("kind") String kind);
}
