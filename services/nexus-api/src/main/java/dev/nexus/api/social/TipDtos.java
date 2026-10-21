package dev.nexus.api.social;

import java.util.List;

/**
 * M7 v297 — the wire shapes for TIPS.
 *
 * <p>The tip itself is the CLIENT's own declared shape, field for field: `recipientId`,
 * `amountCents`, `message` and `anonymous`. The service sends the payer's account, handle, assurance,
 * the currency, the id and the instant as well — the same rule the like, the comment, the follow and the
 * report follow: the assurance travels with the actor so a reader is TOLD what the tip is worth.
 */
public final class TipDtos {

    private TipDtos() {
    }

    /** The currency a tip is in. CNY in this build — and the client says the same. */
    public static final String CURRENCY_CNY = "CNY";

    /** WHO is tipping. The shape is the one the Studio's own claim produces. */
    public record TipClaim(String accountId, String handle, String assurance, Long claimedAt) {
    }

    /** A tip request: who is for, who is giving, how much, and what they said. */
    public record TipRequest(String recipientAccountId, TipClaim claim, Long amountCents, String message, Boolean anonymous) {
    }

    /** One tip. The client's own `Tip` shape, plus the fields the service knows. */
    public record Tip(
            String recipientId,
            long amountCents,
            String message,
            boolean anonymous,
            String id,
            String payerId,
            String currency,
            long createdAt,
            String handle,
            String assurance) {
    }

    /**
     * The answer to a tip question.
     *
     * <p>`totalCents` is how much the recipient was given in the answer's window — summed by the
     * DATABASE, so it is a fact about the rows and not a running total the service kept in its head.
     */
    /**
     * v355 — the count is the WHOLE table's, in both directions.
     *
     * <p>It was the number of rows the service happened to read — the WINDOW’s size — and it was
     * dressed as a total. The count is the DATABASE's count now, so a bar that pairs it with a list of
     * rows can also say how many of those rows there are and whether the list is a window.
     */
    public record TipAnswer(String recipientAccountId, List<Tip> tips, long totalCents, long count, int limit) {
    }
}
