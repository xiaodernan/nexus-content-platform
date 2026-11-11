package com.nexus.domain.feign;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * §SC-59 — AiHealthController 的判分。
 *
 * <p>三个镜头钉死它唯一会被争论的点：Java→Python 这一跳的**报文原样**端出去、不被加工；
 * 上游死了**不**翻译成异常页——body 里说 degraded，HTTP 依然 200（探针不该"自己晕了"）；
 * 健康的报文缺字段是 truth，不是这跳的 bug，不许 fabricated providers。
 */
@ExtendWith(MockitoExtension.class)
class AiHealthControllerTest {

    @Mock
    private AiServiceClient ai;

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new AiHealthController(ai)).build();
    }

    private static Map<String, Object> bodyOf(MvcResult result) throws Exception {
        String json = result.getResponse().getContentAsString();
        return new com.fasterxml.jackson.databind.ObjectMapper()
                .readValue(json, Map.class);
    }

    @Test
    void healthyPassthroughKeepsTheUpstreamReportVerbatim() throws Exception {
        Map<String, Object> upstream = Map.of(
                "service", "nexus-ai-service",
                "capability", "unavailable",
                "providers", List.of(Map.of("kind", "llm", "name", "openai-compatible", "status", "unavailable")),
                "queue", Map.of("backend", "memory", "pending", 0, "running", 0));
        when(ai.healthz()).thenReturn(upstream);

        MvcResult result = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/system/ai-health"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        Map<String, Object> body = bodyOf(result);
        assertThat(body.get("status")).isEqualTo("healthy");
        assertThat(body.get("service")).isEqualTo("nexus-ai-service");
        assertThat(body.get("capability")).isEqualTo("unavailable");
        assertThat(((List<?>) body.get("providers"))).hasSize(1);
        assertThat(((Map<?, ?>) body.get("queue")).get("backend")).isEqualTo("memory");
        assertThat(((Number) body.get("responseTimeMs")).longValue()).isGreaterThanOrEqualTo(0L);
    }

    @Test
    void upstreamDownIsDegradedWithClassNameNotA500() throws Exception {
        when(ai.healthz()).thenThrow(new RuntimeException("connect refused to 127.0.0.1:8000"));

        MvcResult result = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/system/ai-health"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        Map<String, Object> body = bodyOf(result);
        assertThat(body.get("status")).isEqualTo("degraded");
        assertThat(body.get("error")).isEqualTo("RuntimeException");
        assertThat(String.valueOf(body.get("message"))).contains("connect refused");
        assertThat(((Number) body.get("responseTimeMs")).longValue()).isGreaterThanOrEqualTo(0L);
        assertThat(body).doesNotContainKey("providers");
    }

    @Test
    void minimalUpstreamReportIsAcceptedWithoutInventedFields() throws Exception {
        when(ai.healthz()).thenReturn(Map.of("service", "nexus-ai-service", "version", "0.1.0"));

        MvcResult result = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/system/ai-health"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        Map<String, Object> body = bodyOf(result);
        assertThat(body.get("status")).isEqualTo("healthy");
        assertThat(body.get("version")).isEqualTo("0.1.0");
        assertThat(body).doesNotContainKey("providers");
    }
}
