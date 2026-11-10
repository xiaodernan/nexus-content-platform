package com.nexus.domain.community;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

@Repository
public interface FollowRepository extends JpaRepository<Follow, Follow.Key> {

    long countByFolloweeId(UUID followeeId);

    boolean existsByFollowerIdAndFolloweeId(UUID followerId, UUID followeeId);

    /** Same double-click arm as {@link LikeRepository#insertIgnoringConflict}. */
    @Modifying
    @Query(value = "insert into follows (follower_id, followee_id) values (?1, ?2) on conflict do nothing", nativeQuery = true)
    int insertIgnoringConflict(UUID followerId, UUID followeeId);

    @Modifying
    @Query(value = "delete from follows where follower_id = ?1 and followee_id = ?2", nativeQuery = true)
    int deleteRow(UUID followerId, UUID followeeId);
}