package dev.nexus.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * ADR-0313 —— 刷新得真的再读一次，账本得只记真的变了的东西。
 *
 * <p>search-locations 指向一个临时目录，测试自己往那里写 yml、改 yml。这不是为了省事才不读打进 jar 的
 * 那批文件：如果配置来源在整个测试进程里不可变，「刷新」就<b>不可能</b>量出任何差异，
 * 那套端点退化成一句永远返回 200 的装饰（§159 禁止的正是这种假可用）。
 * 来源可变，才有「改一个键 → 差异点名那一个键」这条真臂。
 *
 * <p><b>每个臂用自己那个 application 名。</b>基线与账本都是单件对象的状态，一个 Spring 上下文里
 * 所有测试共用；如果各臂都刷 {@code nexus-api}，臂与臂之间就会互相顶掉基线，
 * 「第一次刷新应该是 established」这种断言变成看测试跑的顺序。用独立文档名把状态隔开，
 * 顺序就不重要了。
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"logging.level.root=warn", "nexus.config.admin-token=ops-secret"})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ConfigOpsRefreshAuditTest {

    private static final Path SOURCE = createSourceDir();
    private static final String ADMIN = "ops-secret";
    private static final String SHARED = "application.yml";

    private static final String APP_KEY = "nexus.api.timeout-ms";
    private static final String SECRET_KEY = "nexus.db.password";
    private static final String SECRET_BEFORE = "hunter2-shared";
    private static final String SECRET_AFTER = "hunter3-rotated";

    @LocalServerPort
    int port;

    @Autowired
    ConfigOpsService ops;

    private WebTestClient client;

    private static Path createSourceDir() {
        try {
            return Files.createTempDirectory("nexus-config-ops-");
        } catch (IOException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    @DynamicPropertySource
    static void configBackend(DynamicPropertyRegistry registry) {
        // toUri() 出的是 file:///C:/... 形状且带尾斜杠；直接拼 "file:" + Path 在 Windows 上会得到
        // file:C:\Users\... ，ResourceLoader 认不认它不该由测试去赌。
        registry.add("spring.cloud.config.server.native.search-locations", () -> SOURCE.toUri().toString());
    }

    @AfterAll
    static void removeSourceDir() throws IOException {
        try (Stream<Path> walk = Files.walk(SOURCE)) {
            for (Path path : walk.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    @BeforeEach
    void setUp() {
        client = WebTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .build();
    }

    /** 共享默认值：每个文档都会合并它，所以它也用来做「加键/删键」那一侧。 */
    private void shared(String body) {
        write(SHARED, body);
    }

    private void doc(String application, String body) {
        write(application + ".yml", body);
    }

    private void write(String name, String body) {
        try {
            Files.writeString(SOURCE.resolve(name), body);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * 臂 1：同一份内容两次读取必须给同一个指纹。
     *
     * <p>不稳定的指纹（摊平依赖 HashMap 遍历顺序）会让每次刷新都「看起来变了」，账本立刻变成噪音发生器，
     * 「配置改了几次」这个数就废了。
     */
    @Test
    void theSameContentFingerprintsTheSameTwice() {
        shared("nexus:\n  shared:\n    rate: 10\n");
        doc("probe-fingerprint", "nexus:\n  api:\n    timeout-ms: 900\n");
        assertEquals(version("probe-fingerprint").get("digest"), version("probe-fingerprint").get("digest"),
                "同一份配置两次读出两个指纹——指纹不可信");
        assertEquals(2, version("probe-fingerprint").get("keyCount"));
    }

    /**
     * 臂 2：更具体的文件赢过共享默认值。
     *
     * <p>摊平写成「后出现的赢」时值会翻，而指纹照样算得出——账目平了、值错了的那类错法只能这样钉。
     */
    @Test
    void theSharedDefaultsCannotOutrankTheApplicationDocument() {
        shared("nexus:\n  api:\n    timeout-ms: 5\n");
        doc("probe-precedence", "nexus:\n  api:\n    timeout-ms: 900\n");
        ConfigOpsService.Snapshot snapshot = ops.read("probe-precedence", "default");
        assertEquals("900", snapshot.values().get(APP_KEY), "共享默认值盖掉了文档自己的值");
    }

    /** 臂 3：第一次刷新只能叫 established —— 没有 before 就谈不上「变了」或「没变」。 */
    @Test
    void theFirstRefreshEstablishesABaselineInsteadOfClaimingAChange() {
        shared("nexus:\n  shared:\n    rate: 10\n");
        doc("probe-baseline", "nexus:\n  api:\n    timeout-ms: 900\n");
        assertEquals(false, version("probe-baseline").get("baseline"), "刷过之前没有基线，version 要说不成立");
        Map<String, Object> body = refresh("probe-baseline");
        assertEquals("established", body.get("status"));
        assertNull(body.get("oldDigest"), "第一次没有旧指纹，不许编一个");
        assertNotNull(body.get("newDigest"));
        assertEquals(true, version("probe-baseline").get("baseline"), "建立过基线之后要说得出来");
        assertEquals(false, version("probe-never-refreshed").get("baseline"), "别的文档不许蹭这条基线");
    }

    /** 臂 4：什么也没改的刷新不写账。 */
    @Test
    void aRefreshThatChangesNothingWritesNoAuditEntry() {
        shared("nexus:\n  shared:\n    rate: 10\n");
        doc("probe-noop", "nexus:\n  api:\n    timeout-ms: 900\n");
        refresh("probe-noop");
        Map<String, Object> again = refresh("probe-noop");
        assertEquals("unchanged", again.get("status"));
        assertNull(again.get("auditSeq"), "没变也记一条，账本就退化成「刷新被点了几次」的计数器");
        assertEquals(again.get("newDigest"), version("probe-noop").get("digest"),
                "同一版配置在两个端点上必须是同一个数，否则面板与账各说一套");

        List<Map<String, Object>> entries = auditFor("probe-noop");
        assertEquals(1, entries.size(), "除了基线不该有第二条：" + entries);
        assertEquals(true, entries.get(0).get("baseline"));
        assertEquals(0, entries.get(0).get("changedCount"));
    }

    /**
     * 臂 5（本片的核心）：真的改文件，刷新必须真的看到。
     *
     * <p>三个动作各一个键：改值、加键、删键。少了后两个，「配置里多了一个没人知道的键」和
     * 「少了一个键」在账上都显示成没变——那正是 §SC-71 那类事故的形状（共享默认值被放宽，没人看得见）。
     */
    @Test
    void editingTheSourceThenRefreshingNamesExactlyTheKeysThatMoved() {
        shared("nexus:\n  shared:\n    rate: 10\n  leftover:\n    only-in-shared: keepme\n");
        doc("probe-diff", "nexus:\n  api:\n    timeout-ms: 900\n");
        refresh("probe-diff");

        shared("nexus:\n  shared:\n    rate: 10\n");
        doc("probe-diff", """
                nexus:
                  api:
                    timeout-ms: 1200
                    brand-new-key: hello
                """);

        Map<String, Object> body = refresh("probe-diff");
        assertEquals("changed", body.get("status"));
        assertEquals(List.of(APP_KEY), body.get("modified"));
        assertEquals(List.of("nexus.api.brand-new-key"), body.get("added"));
        assertEquals(List.of("nexus.leftover.only-in-shared"), body.get("removed"));
        assertFalse(body.get("oldDigest").equals(body.get("newDigest")), "变了而指纹没变——指纹是摆设");

        List<Map<String, Object>> entries = auditFor("probe-diff");
        assertEquals(false, entries.get(0).get("baseline"));
        assertEquals(3, entries.get(0).get("changedCount"), "三个动作该记三条，不是一个「有变化」");
    }

    /**
     * 臂 6：改了密码，账本上不许出现任何一版明文。
     *
     * <p>审计的意义是「知道它变了」，不是「知道它是什么」。查的是整份响应体而不是某一条字段，
     * 因为值可能同时出现在 from/to 两处。
     */
    @Test
    void aChangedSecretIsAuditedWithoutLeavingEitherPlaintext() {
        shared("nexus:\n  shared:\n    rate: 10\n");
        doc("probe-secret", "nexus:\n  db:\n    password: %s\n".formatted(SECRET_BEFORE));
        refresh("probe-secret");
        doc("probe-secret", "nexus:\n  db:\n    password: %s\n".formatted(SECRET_AFTER));
        refresh("probe-secret");

        String raw = auditRaw();
        assertFalse(raw.contains(SECRET_BEFORE), "旧密码进了账本");
        assertFalse(raw.contains(SECRET_AFTER), "新密码进了账本");
        assertTrue(raw.contains("redacted:"), "脱敏之后仍要说得出变没变：" + raw);

        List<Map<String, Object>> changes = changesOfLatest("probe-secret");
        assertEquals(List.of(SECRET_KEY), changes.stream().map(c -> c.get("key")).toList());
        assertEquals("modified", changes.get(0).get("kind"), "密码那一条必须是 modified，不能显示成新增");
        assertTrue(String.valueOf(changes.get(0).get("from")).startsWith("redacted:"));
        assertTrue(String.valueOf(changes.get(0).get("to")).startsWith("redacted:"));
        assertFalse(changes.get(0).get("from").equals(changes.get(0).get("to")),
                "换了密码却看不出换了——脱敏把差异也一起抹掉了");
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> changesOfLatest(String application) {
        return (List<Map<String, Object>>) auditFor(application).get(0).get("changes");
    }

    /** 臂 7：不合法的名字在碰 repository 之前就被拒，且不留账。 */
    @Test
    void aTraversalShapedApplicationNameIsRejectedBeforeTheRepositoryIsTouched() {
        shared("nexus:\n  shared:\n    rate: 10\n");
        doc("probe-names", "nexus:\n  api:\n    timeout-ms: 900\n");
        refresh("probe-names");
        int before = auditFor("probe-names").size();

        client.get()
                .uri("/nexus/config/ops/version?application=../../etc/passwd&profile=default")
                .header("X-Nexus-Config-Admin", ADMIN)
                .exchange()
                .expectStatus()
                .isBadRequest();
        client.post()
                .uri("/nexus/config/ops/refresh?application=%2e%2e%2fsecrets&profile=default")
                .header("X-Nexus-Config-Admin", ADMIN)
                .exchange()
                .expectStatus()
                .isBadRequest();

        assertEquals(before, auditFor("probe-names").size(), "被拒的请求不该在账上留痕");
    }

    /** 臂 8：两条配置线各有各的基线，不能一条刷过就把另一条也算「已经知道」。 */
    @Test
    void eachDocumentKeepsItsOwnBaseline() {
        shared("nexus:\n  shared:\n    rate: 10\n");
        doc("probe-two-a", "nexus:\n  api:\n    timeout-ms: 1\n");
        doc("probe-two-b", "nexus:\n  api:\n    timeout-ms: 2\n");
        assertEquals("established", refresh("probe-two-a").get("status"));
        assertEquals("established", refresh("probe-two-b").get("status"), "共用了一个基线槽位");
        assertEquals("unchanged", refresh("probe-two-a").get("status"));
    }

    /** 臂 9：没写 actor 就明说 unattributed，而不是留一个看起来像署名的空值。 */
    @Test
    void anUnattributedChangeSaysSoInsteadOfLookingAttributed() {
        shared("nexus:\n  shared:\n    rate: 10\n");
        doc("probe-actor", "nexus:\n  api:\n    timeout-ms: 900\n");
        refresh("probe-actor");
        doc("probe-actor", "nexus:\n  api:\n    timeout-ms: 901\n");
        refresh("probe-actor");
        doc("probe-actor", "nexus:\n  api:\n    timeout-ms: 902\n");
        client.post()
                .uri("/nexus/config/ops/refresh?application=probe-actor&profile=default&actor=zhao")
                .header("X-Nexus-Config-Admin", ADMIN)
                .exchange()
                .expectStatus()
                .isOk();

        List<Map<String, Object>> entries = auditFor("probe-actor");
        assertEquals("zhao", entries.get(0).get("actor"), "写了名字就要署上");
        assertEquals("unattributed", entries.get(1).get("actor"), "没写名字要说没写，不能留空看着像署名");
    }

    private Map<String, Object> version(String application) {
        return body(client.get()
                .uri("/nexus/config/ops/version?application={a}&profile=default", application)
                .header("X-Nexus-Config-Admin", ADMIN)
                .exchange()
                .expectStatus()
                .isOk());
    }

    private Map<String, Object> refresh(String application) {
        return body(client.post()
                .uri("/nexus/config/ops/refresh?application={a}&profile=default", application)
                .header("X-Nexus-Config-Admin", ADMIN)
                .exchange()
                .expectStatus()
                .isOk());
    }

    private Map<String, Object> body(WebTestClient.ResponseSpec exchange) {
        return exchange.expectBody(Map.class).returnResult().getResponseBody();
    }

    private String auditRaw() {
        return client.get()
                .uri("/nexus/config/ops/audit?limit=50")
                .header("X-Nexus-Config-Admin", ADMIN)
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody(String.class)
                .returnResult()
                .getResponseBody();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> auditFor(String application) {
        List<Map<String, Object>> entries =
                (List<Map<String, Object>>) auditRawBody().get("entries");
        return entries.stream().filter(entry -> application.equals(entry.get("application"))).toList();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> auditRawBody() {
        return body(client.get()
                .uri("/nexus/config/ops/audit?limit=200")
                .header("X-Nexus-Config-Admin", ADMIN)
                .exchange()
                .expectStatus()
                .isOk());
    }
}
