package com.nexus.domain.project;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.nexus.domain.SecurityConfig;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The project door's HTTP contract, over a mocked service — no database, no context.
 *
 * <p>Three answers, and the point of the class is that they are DIFFERENT facts:
 *
 * <ul>
 *   <li><b>200</b> — the row is there, and the body carries the row;</li>
 *   <li><b>404</b> — the row is not there;</li>
 *   <li><b>400</b> — the caller sent a word that is not in the schema's vocabulary, which is the
 *       CALLER's mistake and must not be reported as the server's.</li>
 * </ul>
 *
 * <p>The 400 case is the one that used to be a 500: an unknown kind reaches a PostgreSQL enum column
 * and comes back as a constraint violation, and Spring's default handler turns that into "the server is
 * broken". The vocabulary check in {@link ProjectVocabulary} moved the refusal to the right side of the
 * boundary.
 */
@WebMvcTest(ProjectController.class)
// The slice must load the same filter chain production uses: a plain `@Configuration` is not
// picked up by @WebMvcTest, so without this explicit import the starter's default chain (HTTP Basic
// + generated password) answers 401 to everything — a health reading wrong in the alarming direction.
// `SecurityConfig` is the only chain this service has; it explicitly permits the API surface.
@Import(SecurityConfig.class)
class ProjectControllerTest {

    private static final UUID PROJECT_ID = UUID.fromString("6fef79cf-a5f7-4d27-9e7e-30309e567dad");
    private static final UUID OWNER_ID = UUID.fromString("d6442aa2-290b-4e5f-9942-31c735b79b0b");

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private ProjectService service;

    /**
     * The by-owner listing — the read surface the admin pages call. Answers an array, here a one-element
     * one; the shape is the contract, not the length.
     */
    @Test
    void aByOwnerListingAnswersAnArray() throws Exception {
        when(service.getProjectsByOwner(OWNER_ID)).thenReturn(List.of(project()));

        mvc.perform(get("/api/v1/projects/by-owner/{ownerId}", OWNER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].ownerId").value(OWNER_ID.toString()));
    }

    /**
     * A delete is a soft delete: the controller answers 204 and the service does the stamping.
     */
    @Test
    void aDeleteAnswers204AndReachesTheService() throws Exception {
        mvc.perform(delete("/api/v1/projects/{id}", PROJECT_ID))
                .andExpect(status().isNoContent());

        verify(service).deleteProject(PROJECT_ID);
    }

    private static Project project() {
        Project project = new Project();
        project.setId(PROJECT_ID);
        project.setOwnerId(OWNER_ID);
        project.setSlug("a-slug");
        project.setName("A name");
        project.setKind("website");
        project.setVisibility("private");
        project.setCreatedAt(Instant.parse("2026-10-30T13:41:35.484495Z"));
        project.setUpdatedAt(Instant.parse("2026-10-30T13:41:35.484495Z"));
        return project;
    }

    @Test
    void aProjectTheServiceHoldsIsAnsweredWithTheRow() throws Exception {
        when(service.getProjectById(PROJECT_ID)).thenReturn(Optional.of(project()));

        mvc.perform(get("/api/v1/projects/{id}", PROJECT_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(PROJECT_ID.toString()))
                .andExpect(jsonPath("$.slug").value("a-slug"))
                .andExpect(jsonPath("$.kind").value("website"))
                .andExpect(jsonPath("$.createdAt").exists());
    }

    @Test
    void aProjectTheServiceDoesNotHoldIsNotFound() throws Exception {
        when(service.getProjectById(any())).thenReturn(Optional.empty());

        mvc.perform(get("/api/v1/projects/{id}", PROJECT_ID))
                .andExpect(status().isNotFound());
    }

    @Test
    void aKindThatIsNotAKindIsTheCallersMistake() throws Exception {
        when(service.createProject(any(), eq("a-slug"), any(), eq("not-a-kind"), any()))
                .thenThrow(new IllegalArgumentException(
                        "'not-a-kind' is not a project kind; the kinds are website, video"));

        mvc.perform(post("/api/v1/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerId\":\"" + OWNER_ID + "\",\"slug\":\"a-slug\",\"name\":\"A name\","
                                + "\"kind\":\"not-a-kind\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void aVisibilityThatIsNotAVisibilityIsTheCallersMistake() throws Exception {
        when(service.updateProject(eq(PROJECT_ID), any(), any(), eq("secret")))
                .thenThrow(new IllegalArgumentException(
                        "'secret' is not a visibility; the visibilities are private, unlisted, public"));

        mvc.perform(patch("/api/v1/projects/{id}", PROJECT_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"visibility\":\"secret\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void aProjectTheServiceDoesNotHoldIsNotFoundEvenOnAnUpdate() throws Exception {
        when(service.updateProject(eq(PROJECT_ID), any(), any(), eq("public")))
                .thenThrow(new com.nexus.domain.ResourceNotFoundException("Project not found: " + PROJECT_ID));

        mvc.perform(patch("/api/v1/projects/{id}", PROJECT_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"visibility\":\"public\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").exists());
    }
}
