package com.nexus.domain.community;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

/** Only the question this service needs answered: what did observer choose about subject? */
@Repository
public interface UserBlockRepository extends JpaRepository<UserBlock, UserBlock.Key> {

    @Query("select b.kind from UserBlock b where b.blockerId = ?1 and b.blockedId = ?2")
    Optional<String> kindOf(UUID blockerId, UUID blockedId);
}