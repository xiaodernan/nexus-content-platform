package com.nexus.domain.community;

import java.util.UUID;

/**
 * 社区领域事件（§SC-54）——进程内传递，帧化后才上跨进程线路。
 *
 * <p>由写路径（{@link CommunityService}）经 {@code ApplicationEventPublisher} 发出，
 * 由 {@code WireCommunityEventListener} 在<strong>事务提交之后</strong>（{@code AFTER_COMMIT}）
 * 消费：事务回滚 → 什么也没发 → 线路上不会出现"落库了才有的话"；提交成功但线路挂了 →
 * 监听器记 warn、返回 null，业务不受影响。这是事件发布的正确时机语义，不是实现细节。
 *
 * <p>只发"加"，不发"取消"（unlike/unfollow 不上线路）：web 收件箱的语义也是
 * "点赞/关注是开关，反复开关只留一条"。取消通知不是新消息。
 */
public final class CommunityEvents {

    private CommunityEvents() {
    }

    /** 新增一行 like（toggleLike 从未被点过 → 已赞）。blocked/拒绝不发出。 */
    public record LikeAdded(UUID actorId,
                            UUID ownerId,
                            UUID projectId,
                            String projectName,
                            String actorName) {
    }

    /** 新增一行 follow（toggleFollow 从未被关注 → 已关注）。blocked/拒绝不发出。 */
    public record FollowAdded(UUID actorId,
                              UUID targetUserId,
                              String actorName) {
    }
}
