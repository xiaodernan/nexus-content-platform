package dev.nexus.api.tools;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * M10 v588 - ONE declaration's attestation: its owner's claim that a NAMED contract was tested.
 *
 * <p>This is a claim, and the name says so. The registry never executes a tool, so it cannot check that anything
 * was tested; what it can do is keep the claim exactly, with the author's instant, and let a reader decide what it
 * is worth. Storing it as a field of the declaration would put an unverified sentence inside the contract a
 * consumer pins; as its own resource it travels beside the declaration instead, the same shape deprecation took
 * (ADR 0025).
 *
 * <p>The claim is bound to a {@code contractSha256}, not to the declaration. "This tool was tested" says nothing
 * about WHICH bytes were tested: an update afterwards would silently inherit a claim about a contract nobody
 * tested. Binding it to the pin makes the claim true about exactly one contract, and the read can then say whether
 * that contract is still the one being served ({@code stillCurrent}) instead of pretending the claim follows the
 * tool.
 *
 * <p>One row per tool: an attestation is a CURRENT claim, not a history - re-attesting replaces the pin, the note
 * and the instant, the same way re-deprecating replaces a sentence. The revisions door already holds every
 * contract a tool has served, so the history of a claim is derivable from the history of the contracts plus this
 * row's instant.
 */
@Entity
@Table(name = "tool_attestation")
public class ToolAttestation {

    /** The declaration being attested. One row per tool: this is the primary key, not a history. */
    @Id
    @Column(name = "tool_id", nullable = false, length = 64)
    private String toolId;

    /** The contract the claim is about: the exact 64-hex pin the caller tested. */
    @Column(name = "contract_sha256", nullable = false, length = 64)
    private String contractSha256;

    /** The owner's optional sentence about HOW it was tested, trimmed and bounded; null when it said nothing. */
    @Column(name = "note", length = 280)
    private String note;

    /** This service's clock at the write that made (or last replaced) the claim. */
    @Column(name = "attested_at", nullable = false)
    private Instant attestedAt;

    protected ToolAttestation() {
        // JPA needs it.
    }

    public ToolAttestation(String toolId, String contractSha256, String note, Instant attestedAt) {
        this.toolId = toolId;
        this.contractSha256 = contractSha256;
        this.note = note;
        this.attestedAt = attestedAt;
    }

    public String getToolId() {
        return toolId;
    }

    public String getContractSha256() {
        return contractSha256;
    }

    public String getNote() {
        return note;
    }

    public Instant getAttestedAt() {
        return attestedAt;
    }
}