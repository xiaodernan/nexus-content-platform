package com.nexus.domain.community;

import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * The HTTP surface, graded without a Spring context (SC-17). Same style as ProjectControllerTest.
 *
 * <p>The arm that matters most here is identity: with no {@code X-Nexus-Subject} the service must refuse
 * BEFORE the domain is touched, and with a subject that is not a UUID it must refuse rather than guess.
 * A controller that accepted an actor from the body would pass every other test in this class and let any
 * caller like as anybody.
 */
@ExtendWith(MockitoExtension.class)
class CommunityControllerTest {

    private static final UUID ACTOR = UUID.fromString("bbbbbbbb-0000-0000-0000-000000000001");
    private static final UUID TARGET = UUID.fromString("bbbbbbbb-0000-0000-0000-000000000002");
    private static final UUID PUBLICATION = UUID.fromString("bbbbbbbb-0000-0000-0000-000000000003");

    @Mock private CommunityService service;

    private MockMvc mvc;
    private CommunityPolicy policy;

    @BeforeEach
    void setUp() {
        policy = new CommunityPolicy();
        mvc = MockMvcBuilders.standaloneSetup(new CommunityController(service, policy)).build();
    }

    @Test
    void aLikeAnswers200WithTheContractShapeAndTheActorFromTheDoor() throws Exception {
        when(service.toggleLike(ACTOR, PUBLICATION)).thenReturn(new CommunityService.LikeState(true, 5L, null, null));

        mvc.perform(post("/api/v1/community/publications/{id}/like", PUBLICATION)
                        .header(CommunityController.SUBJECT_HEADER, ACTOR.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.liked").value(true))
                .andExpect(jsonPath("$.count").value(5))
                .andExpect(jsonPath("$.blocked").value(nullValue()))
                .andExpect(jsonPath("$.reason").value(nullValue()));

        verify(service).toggleLike(ACTOR, PUBLICATION);
    }

    @Test
    void aBlockedLikeIsA200WithTheBoundaryNotAnError() throws Exception {
        when(service.toggleLike(ACTOR, PUBLICATION))
                .thenReturn(new CommunityService.LikeState(false, 5L, "them", policy.interactionRefusal("them")));

        mvc.perform(post("/api/v1/community/publications/{id}/like", PUBLICATION)
                        .header(CommunityController.SUBJECT_HEADER, ACTOR.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.liked").value(false))
                .andExpect(jsonPath("$.blocked").value("them"))
                .andExpect(jsonPath("$.reason").value(policy.interactionRefusal("them")));
    }

    @Test
    void noSubjectMeans401AndTheDomainIsNeverTouched() throws Exception {
        mvc.perform(post("/api/v1/community/publications/{id}/like", PUBLICATION))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthenticated"));

        verifyNoInteractions(service);
    }

    @Test
    void aSubjectThatIsNotAUserUuidIs401NotAGuessedWrite() throws Exception {
        mvc.perform(post("/api/v1/community/users/{id}/follow", TARGET)
                        .header(CommunityController.SUBJECT_HEADER, "api-key-42"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("bad_subject"));

        verifyNoInteractions(service);
    }

    @Test
    void aMissingPublicationIs404WithThePolicySentence() throws Exception {
        when(service.toggleLike(ACTOR, PUBLICATION))
                .thenThrow(new CommunityRefusal("not_found", policy.refusal("noSuchPublication")));

        mvc.perform(post("/api/v1/community/publications/{id}/like", PUBLICATION)
                        .header(CommunityController.SUBJECT_HEADER, ACTOR.toString()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("not_found"))
                .andExpect(jsonPath("$.message").value(policy.refusal("noSuchPublication")));
    }

    @Test
    void aVersionThatIsNoLongerPublicIsAlso404() throws Exception {
        when(service.toggleLike(ACTOR, PUBLICATION))
                .thenThrow(new CommunityRefusal("not_public", policy.refusal("publicationGone")));

        mvc.perform(post("/api/v1/community/publications/{id}/like", PUBLICATION)
                        .header(CommunityController.SUBJECT_HEADER, ACTOR.toString()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value(policy.refusal("publicationGone")));
    }

    @Test
    void followingYourselfIs400() throws Exception {
        when(service.toggleFollow(ACTOR, ACTOR)).thenThrow(new CommunityRefusal("self_follow", policy.refusal("selfFollow")));

        mvc.perform(post("/api/v1/community/users/{id}/follow", ACTOR)
                        .header(CommunityController.SUBJECT_HEADER, ACTOR.toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("self_follow"))
                .andExpect(jsonPath("$.message").value(policy.refusal("selfFollow")));
    }

    @Test
    void aFollowAnswersTheFollowShape() throws Exception {
        when(service.toggleFollow(ACTOR, TARGET)).thenReturn(new CommunityService.FollowState(true, 3L, null, null));

        mvc.perform(post("/api/v1/community/users/{id}/follow", TARGET)
                        .header(CommunityController.SUBJECT_HEADER, ACTOR.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.following").value(true))
                .andExpect(jsonPath("$.followers").value(3));
    }

    @Test
    void thePolicyReadoutSaysWhichDocumentThisProcessEnforces() throws Exception {
        mvc.perform(get("/api/v1/community/policy"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source").value(CommunityPolicy.RESOURCE))
                .andExpect(jsonPath("$.policy.blockKinds[0]").value("block"))
                .andExpect(jsonPath("$.policy.interactionBlockingKinds[0]").value("block"))
                .andExpect(jsonPath("$.policy.refusal.selfFollow").value(policy.refusal("selfFollow")));

        verifyNoInteractions(service);
    }

    @Test
    void theHeaderIsTrimmedNotRejectedForWhitespace() throws Exception {
        when(service.toggleFollow(ACTOR, TARGET)).thenReturn(new CommunityService.FollowState(false, 0L, null, null));

        mvc.perform(post("/api/v1/community/users/{id}/follow", TARGET)
                        .header(CommunityController.SUBJECT_HEADER, "  " + ACTOR + "  "))
                .andExpect(status().isOk());

        verify(service).toggleFollow(ACTOR, TARGET);
        verify(service, never()).toggleLike(any(), any());
    }
}