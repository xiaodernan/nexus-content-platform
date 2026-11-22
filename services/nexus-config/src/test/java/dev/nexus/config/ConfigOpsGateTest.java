package dev.nexus.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.config.environment.Environment;
import org.springframework.cloud.config.environment.PropertySource;
import org.springframework.cloud.config.server.environment.EnvironmentRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * ADR-0313 —— 操作面的门：没配令牌要说"没配"，配了才比令牌。
 *
 * <p>这三条写成进程内单测而不是起一个 Spring 上下文，是因为要量的东西就是那个判断本身，
 * 而起两个上下文（有令牌 / 没令牌）只为读一个 5xx，代价换不到更多证据。
 * 端到端那条路径由 {@code ConfigOpsRefreshAuditTest} 在真 HTTP 上覆盖。
 */
class ConfigOpsGateTest {

    private static final String TOKEN = "correct-admin-token";

    /** 一个最小配置源：内容随 supplier 变，用来在同一个进程里演"源读不到"和"源恢复正常"。 */
    private static EnvironmentRepository stubRepository(java.util.function.Supplier<Map<String, Object>> content) {
        return (application, profile, label) -> {
            Environment environment = new Environment(application, new String[] {profile});
            Map<String, Object> source = content.get();
            if (!source.isEmpty()) {
                environment.add(new PropertySource("stub-" + application + ".yml", source));
            }
            return environment;
        };
    }

    private static EnvironmentRepository stubRepository() {
        return stubRepository(() -> {
            Map<String, Object> source = new LinkedHashMap<>();
            source.put("nexus.shared.rate", 10);
            source.put("nexus.db.password", "s3cr3t-rotation-value");
            return source;
        });
    }

    private static ConfigOpsController controller(String token) {
        ConfigOpsService ops = new ConfigOpsService(stubRepository());
        return new ConfigOpsController(ops, new ConfigChangeAudit(200), token);
    }

    private static ConfigOpsController controller(String token, java.util.function.Supplier<Map<String, Object>> source) {
        return new ConfigOpsController(new ConfigOpsService(stubRepository(source)), new ConfigChangeAudit(200), token);
    }

