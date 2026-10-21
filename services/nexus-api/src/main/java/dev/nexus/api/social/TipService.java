package dev.nexus.api.social;

import dev.nexus.api.social.TipDtos.TipClaim;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * M7 v297 — TIPS, as four rules.
 *
 * <p>A tip is the first social act here that carries an AMOUNT, and an amount is where the rules earn
 * their keep: a tip of zero is not a tip, a negative tip is a payment the wrong way round, and an absurd
 * amount is a typo or an attack.
 *
 * <ol>
 *   <li><b>A tip needs a RECIPIENT and a PAYER.</b> The recipient is who the tip is for; the payer is the
 *       account that gave it. Both are the claim's account, and a tip with neither is not a fact anyone
 *       can act on.
 *   <li><b>The amount is POSITIVE and CAPPED.</b> Zero is not a tip. A negative amount is a payment the
 *       wrong way round, and the service refuses it BY NAME rather than storing a number that reads like
 *       money moving backwards. The cap is named: a tip of a billion cents is a typo or an attack, and
 *       this build has no payment rail to make it meaningful.
 *   <li><b>The MESSAGE is bounded</b> and may be empty: an amount with no note is still a tip.
 *   <li><b>The amount is recorded AS IT WAS.</b> A price that changes later does not rewrite what was
 *       given, because “they gave 500 cents” is a fact about the past.
 * </ol>
 *
 * <p><b>What this service does NOT do, stated rather than implied:</b> it moves no money and holds no
 * payment token (ADR 0018). A tip here is a RECORD of a gesture — “this account gave that amount to
 * that account” — and never a statement that a payment happened. The service verifies nothing: the
 * accounts are claims, and the assurance travels with every tip so a reader is told what it is worth.
 */
@Service
public class TipService {

    /** Long enough for a real account id, short enough that it cannot be used to fill the table with one row. */
    static final int MAX_ACCOUNT_ID_LENGTH = 200;

    /** The most a tip may be, in cents. A tip of a million yuan is a typo or an attack. */
    public static final long MAX_TIP_CENTS = 100_000_00L;

    /** The longest message the service accepts. */
    public static final int MAX_MESSAGE_LENGTH = 500;

    /** The most tips one answer may carry. The cap is CLAMPED rather than refused, like every cap here. */
    public static final int MAX_TIP_LIMIT = 100;

    /** How many tips an answer carries when the caller names no limit. */
    public static final int DEFAULT_TIP_LIMIT = 20;

    private final TipRepository repository;
    private final Clock clock;

