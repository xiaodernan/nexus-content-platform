package dev.nexus.api.social;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * M7 v297 — ONE tip: an account giving something to another account's work.
 *
 * <p>A tip is APPENDED and never edited, and the AMOUNT is recorded as it was: a price that changes later
 * does not rewrite what was given, because “they gave 500 cents” is a fact about the past and a fact about
 * the past does not move.
 *
 * <p>The tip is a RECORD of a gesture, not a transfer of money: this service holds no payment tokens and
 * moves no funds (ADR 0018), and the record says what was given and by whom — never that a payment
 * happened.
 */
@Entity
@Table(name = "tip_entry")
public class TipEntry {

    /** The tip's own id. A string, so the client can name it without learning about a sequence. */
    @Id
    @Column(name = "tip_id", nullable = false, length = 64)
    private String tipId;

    /** The account the tip is FOR. */
    @Column(name = "recipient_account_id", nullable = false, length = 200)
    private String recipientAccountId;

    /** The account that gave it. */
    @Column(name = "payer_account_id", nullable = false, length = 200)
    private String payerAccountId;

    /** The handle the payer's claim carried, when it carried one. */
    @Column(name = "payer_handle", length = 24)
    private String payerHandle;

    /** What the payer's claim was worth when it arrived. `unsigned-local` in this build. */
    @Column(name = "payer_assurance", length = 32)
    private String payerAssurance;

    /** The amount, in CENTS. A tip is never zero and never negative. */
    @Column(name = "amount_cents", nullable = false)
    private long amountCents;

    /** The currency of the amount. `CNY` in this build; the client says the same. */
    @Column(name = "currency", nullable = false, length = 8)
    private String currency;

    /** The payer's own words. Empty is allowed: an amount with no note is still a tip. */
    @Column(name = "message", nullable = false, columnDefinition = "text")
    private String message;

    /** Whether the tip is ANONYMOUS — a DISPLAY choice, recorded so the reader can be told. */
    @Column(name = "anonymous", nullable = false)
    private boolean anonymous;

    /** When it was given — the service's own instant, not the client's. */
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected TipEntry() {
        // JPA needs it; the service never builds one without values.
    }

    public TipEntry(
            String tipId,
            String recipientAccountId,
            String payerAccountId,
            String payerHandle,
            String payerAssurance,
            long amountCents,
            String currency,
            String message,
            boolean anonymous,
            Instant createdAt) {
        this.tipId = tipId;
        this.recipientAccountId = recipientAccountId;
        this.payerAccountId = payerAccountId;
        this.payerHandle = payerHandle;
        this.payerAssurance = payerAssurance;
        this.amountCents = amountCents;
        this.currency = currency;
        this.message = message;
        this.anonymous = anonymous;
        this.createdAt = createdAt;
    }

    public String getTipId() {
        return tipId;
    }

    public String getRecipientAccountId() {
        return recipientAccountId;
    }

    public String getPayerAccountId() {
        return payerAccountId;
    }

    public String getPayerHandle() {
        return payerHandle;
    }

    public String getPayerAssurance() {
        return payerAssurance;
    }

    public long getAmountCents() {
        return amountCents;
    }

    public String getCurrency() {
        return currency;
    }

    public String getMessage() {
        return message;
    }

    public boolean isAnonymous() {
        return anonymous;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
