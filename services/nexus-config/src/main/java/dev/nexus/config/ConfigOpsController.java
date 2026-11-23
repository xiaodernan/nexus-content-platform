package dev.nexus.config;

import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * ADR-0313 — 配置中心的操作面：现在供的是哪一版、再读一次有没有变、上一次变的是什么。
 *
 * <p>三个端点都只做一件事，都不写配置：这个服务仍然是只读的（写配置要把机密放进进程能写的目录，
 * 那是另一个决策，见 ADR-0313）。"刷新"在这里的含义是<b>重新读取真值并把差异说出来</b>，
 * 而不是"把新值推进去"——推进去的那一半属于客户端，见本片的已知未完成。
 *
 * <p><b>为什么要令牌，而且没配就是 503。</b>审计里存的是配置键与非敏感值；配置中心今天在任何部署里
 * 都不在网关后面（客户端要能在注册之前就读到它），所以这个面不能默认对外说得这么细。
 * 更关键的是失败方向：漏配运维令牌时，一个"看起来在工作"的 200 会把操作面敞着；
 * 503 说的是"这里没有配置好，别看"。本仓库对同一形状的判断已经做过两次（ADR 0310 的能力行、
 * §SEC 第三十五片的驱动读数）：没配要像没配。
 *
 * <p><b>名字先验再进门。</b>{@code application} 与 {@code profile} 会拼进资源路径
 * （Spring Cloud native 用 {@code /{application}-{profile}.yml}）。把 {@code ..} 放进查询串
 * 不是"传了个奇怪的参数"，是在试探进程能读到配置目录之外的什么地方，所以形状不合法就 400，
 * 而且 400 之前不碰 repository、不写账本。
 */
@RestController
@RequestMapping("/nexus/config/ops")
public class ConfigOpsController {

