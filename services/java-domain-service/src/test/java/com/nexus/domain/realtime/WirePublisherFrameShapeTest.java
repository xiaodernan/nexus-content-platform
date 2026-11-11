package com.nexus.domain.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * 帧形状与字节级契约（§SC-53）。
 *
 * <p>要判分的主张只有一个：Java 写上线路的那串字节，web 侧按 {@code RealtimeWireFrameSchema}
 * safeParse 必须成功——否则 web 会静默丢掉它，线路看似"活着"实则无人听见。
 * 直接在断言里对齐 schema 的字段要求（kind/origin/channel 均 min(1)、event.type=notification、
 * level=info、title 必填），任何一处漂移都会在这个单测里报出来。
 */
class WirePublisherFrameShapeTest {

    @Test
    void frameMatchesTheWebSchema() {
        String frame = WirePublisher.frameJson("projects:probe", null, "title", null);
        assertThat(frame).contains("\"kind\":\"event\"");
        assertThat(frame).contains("\"origin\":\"java-domain-service\"");
        assertThat(frame).contains("\"channel\":\"projects:probe\"");
        assertThat(frame).contains("\"event\":{\"type\":\"notification\"");
        assertThat(frame).contains("\"level\":\"info\"");
        assertThat(frame).contains("\"title\":\"title\"");
        // origin 不能为空、channel 不能为空——web 侧两个 min(1)，一个都不能踩
        assertThat(frame).doesNotContain("\"origin\":\"\"");
        assertThat(frame).doesNotContain("\"channel\":\"\"");
    }

    @Test
    void frameWithProjectIdCarriesIt() {
        String frame = WirePublisher.frameJson("projects:abc-123", "abc-123", "x", null);
        assertThat(frame).contains("\"projectId\":\"abc-123\"");
        assertThat(frame).contains("\"channel\":\"projects:abc-123\"");
    }

    @Test
    void frameEscapesSpecialCharsWithoutBreakingQuotes() {
        String hostile = "this\ncontains \"quotes\" and backslash \\ and an integer-like 42 and zero 0";
        String frame = WirePublisher.frameJson("projects:x", null, hostile, null);
        assertThat(frame).doesNotContain("\n");
        assertThat(frame).contains("\\n");
        assertThat(frame).contains("\\\"quotes\\\"");
        assertThat(frame).contains("\\\\");
    }

    @Test
    void blankChannelIsRejectedNotSent() {
        assertThatThrownBy(() -> WirePublisher.frameJson("", null, "t", null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> WirePublisher.frameJson("   ", null, "t", null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> WirePublisher.frameJson(null, null, "t", null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void blankTitleIsRejectedNotSent() {
        assertThatThrownBy(() -> WirePublisher.frameJson("projects:x", null, "", null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> WirePublisher.frameJson("projects:x", null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void redisRefusalTurnsIntoNullNotIntoAnException() {
        var unreachable = new StringRedisTemplate();
        // 指到一个不可连的端口；Lettuce 懒连接，convertAndSend 时才失败
        var factory = new LettuceConnectionFactory("127.0.0.1", 1);
        unreachable.setConnectionFactory(factory);
        factory.afterPropertiesSet();
        String result = new WirePublisher(unreachable).publishNotification("projects:x", null, "t", null);
        assertThat(result).isNull();
        factory.destroy();
    }
}
