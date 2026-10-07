package com.nexus.domain.user;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * User repository - JPA data access layer for user operations.
 */
@Repository
public interface UserRepository extends JpaRepository<User, UUID> {

    /**
     * Find user by email (case-insensitive, matches lower(email) index).
     */
    @Query("SELECT u FROM User u WHERE LOWER(u.email) = LOWER(:email)")
    Optional<User> findByEmail(String email);

    /**
     * Find user by handle (unique constraint).
     */
    Optional<User> findByHandle(String handle);

    /**
     * Find guest users who haven't been deleted.
     */
    List<User> findByGuestTrueAndDeletedAtIsNull();

    /**
     * Find users by role.
     */
    List<User> findByRole(User.UserRole role);

    /**
     * Find users by plan tier.
     */
    List<User> findByPlan(User.UserPlan plan);
}
