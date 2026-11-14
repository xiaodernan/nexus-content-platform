package com.nexus.domain.realtime;

import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 线路探针（§SC-61）。让一个 operator（携带 {@code X-Nexus-Operator-Token}）确认
 * "Java 帧 → Redis 线路 → web/Studio 订阅端" 这条跨进程链路还活着——不等真实事件。
 *
 * <p>两个端点：
 * <ul>
 *   <li>{@code POST /api/v1/realtime/probe} — 发出一帧固定的 notification（`projects:probe` /
 *       `"probe event"`）；签名 token 通过 {@code X-Nexus-Operator-Token} 传递。
 *       <b>不接受任何调用方提供的 channel/title/body</b>——那是注入入口；probe 不是博客的
 *       特权发件人，只证明链路还通。</li>
 *   <li>{@code GET /api/v1/realtime/stats} — 本进程的帧发送/丢帧/线路异常计数；敞开可读、不带载荷。</li>
 * </ul>
 *
 * <p><b>门口契约。</b> ops token 不存在 = probe 一律 403（没有 deployment 就没有探针）；
 * 缺 token = 403；错误 token = 403。{@code X-Nexus-Operator-Token} 是唯一授权的钥匙——
 * 不是 {@code X-Nexus-Subject}。开门只认部署时由运维环境决定，不在代码里设默认。
 *
 * <p><b>为什么 probe 不参与业务。</b> 帧在写出去以后就丢了——它的目的是给运维一面"线路还连着"的镜子，
 * 不是给 web 控制面板喂食。频道/title/内容都是非定制（projects:probe / probe event）在虚的锁里。
 */
@RestController
@RequestMapping("/api/v1/realtime")
public class RealtimeController {

    static final String OPERATOR_HEADER = "X-Nexus-Operator-Token";

    private final WirePublisher publisher;
    /** empty = door closed；env 注入后才开 */
    private final String operatorToken;

    public RealtimeController(WirePublisher publisher,
                              @Value("${nexus.operator.token:}") String operatorToken) {
        this.publisher = publisher;
        this.operatorToken = operatorToken;
    }

    @PostMapping("/probe")
    public ResponseEntity<Map<String, Object>> probe(
            @RequestHeader(value = OPERATOR_HEADER, required = false) String operatorHeader) {
        if (operatorToken == null || operatorToken.isBlank()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("published", false, "error", "probe_disabled"));
        }
        if (operatorHeader == null || !operatorHeader.equals(operatorToken)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("published", false, "error", "operator_token_required"));
        }
        String json = publisher.publishNotification(WirePublisher.DEFAULT_CHANNEL, null, "probe event", null);
        if (json == null) {
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
     * 读数口径：这进程的帧——{@code publishedTotal} 成功 / {@code tooLargeDropped} 超限丢 /
     * {@code redisFailures} 线路异常。不打库。敞开（同 {@code /policy}、/policy），
     * 只带计数不带内容。
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
