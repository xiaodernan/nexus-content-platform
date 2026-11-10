package com.nexus.domain.permission;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.mockito.Mock;

/**
 * The permission HTTP surface, graded without a Spring context (SC-18 / §SC-3).
 *
 * <p>Identity-before-work is the arm that matters most: with no {@code X-Nexus-Subject} the domain must
 * not be touched, and a subject that is not a UUID must be refused rather than guessed. Everything else
 * is the shape of the answer — allowed/not-allowed, the caller's own admin flag, and a refusal that
 * names the reason instead of implying one.
 */
@ExtendWith(MockitoExtension.class)
class PermissionControllerTest {

    private static final UUID CALLER = UUID.fromString("bbbbbbbb-0000-0000-0000-000000000021");

    @Mock private PermissionService permissions;

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new PermissionController(permissions)).build();
    }

    @Test
    void aReadCheckAnswers200WithTheAllowsAndTheAdminFlag() throws Exception {
        when(permissions.hasPermission(CALLER, "project", "p1", "read")).thenReturn(true);
        when(permissions.isAdmin(CALLER)).thenReturn(false);
        when(permissions.getUserAuthority(CALLER)).thenReturn("role_creator");

        mvc.perform(get("/api/v1/permission/check")
                        .param("resourceType", "project")
                        .param("resourceId", "p1")
                        .param("action", "read")
                        .header(PermissionController.SUBJECT_HEADER, CALLER.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.allowed").value(true))
                .andExpect(jsonPath("$.isAdmin").value(false))
                .andExpect(jsonPath("$.authority").value("role_creator"));

        verify(permissions).hasPermission(CALLER, "project", "p1", "read");
        verify(permissions).isAdmin(CALLER);
        verify(permissions).getUserAuthority(CALLER);
    }

    @Test
    void aWriteCheckForANonOwnerIsRefusedInTheAnswer() throws Exception {
        when(permissions.hasPermission(CALLER, "project", "p1", "write")).thenReturn(false);
        when(permissions.isAdmin(CALLER)).thenReturn(false);
        when(permissions.getUserAuthority(CALLER)).thenReturn("role_creator");

        mvc.perform(get("/api/v1/permission/check")
                        .param("resourceType", "project")
                        .param("resourceId", "p1")
                        .param("action", "write")
                        .header(PermissionController.SUBJECT_HEADER, CALLER.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.allowed").value(false));

        verify(permissions).hasPermission(CALLER, "project", "p1", "write");
    }

    @Test
    void withoutASubjectTheServiceIsNotAsked() throws Exception {
        mvc.perform(get("/api/v1/permission/check")
                        .param("resourceType", "project")
                        .param("resourceId", "p1"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(permissions);
    }

    @Test
    void aSubjectThatIsNotAUuidIsRefusedRatherThanGuessed() throws Exception {
        mvc.perform(get("/api/v1/permission/check")
                        .param("resourceType", "project")
                        .param("resourceId", "p1")
                        .header(PermissionController.SUBJECT_HEADER, "not-a-uuid"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(permissions);
    }

    @Test
    void anUnknownResourceTypeIsRefusedWithTheServicesOwnSentence() throws Exception {
        when(permissions.hasPermission(CALLER, "moon", "p1", "read"))
                .thenThrow(new IllegalArgumentException("Unknown resource type: moon"));

        mvc.perform(get("/api/v1/permission/check")
                        .param("resourceType", "moon")
                        .param("resourceId", "p1")
                        .header(PermissionController.SUBJECT_HEADER, CALLER.toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Unknown resource type: moon"));

        verify(permissions).hasPermission(CALLER, "moon", "p1", "read");
    }

    @Test
    void aResourceIdThatDoesNotParseIsRefused() throws Exception {
        when(permissions.hasPermission(CALLER, "project", "not-a-uuid", "read"))
                .thenThrow(new IllegalArgumentException("Invalid UUID string: not-a-uuid"));

        mvc.perform(get("/api/v1/permission/check")
                        .param("resourceType", "project")
                        .param("resourceId", "not-a-uuid")
                        .header(PermissionController.SUBJECT_HEADER, CALLER.toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", containsString("UUID")));

        verify(permissions).hasPermission(CALLER, "project", "not-a-uuid", "read");
    }
}
