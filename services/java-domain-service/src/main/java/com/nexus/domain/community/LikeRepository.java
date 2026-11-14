package com.nexus.domain.community;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

/** Reads plus the two idempotent writes. No DDL: the table already exists and belongs to the web schema. */
@Repository
public interface LikeRepository extends JpaRepository<Like, Like.Key> {

    long countByProjectId(UUID projectId);

    boolean existsByUserIdAndProjectId(UUID userId, UUID projectId);

    /**
     * The double-click arm. Two nearly simultaneous likes both read "not liked yet" and both insert; the
     * second one hits the (user_id, project_id) primary key. {@code ON CONFLICT DO NOTHING} makes "the row is
     * already there" the final answer instead of a 23505 surfacing as a 500 — the same reasoning as the web
     * layer's {@code onConflictDoNothing()} in domain/social.ts.
     */
    @Modifying
    @Query(value = "insert into likes (user_id, project_id) values (?1, ?2) on conflict do nothing", nativeQuery = true)
    int insertIgnoringConflict(UUID userId, UUID projectId);

    @Modifying
    @Query(value = "delete from likes where user_id = ?1 and project_id = ?2", nativeQuery = true)
    int deleteRow(UUID userId, UUID projectId);
}