    private static MockHttpServletRequest request(String header) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        if (header != null) {
            request.addHeader("X-Nexus-Config-Admin", header);
        }
        return request;
    }

    /**
     * 臂 1：漏配运维令牌时三个端点都必须是 503，不能有一个"看起来能用"。
     *
     * <p>失败方向决定一切：默认放开等于把配置键与非敏感值摆在没有网关的那台端口上（客户端要能在注册前
     * 读到配置中心，所以它今天不在网关后面）。503 说的就是"这里没配置好，别看"。
     */
    @Test
    void anUnconfiguredAdminTokenShutsAllThreeEndpointsInsteadOfLeavingThemOpen() {
        ConfigOpsController open = controller("");
        for (ResponseEntity<?> response : List.of(
                open.version(request(null), "nexus-api", "default"),
                open.refresh(request(null), "nexus-api", "default", null),
                open.audit(request(null), 20))) {
            assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.getStatusCode(), "没配令牌却放行了");
            assertNotNull(response.getBody());
            assertFalse(String.valueOf(response.getBody()).contains("s3cr3t-rotation-value"),
                    "被拒的请求不许顺带把值吐出来");
        }
        assertEquals(
                "admin_token_unconfigured",
                ((Map<?, ?>) open.version(request(null), "nexus-api", "default").getBody()).get("probe"));
    }

    /** 臂 2：配了令牌不等于放行——错的与缺失都要 401。 */
    @Test
    void aConfiguredTokenStillRejectsWrongAndMissingPresentations() {
        ConfigOpsController gated = controller(TOKEN);
        assertEquals(HttpStatus.UNAUTHORIZED, gated.version(request("nope"), "nexus-api", "default").getStatusCode());
        assertEquals(
                HttpStatus.UNAUTHORIZED,
                gated.refresh(request("nope"), "nexus-api", "default", null).getStatusCode());
        assertEquals(HttpStatus.UNAUTHORIZED, gated.audit(request(null), 20).getStatusCode());
        assertEquals(HttpStatus.OK, gated.audit(request(TOKEN), 20).getStatusCode(), "对的令牌必须能用，否则门是焊死的");
    }

    /** 臂 3：空白令牌当没配，不当"空字符串也算一个口令"。 */
    @Test
    void aBlankTokenIsTreatedAsUnconfiguredInsteadOfMatchingAnEmptyHeader() {
        ConfigOpsController blank = controller("   ");
        ResponseEntity<?> response = blank.audit(request(""), 20);
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.getStatusCode(),
                "空口令配空 header 就放行，等于没有门");
    }

    /** 臂 4：指纹与端点口径一致，且 version 只说形状不说值。 */
    @Test
    void theVersionEndpointReportsAShapeWithoutReportingValues() {
        ConfigOpsController gated = controller(TOKEN);
        Map<?, ?> body = (Map<?, ?>) gated.version(request(TOKEN), "nexus-api", "default").getBody();
        assertNotNull(body.get("digest"));
        assertEquals(2, body.get("keyCount"));
        assertFalse(String.valueOf(body).contains("s3cr3t-rotation-value"), "拿到 200 不等于看见内容");
    }

    /** 臂 5：刷新一次之后，profile 也要参与基线隔离。 */
    @Test
    void profilesKeepSeparateBaselines() {
        ConfigOpsController gated = controller(TOKEN);
        // 进程内拿到的是 RefreshResponse 本身，不是它序列化出来的 JSON——用访问器读，别拿 Map 猜键名。
        ConfigOpsController.RefreshResponse prod =
                (ConfigOpsController.RefreshResponse) gated.refresh(request(TOKEN), "nexus-api", "prod", "zhao").getBody();
        assertEquals("established", prod.status());
        ConfigOpsController.RefreshResponse def =
                (ConfigOpsController.RefreshResponse) gated.refresh(request(TOKEN), "nexus-api", "default", "zhao").getBody();
        assertEquals("established", def.status(), "两个 profile 共用了一条基线");
        ConfigOpsController.RefreshResponse again =
                (ConfigOpsController.RefreshResponse) gated.refresh(request(TOKEN), "nexus-api", "prod", "zhao").getBody();
        assertEquals("unchanged", again.status());

        @SuppressWarnings("unchecked")
        List<ConfigChangeAudit.Entry> entries =
                (List<ConfigChangeAudit.Entry>) ((Map<String, Object>) gated.audit(request(TOKEN), 50)
                        .getBody()).get("entries");
        assertEquals(2, entries.stream().filter(e -> "nexus-api".equals(e.application())).count(),
                "两条 profile 各记一条基线，不许合成一条");
        assertTrue(entries.stream().allMatch(ConfigChangeAudit.Entry::baseline), "三次里只有两次是真的基线");
    }

    /** 臂 7：一个空源必须自己说"我是空的"，不能只留一个 keyCount: 0。 */
    @Test
    void anEmptySourceIsDistinguishedFromADeploymentThatSetsNothing() {
        java.util.concurrent.atomic.AtomicReference<Map<String, Object>> content =
                new java.util.concurrent.atomic.AtomicReference<>(Map.of());
        ConfigOpsController gated = controller(TOKEN, content::get);

        Map<?, ?> empty = (Map<?, ?>) gated.version(request(TOKEN), "probe-empty", "default").getBody();
        assertEquals(0, empty.get("keyCount"));
        assertEquals(Boolean.TRUE, empty.get("servedEmpty"),
                "0 个键有两种来路（这个部署什么都不设 / search-locations 拼错读不到），200 + 0 只说了一个");

        content.set(Map.of("nexus.shared.rate", 10));
        Map<?, ?> full = (Map<?, ?>) gated.version(request(TOKEN), "probe-empty", "default").getBody();
        assertEquals(1, full.get("keyCount"));
        assertEquals(Boolean.FALSE, full.get("servedEmpty"), "有内容还报空源，这条线就自己废了");
    }

    /**
     * 臂 8：空源不许当基线，也不许写账。
     *
     * <p>要挡的事故很具体：一次拼错的 {@code search-locations}（实测过，Windows JVM 上
     * {@code file:///tmp/...} 落到不存在的目录）让服务端返回 HTTP 200 但零个属性源。如果这次刷新被记成
     * 基线，那么源修好之后的下一次刷新就会把"每一个键都是新增"报成一次真实变更——一个运维错误被洗成一串
     * 假变更，而且账本里还留下证据。所以这里 503、原样留着基线、不落账；修好之后第一次正常刷新必须报
     * {@code established}。
     */
    @Test
    void aRefreshAgainstAnEmptySourceRefusesToEstablishOrOverwriteABaseline() {
        java.util.concurrent.atomic.AtomicReference<Map<String, Object>> content =
                new java.util.concurrent.atomic.AtomicReference<>(Map.of());
        ConfigChangeAudit audit = new ConfigChangeAudit(200);
        ConfigOpsController gated =
                new ConfigOpsController(new ConfigOpsService(stubRepository(content::get)), audit, TOKEN);

        ResponseEntity<?> refused = gated.refresh(request(TOKEN), "probe-empty-src", "default", "zhao");
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, refused.getStatusCode(), "空源当成功就是替这个拼写错误作保");
        assertEquals("empty-source", ((ConfigOpsController.RefreshResponse) refused.getBody()).status());
        assertEquals(0, audit.size(), "被拒的刷新不许进账本");

        content.set(Map.of("nexus.shared.rate", 10));
        ConfigOpsController.RefreshResponse first =
                (ConfigOpsController.RefreshResponse) gated
                        .refresh(request(TOKEN), "probe-empty-src", "default", "zhao").getBody();
        assertEquals("established", first.status(),
                "基线被空源污染过——修好后本该是建立基线，而不是报一串'每个键都新增'");
        assertTrue(first.added().isEmpty(), "established 不该带着一堆 added 键");
        assertEquals(1, audit.size(), "只有那条基线该落账");
    }

    /**
     * 臂 9：源读不出来（抛）时，操作面要自己指认，且不能把内部路径交给 caller。
     *
     * <p>实测来路：{@code search-locations} 写成 {@code file://C:\Users\...} —— 非法的 file URL。
     * 服务照常起、照常收请求，每一次读都抛 MalformedURLException 包的 IllegalStateException。
     * 默认那个 500 页只说"端点坏了"；这里要的是"哪一半坏了"，并且修好之后第一次正常刷新仍是
     * {@code established}（一次读失败不该在基线或账本里留下任何痕迹）。
     */
    @Test
    void aSourceThatRaisesNamesItselfWithoutHandingOverTheStack() {
        java.util.concurrent.atomic.AtomicBoolean broken = new java.util.concurrent.atomic.AtomicBoolean(true);
        ConfigChangeAudit audit = new ConfigChangeAudit(200);
        ConfigOpsController gated = new ConfigOpsController(
                new ConfigOpsService(stubRepository(() -> {
                    if (broken.get()) {
                        // 真机上就是这个形状：YamlProcessor 把 MalformedURLException 包成 IllegalStateException 抛出。
                        throw new IllegalStateException(
                                new java.net.MalformedURLException("Unsupported non-local file URL: file://C:\\x\\y"));
                    }
                    Map<String, Object> source = new LinkedHashMap<>();
                    source.put("nexus.shared.rate", 10);
                    return source;
                })),
                audit,
                TOKEN);

        ResponseEntity<?> version = gated.version(request(TOKEN), "probe-broken", "default");
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, version.getStatusCode(), "源抛了却回 200/500 都不算说清");
        Map<?, ?> body = (Map<?, ?>) version.getBody();
        assertEquals("source_error", body.get("probe"));
        assertEquals("IllegalStateException", body.get("cause"));
        assertFalse(String.valueOf(body).contains("C:\\x\\y"), "短类名是给运维看的，路径不是");

        ConfigOpsController.RefreshResponse refused = (ConfigOpsController.RefreshResponse) gated
                .refresh(request(TOKEN), "probe-broken", "default", "zhao").getBody();
        assertEquals("source-error", refused.status());
        assertEquals("IllegalStateException", refused.cause());
        assertNull(refused.newDigest(), "读失败时没有'这一版的指纹'这回事");
        assertEquals(0, audit.size(), "失败的刷新不进账本");

        broken.set(false);
        ConfigOpsController.RefreshResponse first = (ConfigOpsController.RefreshResponse) gated
                .refresh(request(TOKEN), "probe-broken", "default", "zhao").getBody();
        assertEquals("established", first.status(), "一次读失败被记成了基线，恢复后就会报一串假变更");
    }

    /** 臂 6：名字形状先拒，且被拒时不建基线（否则一个乱码名字就能占住内存槽位）。 */
    @Test
    void aRejectedNameNeverCreatesABaseline() {
        ConfigOpsController gated = controller(TOKEN);
        assertEquals(HttpStatus.BAD_REQUEST, gated.version(request(TOKEN), "../secrets", "default").getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, gated.version(request(TOKEN), "", "default").getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, gated.version(request(TOKEN), "ok", "a b").getStatusCode());
        assertTrue(gated.refresh(request(TOKEN), "probe-ok", "default", "zhao").getStatusCode().is2xxSuccessful());
        // 一个 80 字符的名字不该挤进基线表：它连正则都过不去。
        assertEquals(HttpStatus.BAD_REQUEST,
                gated.version(request(TOKEN), "a".repeat(80), "default").getStatusCode());
    }
}