    /** 只允许成为文件名的那批字符；显式排除分隔符，不靠"看起来不像路径"。 */
    private static final Pattern NAME = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,63}");

    private static final String UNCONFIGURED = "admin_token_unconfigured";
    private static final String BAD_NAME = "name_rejected";
    private static final String SOURCE_ERROR = "source_error";

    private final ConfigOpsService ops;
    private final ConfigChangeAudit audit;
    private final String adminToken;

    /** 上一轮看见的那一版，按 {@code application/profile} 分别记 —— 两条配置线不该共用一个基线。 */
    private final Map<String, ConfigOpsService.Snapshot> baselines = new ConcurrentHashMap<>();

    public ConfigOpsController(
            ConfigOpsService ops,
            ConfigChangeAudit audit,
            @Value("${nexus.config.admin-token:}") String adminToken) {
        this.ops = ops;
        this.audit = audit;
        this.adminToken = adminToken == null ? "" : adminToken.trim();
    }

    /** 当前这一版的指纹与键数；不返回值，所以拿到 200 不等于看见内容。源读不出来时是 503，见 {@link #sourceFailure}。 */
    @GetMapping("/version")
    public ResponseEntity<?> version(
            HttpServletRequest request, @RequestParam String application, @RequestParam(defaultValue = "default") String profile) {
        ResponseEntity<?> denied = gate(request);
        if (denied != null) {
            return denied;
        }
        if (!legal(application) || !legal(profile)) {
            return badName();
        }
        ConfigOpsService.Snapshot snapshot;
        try {
            snapshot = ops.read(application, profile);
        } catch (Exception e) {
            return sourceFailure(e);
        }
        return ResponseEntity.ok(Map.of(
                "application", application,
                "profile", profile,
                "digest", snapshot.digest(),
                "keyCount", snapshot.values().size(),
                // 0 个键有两种来路：这个部署真的什么都不设，以及 search-locations 拼错读不到任何东西。
                // 实测过一次（file:///tmp/... 在 Windows JVM 上落到不存在的目录），200 + 空报文，
                // 客户端只会退回自己打包的默认值，还以为中心答过。所以 0 必须自己说是不是空源。
                "servedEmpty", snapshot.values().isEmpty(),
                "baseline", baselines.containsKey(key(application, profile))));
    }

    /**
     * 刷新回的形状。
     *
     * <p>{@code status} 五值封闭：{@code established} 第一次建立基线（没有 before，谈不上变没变）；
     * {@code unchanged} 读了且一模一样，不写账；{@code changed} 写了账并点名动了哪些键；
     * {@code empty-source} 服务端一个键都没供出来——那是配置错误，不是一次变更，也不配当基线；
     * {@code source-error} 读源本身抛了（location 拼成了非法 URL、文件损坏、权限），{@code cause} 只给异常短类名。
     */
    record RefreshResponse(
            String application,
            String profile,
            String status,
            String oldDigest,
            String newDigest,
            List<String> added,
            List<String> removed,
            List<String> modified,
            Long auditSeq,
            String cause) {}

    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(
            HttpServletRequest request,
            @RequestParam String application,
            @RequestParam(defaultValue = "default") String profile,
            @RequestParam(required = false) String actor) {
        ResponseEntity<?> denied = gate(request);
        if (denied != null) {
            return denied;
        }
        if (!legal(application) || !legal(profile)) {
            return badName();
        }

        String key = key(application, profile);
        ConfigOpsService.Snapshot now;
        try {
            now = ops.read(application, profile);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new RefreshResponse(
                    application, profile, "source-error", null, null, List.of(), List.of(), List.of(),
                    null, e.getClass().getSimpleName()));
        }
        if (now.values().isEmpty()) {
            // 空源不许当基线：把它记下来，下一次正常刷新就会把"每一个键都是新增"报成一次变更，
            // 一次拼错的 search-locations 因此变成一串假变更。这里 503 并原样留着基线不动。
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new RefreshResponse(
                    application, profile, "empty-source", null, now.digest(), List.of(), List.of(), List.of(),
                    null, null));
        }
        ConfigOpsService.Snapshot before = baselines.get(key);
        if (before == null) {
            baselines.put(key, now);
            ConfigChangeAudit.Entry entry = audit.recordBaseline(application, profile, actor, now.digest());
            return ResponseEntity.ok(new RefreshResponse(
                    application, profile, "established", null, now.digest(), List.of(), List.of(), List.of(),
                    entry.seq(), null));
        }

        ConfigOpsService.Diff diff = ConfigOpsService.diff(before, now);
        if (diff.empty()) {
            // 不写账：刷新被点了几次和配置被改了几次是两个数，写进去就再也分不开了。
            return ResponseEntity.ok(new RefreshResponse(
                    application, profile, "unchanged", before.digest(), now.digest(), List.of(), List.of(),
                    List.of(), null, null));
        }

        baselines.put(key, now);
        ConfigChangeAudit.Entry entry =
                audit.recordChange(application, profile, actor, before.digest(), now.digest(), diff, before.values(), now.values());
        return ResponseEntity.ok(new RefreshResponse(
                application,
                profile,
                "changed",
                before.digest(),
                now.digest(),
                diff.added(),
                diff.removed(),
                diff.modified(),
                entry.seq(),
                null));
    }

    /** 最近的变更，新的在前。带两个数说明账本本身的形状：留了多少、一共记了多少。 */
    @GetMapping("/audit")
    public ResponseEntity<?> audit(
            HttpServletRequest request, @RequestParam(defaultValue = "20") int limit) {
        ResponseEntity<?> denied = gate(request);
        if (denied != null) {
            return denied;
        }
        List<ConfigChangeAudit.Entry> entries = audit.recent(limit);
        return ResponseEntity.ok(Map.of(
                "entries", entries,
                "kept", audit.size(),
                "totalRecorded", audit.totalRecorded()));
    }

    /**
     * 一个策略管三个端点，所以只有一份判断：没配令牌 → 503；配了但不匹配 → 401。
     *
     * <p>比较用 {@link MessageDigest#isEqual}（常量时间），令牌从 header 取，不走查询串 ——
     * URL 会进访问日志、代理日志和浏览器历史，密钥放那里等于抄一份到没人管的地方。
     */
    private ResponseEntity<?> gate(HttpServletRequest request) {
        if (adminToken.isEmpty()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("probe", UNCONFIGURED, "endpoints", List.of("/nexus/config/ops/version", "/refresh", "/audit")));
        }
        String presented = request.getHeader("X-Nexus-Config-Admin");
        if (presented == null || !MessageDigest.isEqual(
                adminToken.getBytes(StandardCharsets.UTF_8), presented.getBytes(StandardCharsets.UTF_8))) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("probe", "admin_token_mismatch"));
        }
        return null;
    }

    private static boolean legal(String name) {
        return name != null && NAME.matcher(name).matches() && !name.contains("..");
    }

    private static ResponseEntity<Map<String, Object>> badName() {
        return ResponseEntity.badRequest().body(Map.of("probe", BAD_NAME));
    }

    /**
     * 读源本身抛了，用 503 说出是哪一半抛的。
     *
     * <p>默认的那个 500 错误页并不算错——它确实不"看起来在工作"——但它把原因藏在日志里，只把
     * {@code path} 交给 caller，运维面板上就只剩"这个端点坏了"。实测的那次是
     * {@code search-locations} 写成了 {@code file://C:\Users\...}（非法的 file URL），
     * 服务照常启动、照常收请求，只是每一次读都抛；这种"能启动但供不出任何东西"的部署，
     * 操作面要能自己指认。503 与本片对"这里现在答不了"的其它用法同形；{@code cause} 只给异常短类名，
     * 不给路径与堆栈（与 §SC-71 那个探针一条规矩）。
     */
    private static ResponseEntity<Map<String, Object>> sourceFailure(Exception e) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("probe", SOURCE_ERROR, "cause", e.getClass().getSimpleName()));
    }

    private static String key(String application, String profile) {
        return application + "/" + profile;
    }
}
