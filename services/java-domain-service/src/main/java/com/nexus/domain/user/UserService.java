package com.nexus.domain.user;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * User domain service - authoritative write path for user operations.
 * This service manages user lifecycle, profile, and authentication state.
 */
@Service
@Transactional(readOnly = true)
public class UserService {

    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /**
     * Create a new user (guest or registered).
     * Guest users have null email and guest=true.
     */
    @Transactional
    public User createUser(String displayName, String email, String passwordHash, boolean isGuest) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setDisplayName(displayName);
        user.setEmail(email);
        user.setPasswordHash(passwordHash);
        user.setGuest(isGuest);

        // Generate handle from display name if not provided
        if (email != null && !email.isEmpty()) {
            String baseHandle = email.split("@")[0].toLowerCase();
            user.setHandle(baseHandle);
        }

        return userRepository.save(user);
    }

    /**
     * Update user profile (displayName, handle, avatarUrl, bio).
     */
    @Transactional
    public User updateUserProfile(UUID userId, String displayName, String handle, String avatarUrl, String bio) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));

        if (displayName != null) {
            user.setDisplayName(displayName);
        }
        if (handle != null) {
            // Check handle uniqueness
            Optional<User> existing = userRepository.findByHandle(handle);
            if (existing.isPresent() && !existing.get().getId().equals(userId)) {
                throw new IllegalArgumentException("Handle already taken: " + handle);
            }
            user.setHandle(handle);
        }
        if (avatarUrl != null) {
            user.setAvatarUrl(avatarUrl);
        }
        if (bio != null) {
            user.setBio(bio);
        }

        return userRepository.save(user);
    }

    /**
     * Claim a guest user account - convert to registered user with email/password.
     */
    @Transactional
    public User claimGuestAccount(UUID userId, String email, String passwordHash) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));

        if (!user.getGuest()) {
            throw new IllegalStateException("User is not a guest account");
        }

        user.setEmail(email);
        user.setPasswordHash(passwordHash);
        user.setGuest(false);
        user.setClaimedAt(Instant.now());

        return userRepository.save(user);
    }

    /**
     * Soft delete a user (sets deletedAt timestamp).
     */
    @Transactional
    public void deleteUser(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));

        user.setDeletedAt(Instant.now());
        userRepository.save(user);
    }

    /**
     * Get user by ID (excludes soft-deleted users).
     */
    public Optional<User> getUserById(UUID userId) {
        return userRepository.findById(userId)
                .filter(user -> user.getDeletedAt() == null);
    }

    /**
     * Get user by email (case-insensitive).
     */
    public Optional<User> getUserByEmail(String email) {
        return userRepository.findByEmail(email)
                .filter(user -> user.getDeletedAt() == null);
    }

    /**
     * Get user by handle.
     */
    public Optional<User> getUserByHandle(String handle) {
        return userRepository.findByHandle(handle)
                .filter(user -> user.getDeletedAt() == null);
    }

    /**
     * List all active (non-deleted) users by role.
     */
    public List<User> getUsersByRole(User.UserRole role) {
        return userRepository.findByRole(role).stream()
                .filter(user -> user.getDeletedAt() == null)
                .toList();
    }

    /**
     * List all users on a specific plan tier.
     */
    public List<User> getUsersByPlan(User.UserPlan plan) {
        return userRepository.findByPlan(plan).stream()
                .filter(user -> user.getDeletedAt() == null)
                .toList();
    }

    /**
     * Upgrade or downgrade user's plan tier.
     */
    @Transactional
    public User updateUserPlan(UUID userId, User.UserPlan newPlan) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));

        user.setPlan(newPlan);
        return userRepository.save(user);
    }
}
