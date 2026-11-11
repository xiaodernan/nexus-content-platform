package com.nexus.domain.realtime;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import org.springframework.http.HttpStatus;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/**
 * §SC-61 — probe 门（operator token 是唯一的钥匙；部署缺 token = probe 永远关闭）。
 *
 * <p>判据与实现一一对应：用 {@code operatorToken} 注入给构造器，真驱动 Gateway 身份的判分逻辑——
 * (1) token 空 = 永远 403，不管 header 写什么；(2) header 缺 或 值不等 → 403；(3) 对 + post →
 * 200 + published=true + 固定帧形态；(4) Redis 不可达 → 503 Published=false。
 *
 * <p>优先级：实现是 zero-auth simple token——不冒充 gateway 的 X-Nexus-Subject 或 JWT space，
 * 这一片靠 `nexus.operator.token` 由部署决定存在性，不默认开门。
 */
@ExtendWith(MockitoExtension.class)
class RealtimeControllerTest {

    private static final String HEADER = "X-Nexus-Operator-Token";

    @Mock
    private WirePublisher publisher;

    private MockMvc mvcWithToken;
    private MockMvc mvcWithoutToken;

    @BeforeEach
    void setUp() {
        mvcWithToken = MockMvcBuilders
                .standaloneSetup(new RealtimeController(publisher, "deploy-token-123"))
                .build();
        // 探针场景：部署方没设置 operator token → 探针永远关
        mvcWithoutToken = MockMvcBuilders
                .standaloneSetup(new RealtimeController(publisher, ""))
                .build();
    }

    @Test
    void emptyOperatorTokenClosesTheDoor_evenWithAHeader() throws Exception {
        mvcWithoutToken.perform(post("/api/v1/realtime/probe")
                        .header(HEADER, "deploy-token-123"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("probe_disabled"))
                .andExpect(jsonPath("$.published").value(false));
    }

    @Test
    void missingOperatorHeaderIsRejected() throws Exception {
        mvcWithToken.perform(post("/api/v1/realtime/probe"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("operator_token_required"));
    }

    @Test
    void wrongOperatorHeaderIsRejected() throws Exception {
        mvcWithToken.perform(post("/api/v1/realtime/probe")
                        .header(HEADER, "something-else"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("operator_token_required"));
    }

    @Test
    void correctHeaderPublishesFixedFrame() throws Exception {
        org.mockito.Mockito.when(publisher.publishNotification(
                        WirePublisher.DEFAULT_CHANNEL, null, "probe event", null))
                .thenReturn("{\"kind\":\"event\"}");

        MvcResult res = mvcWithToken.perform(post("/api/v1/realtime/probe")
                        .header(HEADER, "deploy-token-123"))
                .andExpect(status().isOk())
                .andReturn();

        String body = res.getResponse().getContentAsString();
        assertThat(body).contains("\"published\":true");
        assertThat(body).contains("\"frame\":\"{\\\"kind\\\":\\\"event\\\"}\"");
    }

    @Test
    void redisUnreachableTurnsInto503_notAFakeSuccess() throws Exception {
        org.mockito.Mockito.when(publisher.publishNotification(
                        WirePublisher.DEFAULT_CHANNEL, null, "probe event", null))
                .thenReturn(null);

        mvcWithToken.perform(post("/api/v1/realtime/probe")
                        .header(HEADER, "deploy-token-123"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.published").value(false))
                .andExpect(jsonPath("$.error").value("redis_unavailable"));
    }

    @Test
    void legalTokenDoesNotBypassChannelOrMessageOverride() throws Exception {
        // Probe 不接受 channel/title 参数，不意味着 "probe can be laundering line payloads"
        org.mockito.Mockito.when(publisher.publishNotification(
                        WirePublisher.DEFAULT_CHANNEL, null, "probe event", null))
                .thenReturn("{\"published\":true}");

        MvcResult res = mvcWithToken.perform(post("/api/v1/realtime/probe")
                        .param("channel", "whatever")   // IGNORED by probe; verify publisher receives DEFAULT
                        .param("title", "whatever")
                        .header(HEADER, "deploy-token-123"))
                .andExpect(status().isOk())
                .andReturn();

        org.mockito.Mockito.verify(publisher).publishNotification(
                WirePublisher.DEFAULT_CHANNEL, null, "probe event", null);
    }
}
