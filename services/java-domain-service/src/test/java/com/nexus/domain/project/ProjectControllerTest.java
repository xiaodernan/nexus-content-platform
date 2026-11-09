package com.nexus.domain.project;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * The HTTP surface of the project domain, graded without a Spring context.
 *
 * <p>What is asserted is the contract a caller sees: a present project answers 200 with the fields the
 * response promises, an absent one answers 404, a create answers 201, a delete answers 204 and a by-owner
 * listing answers an array. Whether those handlers reach a real database is {@code ProjectServiceTest}'s
 * and the live run's claim — not this class's.
 */
@ExtendWith(MockitoExtension.class)
class ProjectControllerTest {

    @Mock
    private ProjectService service;

    private MockMvc mvc;

    private static final UUID OWNER = UUID.fromString("11111111-1111-1111-1111-111111111111");

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new ProjectController(service)).build();
    }

    @Test
    void aPresentProjectAnswers200WithTheResponseShape() throws Exception {
        Project project = project();
        when(service.getProjectById(project.getId())).thenReturn(Optional.of(project));

        mvc.perform(get("/api/v1/projects/{id}", project.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(project.getId().toString()))
                .andExpect(jsonPath("$.slug").value("harbour"))
                .andExpect(jsonPath("$.kind").value("website"))
                .andExpect(jsonPath("$.visibility").value("private"));
    }

    @Test
    void anAbsentProjectAnswers404() throws Exception {
        UUID missing = UUID.randomUUID();
        when(service.getProjectById(missing)).thenReturn(Optional.empty());

        mvc.perform(get("/api/v1/projects/{id}", missing)).andExpect(status().isNotFound());
    }

    @Test
    void aCreateAnswers201() throws Exception {
        when(service.createProject(eq(OWNER), eq("harbour"), eq("Harbour"), eq("website"), eq("A place")))
                .thenReturn(project());

        mvc.perform(post("/api/v1/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerId\":\"" + OWNER
                                + "\",\"slug\":\"harbour\",\"name\":\"Harbour\",\"kind\":\"website\","
                                + "\"description\":\"A place\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.slug").value("harbour"));
    }

    @Test
    void aByOwnerListingAnswersAnArray() throws Exception {
        when(service.getProjectsByOwner(OWNER)).thenReturn(List.of(project()));

        mvc.perform(get("/api/v1/projects/by-owner/{ownerId}", OWNER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].ownerId").value(OWNER.toString()));
    }

    @Test
    void aDeleteAnswers204AndReachesTheService() throws Exception {
        UUID id = UUID.randomUUID();

        mvc.perform(delete("/api/v1/projects/{id}", id)).andExpect(status().isNoContent());

        verify(service).deleteProject(id);
    }

    private static Project project() {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        project.setOwnerId(OWNER);
        project.setSlug("harbour");
        project.setName("Harbour");
        project.setKind("website");
        project.setVisibility("private");
        return project;
    }
}
