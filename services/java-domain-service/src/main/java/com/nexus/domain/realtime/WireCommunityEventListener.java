package com.nexus.domain.realtime;

import com.nexus.domain.community.CommunityEvents;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 社区领域事件上跨进程线路的最后一公里（§SC-54）。
 *
 * <p>只在 {@code AFTER_COMMIT} 奔跑：事务回滚 → 帧不发 → 线路只背"已经发生"的事；
 * 线路本身不可达（Redis 挂了）→ {@link WirePublisher#publishNotification} 记 warn、返回 null，
 * 业务不受影响（web publish 纪律：总线不能比业务更脆弱）。
 *
 * <p>频道遵循 web 既有约定（{@code apps/web/src/server/realtime/bus.ts} 的 {@code channels.user}）：
 * {@code user:<userId>}。措辞与 web 收件箱计划（{@code lib/notify-plan.ts} 的 like/follow 两条）逐字对齐——
 * {@code <actorName> 点赞了《<projectName>》} / {@code <actorName> 开始关注你}，
 * Studio 将来订阅用户频道可原样展示，不需要二次翻译。
 *
 * <p>web 主路径（interact route）的 inbox 通知不受影响：Java 只说话、不落收件箱表——
 * 两个写入者就是两个事实来源，收件箱由 web 独占（既有"JVM path stays silent"纪律按 inbox 收窄保留；
 * 线路上的话任何订阅者都可听，不落任何人的表）。
 */
@Component
public class WireCommunityEventListener {

    private final WirePublisher publisher;

    public WireCommunityEventListener(WirePublisher publisher) {
        this.publisher = publisher;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onLikeAdded(CommunityEvents.LikeAdded event) {
        String project = clip(nonBlankOr(event.projectName(), "未命名项目"), 42);
        String title = clip(actorLabel(event.actorName()) + " 点赞了《" + project + "》", 140);
        String projectId = event.projectId() == null ? null : event.projectId().toString();
        publisher.publishNotification("user:" + event.ownerId(), projectId, title, null);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onFollowAdded(CommunityEvents.FollowAdded event) {
        String title = clip(actorLabel(event.actorName()) + " 开始关注你", 140);
        publisher.publishNotification("user:" + event.targetUserId(), null, title, null);
    }

    static String actorLabel(String displayName) {
        return displayName == null || displayName.isBlank() ? "有人" : displayName.trim();
    }

    static String clip(String value, int max) {
        if (value == null) {
            return "";
        }
        return value.length() <= max ? value : value.substring(0, max - 1) + "…";
    }

    static String nonBlankOr(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
}
