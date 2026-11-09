package com.nexus.domain.permission;

import com.nexus.domain.UnimplementedOperation;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Permission domain service — roles, permissions, access control.
 *
 * <p><b>This service does not own these writes yet, and it says so instead of pretending.</b> Every
 * method below used to answer with a made-up value:
 *
 * <pre>{@code
 * public boolean hasPermission(String userId, String resourceType, String resourceId, String action) {
 *     return false;                   // a permission check that answers without checking
 * }
 * public boolean isAdmin(String userId) { return false; }   // an admin flag, always "no"
 * public boolean isModerator(String userId) { return false; }
 * public void grantRole(String userId, String role) { }      // success; no role was granted
 * public void revokeRole(String userId, String role) { }
 * }</pre>
 *
 * <p>A permission check that always answers {@code false} has a peculiar kind of danger: it looks
 * like the SAFE answer. It is not safe — it is an answer the service never established, and a
 * caller that trusts it will deny a legitimate owner their own project while believing the system
 * is enforcing something. The {@code void} grant/revoke pair is worse in the other direction: the
 * caller is told the role moved.
 *
 * <p>The membership and role facts for this platform live with the accounts and the project
 * membership surface — the web layer's {@code users} / {@code project_members} tables (see
 * {@code apps/web/src/server/db/schema.ts}) and {@code nexus-api}'s publication-ownership rules.
 * This service is the second candidate for that judgement, and it will not make it up.
 *
 * <p>So each method refuses with {@link UnimplementedOperation}, which names the operation and the
 * boundary.
 *
 * @see com.nexus.domain.UnimplementedOperation
 */
@Service
@Transactional(readOnly = true)
public class PermissionService {

    private static final String OWNERSHIP =
            "roles and membership live with the accounts and the project membership surface (the web "
                    + "layer's `users` / `project_members` tables and nexus-api's ownership rules); this "
                    + "service does not own that judgement, so it will not answer it without checking";

    /**
     * Check if user has permission to access a resource.
     *
     * @throws UnimplementedOperation always — a {@code false} here is a made-up answer, not a check.
     */
    public boolean hasPermission(String userId, String resourceType, String resourceId, String action) {
        throw new UnimplementedOperation("permission.hasPermission", OWNERSHIP);
    }

    /**
     * Grant a role to a user.
     *
     * @throws UnimplementedOperation always — a silent no-op would report a grant that never
     *     happened.
     */
    @Transactional
    public void grantRole(String userId, String role) {
        throw new UnimplementedOperation("permission.grantRole", OWNERSHIP);
    }

    /**
     * Revoke a role from a user.
     *
     * @throws UnimplementedOperation always.
     */
    @Transactional
    public void revokeRole(String userId, String role) {
        throw new UnimplementedOperation("permission.revokeRole", OWNERSHIP);
    }

    /**
     * Check if user is admin.
     *
     * @throws UnimplementedOperation always — an admin flag that is always {@code false} is an
     *     answer the service never established.
     */
    public boolean isAdmin(String userId) {
        throw new UnimplementedOperation("permission.isAdmin", OWNERSHIP);
    }

    /**
     * Check if user is moderator.
     *
     * @throws UnimplementedOperation always.
     */
    public boolean isModerator(String userId) {
        throw new UnimplementedOperation("permission.isModerator", OWNERSHIP);
    }
}
