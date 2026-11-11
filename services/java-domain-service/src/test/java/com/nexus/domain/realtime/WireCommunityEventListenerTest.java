package com.nexus.domain.realtime;

import static org.assertj.core.api.Assertions.assertThat;

import com.nexus.domain.community.CommunityEvents;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * §SC-54 — listener frame shape and copy.
 *
 * <p>Proves the three fragile spots: the channel convention (web's {@code channels.user}), the Chinese
 * copy aligned with the web inbox plan ({@code <actorName> 点赞了《…》} / {@code <actorName> 开始关注你}),
 * and the clip guard that keeps a pathological displayName from inflating a 140-char frame.
 *
 * <p>No Spring context, no Redis, no DB: {@code Capture} subclasses {@link WirePublisher} and records
 * what would have gone onto the wire.
 */
class WireCommunityEventListenerTest {

    static final class Capture extends WirePublisher {
        record Sent(String channel, String projectId, String title, String body) {
        }

        Sent last;
        int count;

        Capture() {
            super((StringRedisTemplate) null);
        }

        @Override
        public String publishNotification(String channel, String projectId, String title, String body) {
            count++;
            last = new Sent(channel, projectId, title, body);
            return "captured";
        }
    }

    private final Capture capture = new Capture();
    private final WireCommunityEventListener listener = new WireCommunityEventListener(capture);

    @Test
    void likeAddedAnnouncesOwnerChannelWithProjectId() {
        UUID owner = UUID.randomUUID();
        UUID project = UUID.randomUUID();
        listener.onLikeAdded(new CommunityEvents.LikeAdded(UUID.randomUUID(), owner, project, "我的作品", "阿南"));

        assertThat(capture.count).isEqualTo(1);
        assertThat(capture.last.channel()).isEqualTo("user:" + owner);
        assertThat(capture.last.projectId()).isEqualTo(project.toString());
        assertThat(capture.last.title()).isEqualTo("阿南 点赞了《我的作品》");
        assertThat(capture.last.body()).isNull();
    }

    @Test
    void likeAddedFallsBackToUnnamedProjectAndAnonymousActor() {
        listener.onLikeAdded(new CommunityEvents.LikeAdded(UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), null, "   "));

        assertThat(capture.last.title()).isEqualTo("有人 点赞了《未命名项目》");
    }

    @Test
    void likeAddedClipsPathologicalNames() {
        String hugeProject = "长".repeat(500);
        listener.onLikeAdded(new CommunityEvents.LikeAdded(UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), hugeProject, "阿南"));

        assertThat(capture.last.title().length()).isLessThanOrEqualTo(140);
        assertThat(capture.last.title()).contains("点赞了");
    }

    @Test
    void followAddedAnnouncesTargetUserChannelWithoutProjectId() {
        UUID target = UUID.randomUUID();
        listener.onFollowAdded(new CommunityEvents.FollowAdded(UUID.randomUUID(), target, "阿南"));

        assertThat(capture.count).isEqualTo(1);
        assertThat(capture.last.channel()).isEqualTo("user:" + target);
        assertThat(capture.last.projectId()).isNull();
        assertThat(capture.last.title()).isEqualTo("阿南 开始关注你");
    }

    @Test
    void followAddedFallsBackToAnonymousActor() {
        listener.onFollowAdded(new CommunityEvents.FollowAdded(UUID.randomUUID(), UUID.randomUUID(), null));

        assertThat(capture.last.title()).isEqualTo("有人 开始关注你");
    }

    @Test
    void helpersBehave() {
        assertThat(WireCommunityEventListener.actorLabel(null)).isEqualTo("有人");
        assertThat(WireCommunityEventListener.actorLabel("  ")).isEqualTo("有人");
        assertThat(WireCommunityEventListener.actorLabel(" 阿南 ")).isEqualTo("阿南");
        assertThat(WireCommunityEventListener.clip("abc", 10)).isEqualTo("abc");
        assertThat(WireCommunityEventListener.clip("abcdefghij", 5)).isEqualTo("abcd…");
        assertThat(WireCommunityEventListener.nonBlankOr(null, "未命名项目")).isEqualTo("未命名项目");
        assertThat(WireCommunityEventListener.nonBlankOr("  ", "未命名项目")).isEqualTo("未命名项目");
        assertThat(WireCommunityEventListener.nonBlankOr("有", "未命名项目")).isEqualTo("有");
    }
}
