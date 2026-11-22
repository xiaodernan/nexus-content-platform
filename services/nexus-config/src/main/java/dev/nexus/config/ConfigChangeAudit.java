package dev.nexus.config;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * ADR-0313 — 配置变更的账本：只追加、有上界、敏感键不留明文。
 *
 * <p><b>为什么账本要在进程里就成立。</b>刷新这个动作本身没有事后痕迹：谁都不记得上周三那次改动过
 * {@code nexus.gateway.rate-limit.rate-per-second}，等到出事故再问"这个值是什么时候变的"就只剩猜。
 *
 * <p><b>三条不是可有可无的规则：</b>
 * <ul>
 *   <li><b>上界。</b>一个从不淘汰的账本迟早变成内存问题，而且 §SEC 第三十四片已经在本仓库量过一次
       "键空间无上界"的后果。淘汰的是最旧的条目，计数仍从 seq 看得全（seq 单调，不因淘汰而重排）。</li>
 *   <li><b>脱敏。</b>配置里就是有 password / token / secret。审计的价值是"知道哪一键在何时从 A 变到 B"，
 *       而 A、B 存明文等于把机密抄进第二份没人看管的地方。按键名的<em>分段</em>判断，
 *       不用子串——否则 {@code nexus.monkey.keysize} 会因为含 "key" 被误脱敏，而
 *       {@code datasource.password} 会因为写法不同漏掉。</li>
 *   <li><b>没变就不记账。</b>把每次刷新都写进账本，"配置改过几次"就退化成"刷新被点了几次"，
 *       两个完全不同的数共用一格（本仓库已经三次栽在"一个数字顶两件事"：ADR 0262 / 0310 / 0311）。</li>
 * </ul>
 */
@Component
public class ConfigChangeAudit {

    /** 键名按 {@code . - _} 分段后，任何一段落在这个词表里就脱敏。 */
    private static final Set<String> SENSITIVE_SEGMENTS =
            Set.of("password", "passwd", "secret", "token", "credential", "credentials", "apikey");

    /** 一条账最多列多少个键；超了照样记全数，只是清单截断（{@code truncated} 说这件事）。 */
    static final int MAX_KEYS_PER_ENTRY = 50;

    private final Deque<Entry> entries = new ArrayDeque<>();
    private final AtomicLong sequence = new AtomicLong();
    private final int keep;

    public ConfigChangeAudit(@Value("${nexus.config.audit.keep:200}") int keep) {
        this.keep = Math.max(1, keep);
    }

    /**
     * 一条变更里动的某个键。
     *
     * @param kind added / removed / modified —— 缺席和报错值是两件事，必须留在账上
     * @param from 旧值（脱敏后），新增时为 null
     * @param to   新值（脱敏后），删除时为 null
     */
    public record KeyChange(String key, String kind, String from, String to) {}

    /**
     * 一次账目。
     *
     * @param baseline 这一条是不是"第一次建立基线"。第一次没有 before，所以它不能被称为"变更"，
     *                 也不能被称为"没变更"——它只能说"从这里开始我们看得见"。
     */
    public record Entry(
            long seq,
            Instant at,
            String application,
            String profile,
            String actor,
            boolean baseline,
            String oldDigest,
            String newDigest,
            int changedCount,
            boolean truncated,
            List<KeyChange> changes) {}

    /**
     * 记录一次真实的差异。返回写进去的那条，方便调用方原样回给操作者——面板显示的和账本存的是同一份对象，
     * 不是"再算一遍"（再算一遍就可能算出不一样的东西）。
     */
    public synchronized Entry recordChange(
            String application,
            String profile,
            String actor,
            String oldDigest,
            String newDigest,
            ConfigOpsService.Diff diff,
            Map<String, String> before,
            Map<String, String> after) {
        List<KeyChange> changes = new ArrayList<>();
        for (String key : diff.added()) {
            changes.add(new KeyChange(key, "added", null, display(after.get(key), key)));
        }
        for (String key : diff.modified()) {
            changes.add(new KeyChange(key, "modified", display(before.get(key), key), display(after.get(key), key)));
        }
        for (String key : diff.removed()) {
            changes.add(new KeyChange(key, "removed", display(before.get(key), key), null));
        }
        Entry entry = seal(
                application, profile, actor, false, oldDigest, newDigest, diff.size(), changes, MAX_KEYS_PER_ENTRY);
        append(entry);
        return entry;
    }

    /** 第一次建立基线：没有 before，所以账上只有 newDigest，changedCount 记 0 而不是全部键数。 */
    public synchronized Entry recordBaseline(String application, String profile, String actor, String newDigest) {
        Entry entry =
                seal(application, profile, actor, true, null, newDigest, 0, List.of(), 0);
        append(entry);
        return entry;
    }

    /** 最近 N 条，新的在前；{@code limit} 被夹在 [1, keep]，不给一个能把整条队列拷走的数。 */
    public synchronized List<Entry> recent(int limit) {
        int wanted = Math.min(Math.max(1, limit), keep);
        List<Entry> all = new ArrayList<>(entries);
        List<Entry> newestFirst = new ArrayList<>(wanted);
        for (int i = all.size() - 1; i >= 0 && newestFirst.size() < wanted; i--) {
            newestFirst.add(all.get(i));
        }
        return List.copyOf(newestFirst);
    }

    public synchronized int size() {
        return entries.size();
    }

    public synchronized long totalRecorded() {
        return sequence.get();
    }

    private Entry seal(
            String application,
            String profile,
            String actor,
            boolean baseline,
            String oldDigest,
            String newDigest,
            int changedCount,
            List<KeyChange> changes,
            int maxKeys) {
        boolean truncated = changes.size() > maxKeys;
        List<KeyChange> kept = truncated ? List.copyOf(changes.subList(0, maxKeys)) : changes;
        String who = (actor == null || actor.isBlank()) ? "unattributed" : actor.trim();
        return new Entry(
                sequence.incrementAndGet(),
                Instant.now(),
                application,
                profile,
                who,
                baseline,
                oldDigest,
                newDigest,
                changedCount,
                truncated,
                kept);
    }

    private void append(Entry entry) {
        entries.addLast(entry);
        while (entries.size() > keep) {
            entries.removeFirst();
        }
    }

    /**
     * 账上怎么显示一个值：敏感键只留"形状"（短指纹），其余原样。
     *
     * <p>留一个 8 位指纹而不是完全不留：审计要能回答"这个密钥到底变没变"，而"变不了"和"看不出变"
     * 是两种不同的处置。指纹取 SHA-256 前 8 位十六进制，反推原值不可行。
     */
    static String display(String value, String key) {
        if (value == null) {
            return null;
        }
        if (!sensitive(key)) {
            return value;
        }
        return "redacted:" + shortHash(value);
    }

    /** 分段命中词表才算敏感；子串命中会把 {@code keysize} 这类键误脱敏。 */
    static boolean sensitive(String key) {
        for (String segment : key.toLowerCase(Locale.ROOT).split("[.\\-_]")) {
            if (SENSITIVE_SEGMENTS.contains(segment)) {
                return true;
            }
        }
        return false;
    }

    private static String shortHash(String value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash).substring(0, 8);
        } catch (Exception e) {
            return "redacted:?";
        }
    }
}
