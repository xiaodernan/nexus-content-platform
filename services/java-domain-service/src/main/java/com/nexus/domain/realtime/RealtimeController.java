package com.nexus.domain.realtime;

import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 线路探针（§SC-53）。让一个外部操作员（经网关）能在不等真实领域事件的情况下，
 * 验证 "Java 发帧 → Redis 线路 → web/Studio 订阅" 这条链是活的。
 *
 * <p>门纪律与其他 domain-service 端点一致：{@code X-Nexus-Subject} 必须是合法 UUID
 * （网关做了之后这里才是信任的边界，缺了/错了直接 400）。
 * 线路拒收时回 503 + {@code published:false}——不把"没发出去"包装成成功。
 */
@RestController
@RequestMapping("/api/v1/realtime")
public class RealtimeController {

    static final String SUBJECT_HEADER = "X-Nexus-Subject";

    private final WirePublisher publisher;

    public RealtimeController(WirePublisher publisher) {
        this.publisher = publisher;
    }

    @PostMapping("/probe")
    public ResponseEntity<Map<String, Object>> probe(
            @RequestHeader(SUBJECT_HEADER) UUID subject,
            @RequestParam(defaultValue = WirePublisher.DEFAULT_CHANNEL) String channel,
            @RequestParam(defaultValue = "probe event") String title,
            @RequestParam(required = false) String projectId,
            @RequestParam(required = false) String body) {
        String json = publisher.publishNotification(channel, projectId, title, body);
        if (json == null) {
            // `redis_unavailable` 保留这个识别符（SC-53 已发布、smoke 可能按它判断）；
            // 精确原因（tooLargeDropped vs redisFailures）去 GET /api/v1/realtime/stats 对账。
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("published", false, "error", "redis_unavailable",
                            "note", "精确原因见 GET /api/v1/realtime/stats"));
        }
        return ResponseEntity.ok(Map.of(
                "published", true,
                "channel", WirePublisher.WIRE_CHANNEL,
                "frame", json));
    }

    /**
     * 读数口径：这进程进出的帧——{@code publishedTotal} 成功 / {@code tooLargeDropped} 超限丢 /
     * {@code redisFailures} 线路异常。不打库。是否需要认证同 {@code /policy} 一样敞开——
     * 数字不带内容，不外泄任何请求的载荷。
     */
    @GetMapping("/stats")
    public Map<String, Object> stats() {
        return publisher.stats();
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> refuse(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
    }
}
