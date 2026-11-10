package com.nexus.domain.permission;

import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The permission HTTP surface (SC-18 / §SC-3), reachable through the gateway's {@code /domain/**} route as
 * {@code GET /domain/api/v1/permission/check?resourceType=project&resourceId=<uuid>&action=write}.
 *
 * <p><b>Identity comes from the door, never from the body.</b> The caller is X-Nexus-Subject, which
 * nexus-gateway's AuthFilter OVERWRITES after verifying a signed token. A direct hit without it is a 400
 * that says exactly that — an anonymous permission check is not a permission check, it is everybody asking
 * about everybody.
 *
 * <p><b>This surface judges, it does not decide for the web layer.</b> The same rules the web layer enforces
 * with its own queries (role, projects.owner_id, publication → project chain) are made available to a JVM
 * caller as a boolean; whether the answer is acted on — say, to gate a menu item — is the caller's call.
 * A non-owner reading a project gets {@code allowed: true} with action "read"; every other action is
 * {@code allowed: false}.
 *
 * <p><b>What is deliberately absent.</b> No list-of-rights endpoint (a grant list is a role-write primitive
 * wearing read clothes), no bulk check for somebody else's id, no visibility rule beyond the legacy
 * owner/read contract. A resource that does not resolve answers {@code allowed: false} — a ghost never
 * becomes a silent yes.
 */
@RestController
@RequestMapping("/api/v1/permission")
public class PermissionController {

    /** Must match the gateway's AuthFilter.SUBJECT_HEADER. */
    static final String SUBJECT_HEADER = "X-Nexus-Subject";

    private final PermissionService permissions;

    public PermissionController(PermissionService permissions) {
        this.permissions = permissions;
    }

    /**
     * Whether the CALLER (the subject) may perform {@code action} on the given resource. Answer shape:
     * {@code { resourceType, resourceId, action, allowed }} plus {@code isAdmin} for callers that render UI.
     */
    @GetMapping("/check")
    public Map<String, Object> check(@RequestHeader(SUBJECT_HEADER) UUID caller,
                                     @RequestParam String resourceType,
                                     @RequestParam String resourceId,
                                     @RequestParam(defaultValue = "read") String action) {
        boolean allowed = permissions.hasPermission(caller, resourceType, resourceId, action);
        boolean admin = permissions.isAdmin(caller);
        String authority = permissions.getUserAuthority(caller);
        return Map.of(
                "caller", caller.toString(),
                "resourceType", resourceType,
                "resourceId", resourceId,
                "action", action,
                "allowed", allowed,
                "isAdmin", admin,
                "authority", authority);
    }

    /** Unknown resource type, unparseable id, or a user id nobody holds — refuse by name (§60). */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> refuse(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
    }
}
