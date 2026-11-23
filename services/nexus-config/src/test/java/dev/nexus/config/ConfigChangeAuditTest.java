package dev.nexus.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * ADR-0313 —— 账本自己的三条规则：有上界、截断要说、脱敏按词而不是按子串。
 *
 * <p>这三条在 HTTP 层量不出来（要造 60 个键、要跨过淘汰边界），所以做成纯单测。
 * 判据全取自实现自己的常量与规则，不往测试里抄第二份清单。
 */
class ConfigChangeAuditTest {

    private static ConfigOpsService.Snapshot snapshot(Map<String, String> values) {
        // diff() 只看值，不看指纹；指纹在这里是占位，真正的指纹由 ConfigOpsService.read() 算。
        return new ConfigOpsService.Snapshot("placeholder-digest", values);
    }

    private static Map<String, String> of(String... pairs) {
        Map<String, String> map = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            map.put(pairs[i], pairs[i + 1]);
        }
        return Map.copyOf(map);
    }

    /** 臂 1：账本有上界，但"一共记了几条"不能因为淘汰就变小。 */
    @Test
    void theLedgerIsBoundedWithoutLosingTheCount() {
        ConfigChangeAudit audit = new ConfigChangeAudit(2);
        for (int i = 0; i < 5; i++) {
            Map<String, String> before = of("k", String.valueOf(i));
            Map<String, String> after = of("k", String.valueOf(i + 1));
            audit.recordChange("app", "default", "zhao", "d" + i, "d" + (i + 1),
                    ConfigOpsService.diff(snapshot(before), snapshot(after)), before, after);
        }
        assertEquals(2, audit.size(), "留下的不该超过 keep");
        assertEquals(5, audit.totalRecorded(), "淘汰不该把总数说小");

        List<ConfigChangeAudit.Entry> recent = audit.recent(50);
        assertEquals(2, recent.size());
        assertEquals(5, recent.get(0).seq(), "新的在前");
        assertEquals(4, recent.get(1).seq());
        assertEquals(1, recent.get(0).changedCount(), "一次只动 k 的值就是 1，不是 0 也不是全部键数");
        assertEquals("modified", recent.get(0).changes().get(0).kind());
        assertEquals("4", recent.get(0).changes().get(0).from());
        assertEquals("5", recent.get(0).changes().get(0).to());
    }

    /** 臂 2：改一个值是 modified，别记成"加了一个键"。 */
    @Test
    void aChangedValueIsModifiedNotAnAddition() {
        Map<String, String> before = of("nexus.api.timeout", "900");
        Map<String, String> after = of("nexus.api.timeout", "1200");
        ConfigOpsService.Diff diff = ConfigOpsService.diff(snapshot(before), snapshot(after));
        assertEquals(List.of("nexus.api.timeout"), diff.modified());
        assertTrue(diff.added().isEmpty() && diff.removed().isEmpty());
    }

    /** 臂 3：一次动很多键时，清单截断但计数不截断，并且要标出来。 */
    @Test
    void aWideChangeKeepsTheCountWhenTheListIsTruncated() {
        Map<String, String> before = new LinkedHashMap<>();
        Map<String, String> after = new LinkedHashMap<>();
        for (int i = 0; i < ConfigChangeAudit.MAX_KEYS_PER_ENTRY + 10; i++) {
            before.put("key" + i, "old" + i);
            after.put("key" + i, "new" + i);
        }
        ConfigChangeAudit audit = new ConfigChangeAudit(200);
        ConfigChangeAudit.Entry entry = audit.recordChange(
                "app", "default", "zhao", "a", "b",
                ConfigOpsService.diff(snapshot(Map.copyOf(before)), snapshot(Map.copyOf(after))),
                Map.copyOf(before), Map.copyOf(after));
        assertEquals(ConfigChangeAudit.MAX_KEYS_PER_ENTRY + 10, entry.changedCount(), "计数不许跟着清单一起截断");
        assertEquals(ConfigChangeAudit.MAX_KEYS_PER_ENTRY, entry.changes().size());
        assertTrue(entry.truncated());
    }

    /** 臂 4：没变的那次刷新根本不该产生条目（由 diff.empty() 把住，账本这一侧也要认得空差异）。 */
    @Test
    void anEmptyDiffReportsItselfAsEmpty() {
        Map<String, String> same = of("a", "1", "b", "2");
        assertTrue(ConfigOpsService.diff(snapshot(same), snapshot(same)).empty());
    }

    /**
     * 臂 5：脱敏按键名的<em>段</em>判，不按子串。
     *
     * <p>子串判会把 {@code keysize} 这类键误脱敏（审计因此丢掉能读的东西），也会漏掉
     * {@code pwd} 之外的写法；分段查词表才是可解释的规则。
     */
    @Test
    void redactionMatchesKeySegmentsNotSubstrings() {
        assertTrue(ConfigChangeAudit.sensitive("nexus.db.password"));
        assertTrue(ConfigChangeAudit.sensitive("NEXUS_DB_PASSWORD"));
        assertTrue(ConfigChangeAudit.sensitive("nexus.db.conn-token"));
        assertTrue(ConfigChangeAudit.sensitive("nexus.gateway.apikey"));
        assertFalse(ConfigChangeAudit.sensitive("nexus.monkey.keysize"), "含 key 这个词不等于这是个密钥");
        assertFalse(ConfigChangeAudit.sensitive("nexus.tokens.count"), "复数的普通业务键不该被误伤");
        assertFalse(ConfigChangeAudit.sensitive("nexus.rate-per-second"));
    }

    /** 臂 6：脱敏后仍要分得出新旧，且 null（新增/删除那两侧）不许变成字符串 "null"。 */
    @Test
    void redactionKeepsTheDifferenceAndKeepsAbsenceAbsent() {
        String before = ConfigChangeAudit.display("old-secret", "db.password");
        String after = ConfigChangeAudit.display("new-secret", "db.password");
        assertTrue(before.startsWith("redacted:"));
        assertFalse(before.equals(after), "换了密钥却看不出来，等于把差异一起抹掉");
        assertEquals("plaintext-value", ConfigChangeAudit.display("plaintext-value", "nexus.rate"));
        assertNull(ConfigChangeAudit.display(null, "db.password"), "缺席要写成缺席，不是写成 null 这四个字母");
    }

    /** 臂 7：limit 被夹住，不给一个能把整条队列拷走的数，也不给 0 或负数。 */
    @Test
    void theReadLimitIsClampedToWhatTheLedgerCanHold() {
        ConfigChangeAudit audit = new ConfigChangeAudit(3);
        for (int i = 0; i < 3; i++) {
            Map<String, String> before = of("k", String.valueOf(i));
            Map<String, String> after = of("k", String.valueOf(i + 1));
            audit.recordChange("app", "default", null, "a", "b",
                    ConfigOpsService.diff(snapshot(before), snapshot(after)), before, after);
        }
        assertEquals(1, audit.recent(0).size(), "0 不该被当成不限量");
        assertEquals(3, audit.recent(9999).size(), "超大的 limit 只能拿到留下的那几条");
        assertEquals("unattributed", audit.recent(1).get(0).actor(), "没写 actor 要说没写");
    }
}
