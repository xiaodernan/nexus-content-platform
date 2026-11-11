package com.nexus.domain.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

/**
 * 回环实测（§SC-53）：Java 生产者 → Redis 线路 → 订阅者收到同一帧。
 *
 * <p>Redis 不可达时整测跳过（{@code assumeTrue}），绝不假装跑过；本机 {@code 127.0.0.1:56379}
 * 是这个项目自己的 nexus-redis（docs/ENVIRONMENT.md）。
 *
 * <p>订阅在发布之前建立，且给容器 500ms 完成 SUBSCRIBE 握手——pub/sub 的送达窗口从
 * 订阅生效开始，不是从 {@code container.start()} 返回开始；不等握手就先发，这帧大概率丢，
 * 但那测的是时序不是线路。
 */
class WirePublisherRoundTripTest {

    @Test
    void aJavaFrameLandsOnTheWireAndParsesAsAWireFrame() throws Exception {
        var cf = new LettuceConnectionFactory("127.0.0.1", 56379);
        cf.afterPropertiesSet();
        boolean up;
        try {
            new StringRedisTemplate(cf).getConnectionFactory().getConnection().ping();
            up = true;
        } catch (RuntimeException e) {
            up = false;
        }
        assumeTrue(up, "redis at 127.0.0.1:56379 is unreachable; skipping the live round-trip");

        var container = new RedisMessageListenerContainer();
        container.setConnectionFactory(cf);
        AtomicReference<String> received = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        container.addMessageListener((message, pattern) -> {
            received.set(new String(message.getBody(), StandardCharsets.UTF_8));
            latch.countDown();
        }, new ChannelTopic(WirePublisher.WIRE_CHANNEL));
        container.afterPropertiesSet();
        container.start();
        Thread.sleep(500);

        String sent = new WirePublisher(new StringRedisTemplate(cf))
                .publishNotification("projects:roundtrip", "p-abc", "roundtrip-title", "roundtrip-body");
        assertThat(sent).isNotNull();

        boolean arrived = latch.await(5, TimeUnit.SECONDS);
        container.stop();
        container.destroy();
        cf.destroy();

        assumeTrue(arrived, "the subscriber did not see the frame within 5s; wire or subscribe path is broken");
        assertThat(received.get()).isEqualTo(sent);
        // 帧字节与 web 侧 safeParse 认的同一形状
        assertThat(received.get()).contains("\"kind\":\"event\"");
        assertThat(received.get()).contains("\"origin\":\"java-domain-service\"");
        assertThat(received.get()).contains("\"channel\":\"projects:roundtrip\"");
        assertThat(received.get()).contains("\"projectId\":\"p-abc\"");
        assertThat(received.get()).contains("\"title\":\"roundtrip-title\"");
    }
}
