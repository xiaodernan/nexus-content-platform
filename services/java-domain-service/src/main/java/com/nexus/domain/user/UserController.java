package com.nexus.domain.user;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * User REST API - exposes user domain service operations.
 */
@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    /**
     * Get user by ID.
     */
    @GetMapping("/{id}")
    public ResponseEntity<UserResponse> getUser(@PathVariable UUID id) {
        return userService.getUserById(id)
                .map(user -> ResponseEntity.ok(toResponse(user)))
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Create a new user.
     */
    @PostMapping
    public ResponseEntity<UserResponse> createUser(@RequestBody CreateUserRequest request) {
        User user = userService.createUser(
                request.getDisplayName(),
                request.getEmail(),
                request.getPasswordHash(),
                request.isGuest()
        );
        return ResponseEntity.status(201).body(toResponse(user));
    }

    /**
     * Update user profile.
     */
    @PatchMapping("/{id}/profile")
    public ResponseEntity<UserResponse> updateProfile(
            @PathVariable UUID id,
            @RequestBody UpdateProfileRequest request) {
        User user = userService.updateUserProfile(
                id,
                request.getDisplayName(),
                request.getHandle(),
                request.getAvatarUrl(),
                request.getBio()
        );
        return ResponseEntity.ok(toResponse(user));
    }

    /**
     * Claim guest account (convert to registered user).
     */
    @PostMapping("/{id}/claim")
    public ResponseEntity<UserResponse> claimAccount(
            @PathVariable UUID id,
            @RequestBody ClaimAccountRequest request) {
        User user = userService.claimGuestAccount(
                id,
                request.getEmail(),
                request.getPasswordHash()
        );
        return ResponseEntity.ok(toResponse(user));
    }

    /**
     * Soft delete user.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable UUID id) {
        userService.deleteUser(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Update user plan tier.
     */
    @PatchMapping("/{id}/plan")
    public ResponseEntity<UserResponse> updatePlan(
            @PathVariable UUID id,
            @RequestBody UpdatePlanRequest request) {
        User user = userService.updateUserPlan(id, request.getPlan());
        return ResponseEntity.ok(toResponse(user));
    }

    /**
     * List users by role.
     */
    @GetMapping("/by-role/{role}")
    public ResponseEntity<List<UserResponse>> getUsersByRole(@PathVariable String role) {
        try {
            User.UserRole userRole = User.UserRole.valueOf(role.toUpperCase());
            List<User> users = userService.getUsersByRole(userRole);
            return ResponseEntity.ok(users.stream().map(this::toResponse).toList());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    public static class CreateUserRequest {
        private String displayName;
        private String email;
        private String passwordHash;
        private boolean guest;

        public String getDisplayName() { return displayName; }
        public void setDisplayName(String displayName) { this.displayName = displayName; }
        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
        public String getPasswordHash() { return passwordHash; }
        public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
        public boolean isGuest() { return guest; }
        public void setGuest(boolean guest) { this.guest = guest; }
    }

    public static class UpdateProfileRequest {
        private String displayName;
        private String handle;
        private String avatarUrl;
        private String bio;

        public String getDisplayName() { return displayName; }
        public void setDisplayName(String displayName) { this.displayName = displayName; }
        public String getHandle() { return handle; }
        public void setHandle(String handle) { this.handle = handle; }
        public String getAvatarUrl() { return avatarUrl; }
        public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }
        public String getBio() { return bio; }
        public void setBio(String bio) { this.bio = bio; }
    }

    public static class ClaimAccountRequest {
        private String email;
        private String passwordHash;

        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
        public String getPasswordHash() { return passwordHash; }
        public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    }

    public static class UpdatePlanRequest {
        private User.UserPlan plan;

        public User.UserPlan getPlan() { return plan; }
        public void setPlan(User.UserPlan plan) { this.plan = plan; }
    }

    public static class UserResponse {
        private UUID id;
        private String email;
        private String displayName;
        private String handle;
        private String avatarUrl;
        private String bio;
        private String role;
        private String plan;
        private boolean guest;

        public UUID getId() { return id; }
        public void setId(UUID id) { this.id = id; }
        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
        public String getDisplayName() { return displayName; }
        public void setDisplayName(String displayName) { this.displayName = displayName; }
        public String getHandle() { return handle; }
        public void setHandle(String handle) { this.handle = handle; }
        public String getAvatarUrl() { return avatarUrl; }
        public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }
        public String getBio() { return bio; }
        public void setBio(String bio) { this.bio = bio; }
        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }
        public String getPlan() { return plan; }
        public void setPlan(String plan) { this.plan = plan; }
        public boolean isGuest() { return guest; }
        public void setGuest(boolean guest) { this.guest = guest; }
    }

    private UserResponse toResponse(User user) {
        UserResponse response = new UserResponse();
        response.setId(user.getId());
        response.setEmail(user.getEmail());
        response.setDisplayName(user.getDisplayName());
        response.setHandle(user.getHandle());
        response.setAvatarUrl(user.getAvatarUrl());
        response.setBio(user.getBio());
        response.setRole(user.getRole().name());
        response.setPlan(user.getPlan().name());
        response.setGuest(user.getGuest());
        return response;
    }
}
