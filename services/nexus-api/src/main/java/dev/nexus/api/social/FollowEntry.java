package dev.nexus.api.social;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

/**
 * M7 v287 — ONE follow: an account saying "I want to see what that account makes".
 *
 * <p>A follow is an EDGE between two accounts, and it is a row rather than a counter for the same reason
 * a like is: a counter on the followee could not say WHO follows, WHEN, or whether the same account
 * followed twice. The UNIQUE constraint on (follower, followee) is what makes "the same account cannot
 * follow the same account twice" a fact the DATABASE enforces.
 *
 * <p>The two ends of the edge are NOT symmetric, and the model says so: {@code followerId} and
 * {@code followeeId} are different columns, and the finder for one direction is not the finder for the
 * other. A model that stored "a and b" would have to guess which end is which, and a social graph with
 * ambiguous edges is a graph nobody can count.
 *
 * <p><b>What this table cannot know:</b> whether either account EXISTS. The service holds no account
 * table (an account exists in it only as far as publications NAME it), so a follow of an account id
 * nobody has ever published is a follow the service records faithfully \u2014 and the profile page, which is
 * the place a reader would learn the truth, is the place that can say it.
 */
@Entity
@Table(
        name = "follow_entry",
        uniqueConstraints = @UniqueConstraint(
                name = "follow_entry_follower_followee",
                columnNames = {"follower_account_id", "followee_account_id"}))
public class FollowEntry {

    /** The edge's own row id. */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The account that follows. The claim's account id \u2014 never blank. */
    @Column(name = "follower_account_id", nullable = false, length = 200)
    private String followerAccountId;

    /** The account that is followed. An account id, which the service cannot verify \u2014 it holds no account table. */
    @Column(name = "followee_account_id", nullable = false, length = 200)
    private String followeeAccountId;

    /** When the follow happened \u2014 the service's own instant, not the client's. */
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected FollowEntry() {
        // JPA needs it; the service never builds one without values.
    }

    public FollowEntry(String followerAccountId, String followeeAccountId, Instant createdAt) {
        this.followerAccountId = followerAccountId;
        this.followeeAccountId = followeeAccountId;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public String getFollowerAccountId() {
        return followerAccountId;
    }

    public String getFolloweeAccountId() {
        return followeeAccountId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
