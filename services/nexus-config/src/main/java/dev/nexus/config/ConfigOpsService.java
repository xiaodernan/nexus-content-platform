package dev.nexus.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.cloud.config.environment.Environment;
import org.springframework.cloud.config.environment.PropertySource;
import org.springframework.cloud.config.server.environment.EnvironmentRepository;
import org.springframework.stereotype.Service;

/**
 * ADR-0313 — "配置有没有变" 变成一个问得出答的读数，而不是靠重启才知道。
 *
 * <p><b>为什么要这一层。</b>配置中心以 {@code native} backend 供文件，客户端启动时合并一次，之后就固定了。
 * 在此之前，"改了共享默认值没有" 只能靠 ADR 里 §SC-71 那种事后事故发现（2026-11-11 那次：
 * {@code nexus-config/application.yml} 的暴露面被放宽，domain-service 继承了不属于它的端点）。
 * 这一层不引入新的存储、也不改任何客户端：它只回答两个问题——现在供出去的是哪一版，以及这一版和上一版差在哪几键。
 *
 * <p><b>指纹必须来自 {@link EnvironmentRepository} 本身。</b>这是唯一的理由让这条读数有价值：
 * 它就是 {@code GET /{application}/{profile}} 用来构造报文的同一个对象。另开一条读取路径（自己 parse 文件）
 * 会量出"我以为客户端会拿到的值"，而客户端真拿到的值可能不同 —— §SC-71 的教训正是这两者一旦分开，
 * 配置中心就变成一台只会吐默认值的装饰服务。
 *
 * <p><b>合并方向。</b>{@link Environment#getPropertySources()} 越具体越在前（{@code nexus-api.yml} 在
 * {@code application.yml} 之前）。摊平时"先出现的赢"，与 Spring 的解析顺序一致；写成"后出现的赢"会让
 * 共享默认值盖掉应用自己的值，而指纹照样算得出来 —— 那种账目平了、值错了的错法必须由门钉住。
 */
@Service
public class ConfigOpsService {

    private final EnvironmentRepository repository;
    private final ObjectMapper mapper = new ObjectMapper();

    public ConfigOpsService(EnvironmentRepository repository) {
        this.repository = repository;
    }

    /**
     * 一份配置的可比对快照。
     *
     * @param digest 摊平后（键排序）的稳定 SHA-256；同一份内容两次读取得到同一个值
     * @param values 键 → 值的字符串形态，已经按优先级摊平
     */
    public record Snapshot(String digest, Map<String, String> values) {}

    /** 两版之间的差异；三个清单互斥，合起来就是"这次刷新动了什么"。 */
    public record Diff(List<String> added, List<String> removed, List<String> modified) {
        public boolean empty() {
            return added.isEmpty() && removed.isEmpty() && modified.isEmpty();
        }

        public int size() {
            return added.size() + removed.size() + modified.size();
        }
    }

    /**
     * 现读一份当前供出去的配置。每次调用都真的走 repository —— 刷新的意义就是"再问一次"，
     * 这里若藏一层缓存，刷新端点就退化成一句 200。
     */
    public Snapshot read(String application, String profile) {
        Environment environment = repository.findOne(application, profile, null);
        //  TreeMap 先把键排好：指纹不能依赖 HashMap 的遍历顺序，否则同一份内容每次换一个值。
        Map<String, String> flat = new TreeMap<>();
        List<PropertySource> sources = environment.getPropertySources();
        if (sources != null) {
            for (PropertySource source : sources) {
                Object raw = source.getSource();
                if (!(raw instanceof Map<?, ?> map)) {
                    continue;
                }
                for (Map.Entry<?, ?> entry : map.entrySet()) {
                    String key = String.valueOf(entry.getKey());
                    // putIfAbsent：先出现的赢。列表前面是更具体的文件，与 Spring 的解析顺序一致。
                    flat.putIfAbsent(key, valueOf(entry.getValue()));
                }
            }
        }
        return new Snapshot(digestOf(flat), Map.copyOf(flat));
    }

    /** 纯函数式的差异：只在两个快照之间比较，不看时间、不看进程状态，所以能单独测。 */
    public static Diff diff(Snapshot before, Snapshot after) {
        List<String> added = new ArrayList<>();
        List<String> removed = new ArrayList<>();
        List<String> modified = new ArrayList<>();
        for (Map.Entry<String, String> entry : after.values().entrySet()) {
            String previous = before.values().get(entry.getKey());
            if (previous == null) {
                added.add(entry.getKey());
            } else if (!previous.equals(entry.getValue())) {
                modified.add(entry.getKey());
            }
        }
        for (String key : before.values().keySet()) {
            if (!after.values().containsKey(key)) {
                removed.add(key);
            }
        }
        added.sort(Comparator.naturalOrder());
        removed.sort(Comparator.naturalOrder());
        modified.sort(Comparator.naturalOrder());
        return new Diff(List.copyOf(added), List.copyOf(removed), List.copyOf(modified));
    }

    /** 稳定序列化：键有序、无缩进、无平台换行差异，所以跨机器与跨重启可比。 */
    private String digestOf(Map<String, String> flat) {
        Map<String, String> sorted = new LinkedHashMap<>(flat);
        String canonical;
        try {
            canonical = mapper.writeValueAsString(sorted);
        } catch (Exception e) {
            throw new IllegalStateException("config snapshot not serialisable", e);
        }
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash).substring(0, 32);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("sha-256 unavailable", e);
        }
    }

    private static String valueOf(Object value) {
        return value == null ? "null" : String.valueOf(value);
    }
}
