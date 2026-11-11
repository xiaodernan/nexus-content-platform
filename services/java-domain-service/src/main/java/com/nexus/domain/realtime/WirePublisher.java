package com.nexus.domain.realtime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Java 侧实时总线的生产者（§SC-53）。
 *
 * <p>把一帧写上 {@link #WIRE_CHANNEL}——web/Studio 进程里已有的订阅端听的就是这条线路。
 * 这是<strong>跨进程</strong>那条腿：同 JVM 内还有本地调用，不需要绕 Redis。
 *
 * <p>Redis pub/sub 无送达保证：没人听这帧就自然丢掉，所以它不允许影响任何业务的正确性。
 * 发布失败（线路挂了/序列化失败）记日志、返回 {@code null}，<strong>绝不抛到调用方</strong>——
 * 总线不能比它服务的业务更脆弱（与 web 侧 `redisBus.ts` 的 publish 纪律一致）。
 *
 * <p>帧形状与 web 的 {@code RealtimeWireFrameSchema} 一一对应（packages/schemas/src/index.ts）：
 * <pre>{@code
 * {"kind":"event","origin":"java-domain-service","channel":"<逻辑通道>",
 *  "event":{"type":"notification","level":"info","title":"…","body":"…","projectId":"…"?}}
 * }</pre>
 * `origin` 用的是稳定串：web 侧用它跳过<strong>自身</strong>回环的帧，Java 源与 studio 源天然不撞。
 */
@Component
public class WirePublisher {

    static final String WIRE_CHANNEL = "nexus:realtime:v1";

    static final String DEFAULT_CHANNEL = "projects:probe";

    /** web 订阅方按这个前缀辨认 Java 源的帧。恒为此值，勿改。 */
    static final String ORIGIN = "java-domain-service";

    private static final Logger log = LoggerFactory.getLogger(WirePublisher.class);

    private final StringRedisTemplate redis;

    public WirePublisher(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /**
     * 发一条 {@code notification} 帧。
     *
     * @param channel   逻辑通道（订阅方按它路由）；空/白 = 拒绝发送并抛 {@link IllegalArgumentException}。
     * @param projectId 项目上下文；{@code null} 合法——事件不带着项目也合法。
     * @param title     一句话标题；空/白 = 拒绝（notification 要求 title）。
     * @param body      可选详文。
     * @return 上线字节（与测试断言用的同一份字符串）；线路拒收时返回 {@code null}。
     */
    public String publishNotification(String channel, String projectId, String title, String body) {
        String json = frameJson(channel, projectId, title, body);
        try {
            redis.convertAndSend(WIRE_CHANNEL, json);
            return json;
        } catch (RuntimeException e) {
            log.warn("realtime wire publish failed: {}", e.getMessage());
            return null;
        }
    }

    /** 组线路帧 JSON。参数不合法直接抛——web 侧 min(1) 把这条帧丢掉只会让排障更难。 */
    static String frameJson(String channel, String projectId, String title, String body) {
        if (channel == null || channel.isBlank()) {
            throw new IllegalArgumentException("channel 不能为空：web 侧 RealtimeWireFrameSchema 要求 channel min(1)");
        }
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("title 不能为空：notification 事件按契约必须带 title");
        }
        StringBuilder sb = new StringBuilder(256);
        sb.append("{\"kind\":\"event\"");
        sb.append(",\"origin\":\"").append(quote(ORIGIN)).append('"');
        sb.append(",\"channel\":\"").append(quote(channel)).append('"');
        sb.append(",\"event\":{");
        sb.append("\"type\":\"notification\"");
        sb.append(",\"level\":\"info\"");
        if (projectId != null && !projectId.isBlank()) {
            sb.append(",\"projectId\":\"").append(quote(projectId)).append('"');
        }
        sb.append(",\"title\":\"").append(quote(title)).append('"');
        if (body != null && !body.isBlank()) {
            sb.append(",\"body\":\"").append(quote(body)).append('"');
        }
        sb.append("}}");
        return sb.toString();
    }

    /** 只转义我们实际会发出去的字符集：引号、反斜杠与控制符。 */
    static String quote(String value) {
        StringBuilder sb = new StringBuilder(value.length() + 8);
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        return sb.toString();
    }
}