    public TipService(TipRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    /**
     * GIVE a tip.
     *
     * @throws InvalidTip when a rule is broken
     */
    @Transactional
    public TipEntry tip(String recipientAccountId, TipClaim claim, long amountCents, String message, boolean anonymous) {
        String recipient = requireAccount(recipientAccountId, "a tip needs an account to be for");
        String payer = requireAccount(claim == null ? null : claim.accountId(), "a tip needs an account to be from");
        long amount = requireAmount(amountCents);
        String words = requireMessage(message);
        Instant when = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        TipEntry row = new TipEntry(
                UUID.randomUUID().toString(),
                recipient,
                payer,
                claim == null ? null : claim.handle(),
                claim == null ? null : claim.assurance(),
                amount,
                TipDtos.CURRENCY_CNY,
                words,
                anonymous,
                when);
        return repository.save(row);
    }

    /**
     * The tips one account RECEIVED, and how much they came to.
     *
     * <p>The total is summed by the DATABASE, so it is a fact about the rows in the window rather than a
     * running total the service kept in its head — and a service that counted in memory would drift the
     * moment two tips arrived together.
     */
    @Transactional(readOnly = true)
    public List<TipEntry> tipsReceived(String recipientAccountId, int limit) {
        String recipient = requireAccount(recipientAccountId, "a tip needs an account to be for");
        int asked = limit <= 0 ? DEFAULT_TIP_LIMIT : Math.min(limit, MAX_TIP_LIMIT);
        return repository.findByRecipientAccountIdOrderByCreatedAtDesc(recipient, PageRequest.of(0, asked));
    }

    /**
     * v332 — the tips one account GAVE.
     *
     * <p>The other side of the same relation, and the same question the subscription had (v310): "what do I
     * back" and "who backs me" are not the same question, and the repository has had the finder for the
     * payer's side since v298 without a service method or a door for it. A reader who gave money and
     * could not see what they gave had a receipt with no place to read it.
     */
    @Transactional(readOnly = true)
    public List<TipEntry> tipsGiven(String payerAccountId, int limit) {
        String payer = requireAccount(payerAccountId, "a tip needs an account to give it");
        int asked = limit <= 0 ? DEFAULT_TIP_LIMIT : Math.min(limit, MAX_TIP_LIMIT);
        return repository.findByPayerAccountIdOrderByCreatedAtDesc(payer, PageRequest.of(0, asked));
    }

    /**
     * v332 — how much one account GAVE, in cents — summed by the DATABASE.
     */
    @Transactional(readOnly = true)
    public long totalGiven(String payerAccountId) {
        String payer = requireAccount(payerAccountId, "a tip needs an account to give it");
        return repository.sumAmountCentsByPayerAccountId(payer);
    }

    /** How much one account was given, in cents, and how many tips. */
    @Transactional(readOnly = true)
    public long totalReceived(String recipientAccountId) {
        String recipient = requireAccount(recipientAccountId, "a tip needs an account to be for");
        return repository.sumAmountCentsByRecipientAccountId(recipient);
    }

    /** How many tips one account received. */
    @Transactional(readOnly = true)
    public long countReceived(String recipientAccountId) {
        String recipient = requireAccount(recipientAccountId, "a tip needs an account to be for");
        return repository.countByRecipientAccountId(recipient);
    }

    /**
     * v355 — how many tips one account GAVE, over the whole table.
     *
     * <p>The other direction of the same count, and the reason the service has one for each: a receipt
     * that says "2 tip(s)" when the payer gave twenty is a receipt about a window.
     */
    @Transactional(readOnly = true)
    public long countGiven(String payerAccountId) {
        String payer = requireAccount(payerAccountId, "a tip needs an account to give it");
        return repository.countByPayerAccountId(payer);
    }

    private static String requireAccount(String accountId, String because) {
        if (accountId == null || accountId.isBlank()) {
            throw new InvalidTip(because);
        }
        String trimmed = accountId.trim();
        if (trimmed.length() > MAX_ACCOUNT_ID_LENGTH) {
            throw new InvalidTip("accountId must be at most " + MAX_ACCOUNT_ID_LENGTH + " characters, got " + trimmed.length());
        }
        return trimmed;
    }

    /** Rule 2: the amount is POSITIVE and CAPPED, and the refusals say which. */
    private static long requireAmount(long amountCents) {
        if (amountCents == 0) {
            throw new InvalidTip("a tip of zero is not a tip: the amount must be more than nothing");
        }
        if (amountCents < 0) {
            throw new InvalidTip("a tip cannot be negative: an amount below zero is money moving the wrong way round");
        }
        if (amountCents > MAX_TIP_CENTS) {
            throw new InvalidTip("a tip must be at most " + MAX_TIP_CENTS + " cents, got " + amountCents);
        }
        return amountCents;
    }

    /** Rule 3: the message is bounded, and may be empty. */
    private static String requireMessage(String message) {
        if (message == null) {
            return "";
        }
        String trimmed = message.trim();
        if (trimmed.length() > MAX_MESSAGE_LENGTH) {
            throw new InvalidTip("a tip's message must be at most " + MAX_MESSAGE_LENGTH + " characters, got " + trimmed.length());
        }
        return trimmed;
    }
}
