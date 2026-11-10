package com.nexus.domain.billing;

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
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * The billing HTTP surface, graded without a Spring context (SC-20). Same style as the community
 * controller's: the arms that matter are identity-before-work and the shape of the refusal.
 */
@ExtendWith(MockitoExtension.class)
class BillingControllerTest {

    private static final UUID ACTOR = UUID.fromString("bbbbbbbb-0000-0000-0000-000000000011");

    @Mock private BillingService billing;

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new BillingController(billing)).build();
    }

    @Test
    void aBalanceAnswers200WithTheSubjectsKindAndNumber() throws Exception {
        when(billing.getCreditBalance(ACTOR, "ai")).thenReturn(540L);

        mvc.perform(get("/api/v1/billing/balance")
                        .header(BillingController.SUBJECT_HEADER, ACTOR.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(ACTOR.toString()))
                .andExpect(jsonPath("$.kind").value("ai"))
                .andExpect(jsonPath("$.balance").value(540));

        verify(billing).getCreditBalance(ACTOR, "ai");
    }

    @Test
    void aBalanceHonoursTheRequestedKind() throws Exception {
        when(billing.getCreditBalance(ACTOR, "image")).thenReturn(12L);

        mvc.perform(get("/api/v1/billing/balance?kind=image")
                        .header(BillingController.SUBJECT_HEADER, ACTOR.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("image"))
                .andExpect(jsonPath("$.balance").value(12));

        verify(billing).getCreditBalance(ACTOR, "image");
        verify(billing, never()).getCreditBalance(ACTOR, "ai");
    }

    @Test
    void aPlanAnswers200WithTheLowercasePlanLabel() throws Exception {
        when(billing.getSubscriptionPlan(ACTOR)).thenReturn("team");

        mvc.perform(get("/api/v1/billing/plan")
                        .header(BillingController.SUBJECT_HEADER, ACTOR.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(ACTOR.toString()))
                .andExpect(jsonPath("$.plan").value("team"));

        verify(billing).getSubscriptionPlan(ACTOR);
    }

    @Test
    void withoutASubjectTheServiceRefusesBeforeTheDomainIsTouched() throws Exception {
        mvc.perform(get("/api/v1/billing/balance"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(billing);
    }

    @Test
    void aSubjectThatIsNotAUuidIsRefusedRatherThanGuessed() throws Exception {
        mvc.perform(get("/api/v1/billing/balance")
                        .header(BillingController.SUBJECT_HEADER, "not-a-uuid"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(billing);
    }

    @Test
    void anUnknownKindIsRefusedWithTheServicesOwnSentence() throws Exception {
        when(billing.getCreditBalance(ACTOR, "moon-bucks"))
                .thenThrow(new IllegalArgumentException("Unknown credit kind: moon-bucks"));

        mvc.perform(get("/api/v1/billing/balance?kind=moon-bucks")
                        .header(BillingController.SUBJECT_HEADER, ACTOR.toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Unknown credit kind: moon-bucks"));

        verify(billing).getCreditBalance(ACTOR, "moon-bucks");
    }

    @Test
    void aPlanReadForAnIdNobodyHoldsIsRefusedWithTheServicesOwnSentence() throws Exception {
        when(billing.getSubscriptionPlan(ACTOR))
                .thenThrow(new IllegalArgumentException("User not found: " + ACTOR));

        mvc.perform(get("/api/v1/billing/plan")
                        .header(BillingController.SUBJECT_HEADER, ACTOR.toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("User not found: " + ACTOR));

        verify(billing).getSubscriptionPlan(ACTOR);
    }
}
