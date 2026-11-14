package com.nexus.domain.community;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The policy loader, graded against the REAL export that Maven copied into the jar (SC-17).
 *
 * <p>Two jobs. First, pin the values: this is the JVM's half of the cross-language agreement, so if somebody
 * changes the TypeScript policy and re-exports without mirroring the behaviour here, these assertions go red
 * rather than the service quietly enforcing something else. Second, prove the loader is fail-fast: a
 * half-written document must stop the context, not default its way into a different policy.
 */
class CommunityPolicyTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final CommunityPolicy policy = new CommunityPolicy();

    @Test
    void theExportIsOnTheClasspathAndDeclaresExactlyTheTwoKinds() {
        assertThat(policy.blockKinds()).containsExactly("block", "mute");
    }

    @Test
    void onlyBlockStopsAnInteraction_muteIsVisibilityOnly() {
        assertThat(policy.blocksInteraction("block")).isTrue();
        assertThat(policy.blocksInteraction("mute")).isFalse();
    }

    @Test
    void anUnknownKindIsNoRelation_notABlock() {
        assertThat(policy.blocksInteraction("shadow-ban")).isFalse();
        assertThat(policy.blocksInteraction("")).isFalse();
        assertThat(policy.blocksInteraction(null)).isFalse();
    }

    @Test
    void theTwoDirectionsSayDifferentSentences() {
        assertThat(policy.interactionRefusal("them")).isEqualTo("对方不接受你的互动");
        assertThat(policy.interactionRefusal("me")).isEqualTo("你已经拉黑了对方，先解除才能互动");
        assertThat(policy.interactionRefusal("me")).isNotEqualTo(policy.interactionRefusal("them"));
    }

    @Test
    void everyRefusalSentenceTheWebLayerUsesIsTheSameHere() {
        assertThat(policy.refusal("selfFollow")).isEqualTo("不能关注自己");
        assertThat(policy.refusal("selfBlock")).isEqualTo("不能把自己拉黑或屏蔽");
        assertThat(policy.refusal("unknownKind")).isEqualTo("只支持 block 与 mute 两类");
        assertThat(policy.refusal("noSuchUser")).isEqualTo("没有这个用户");
        assertThat(policy.refusal("noSuchPublication")).isEqualTo("没有这个发布版本");
        assertThat(policy.refusal("publicationGone")).isEqualTo("这一版已经不公开了");
    }

    @Test
    void reachabilityIsAWhitelist_unlistedIsReachableAndPrivateIsNot() {
        assertThat(policy.publicationReachable("public", "pending", false)).isTrue();
        assertThat(policy.publicationReachable("public", "approved", false)).isTrue();
        assertThat(policy.publicationReachable("public", "flagged", false)).isTrue();
        assertThat(policy.publicationReachable("unlisted", "pending", false)).isTrue();
        assertThat(policy.publicationReachable("private", "approved", false)).isFalse();
        assertThat(policy.publicationReachable("public", "rejected", false)).isFalse();
        assertThat(policy.publicationReachable("public", "pending", true)).isFalse();
        assertThat(policy.publicationReachable("friends-only", "approved", false)).isFalse();
    }

    @Test
    void theReadoutIsTheDocumentItself_notARestatement() throws Exception {
        ObjectNode expected = (ObjectNode) mapper.readTree(
                getClass().getClassLoader().getResourceAsStream(CommunityPolicy.RESOURCE));
        assertThat(policy.asJson()).isEqualTo(expected);
    }

    // ---- fail-fast arms: each one is a document that must NOT produce a running service ----

    @Test
    void anEmptyDocumentIsRefused() {
        assertThatThrownBy(() -> new CommunityPolicy(mapper.createObjectNode()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("blockKinds");
    }

    @Test
    void aMissingRefusalSentenceIsRefused() throws Exception {
        ObjectNode broken = document();
        ((ObjectNode) broken.get("refusal")).remove("selfFollow");
        assertThatThrownBy(() -> new CommunityPolicy(broken))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("selfFollow");
    }

    @Test
    void anEmptySentenceIsRefused() throws Exception {
        ObjectNode broken = document();
        ((ObjectNode) broken.get("interactionRefusal")).put("them", "");
        assertThatThrownBy(() -> new CommunityPolicy(broken))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("them");
    }

    @Test
    void bothDirectionsSharingOneSentenceIsRefused() throws Exception {
        ObjectNode broken = document();
        ObjectNode refusal = (ObjectNode) broken.get("interactionRefusal");
        refusal.put("me", refusal.get("them").asText());
        assertThatThrownBy(() -> new CommunityPolicy(broken))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("同一句话");
    }

    @Test
    void aBlockingKindThatIsNotADeclaredKindIsRefused() throws Exception {
        ObjectNode broken = document();
        broken.putArray("interactionBlockingKinds").add("block").add("mute").add("shadow-ban");
        assertThatThrownBy(() -> new CommunityPolicy(broken))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("shadow-ban");
    }

    @Test
    void aNonBooleanDeletedProjectHidesIsRefused() throws Exception {
        ObjectNode broken = document();
        ((ObjectNode) broken.get("publication")).put("deletedProjectHides", "yes");
        assertThatThrownBy(() -> new CommunityPolicy(broken))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("deletedProjectHides");
    }

    @Test
    void muteLeavingTheBlockingListChangesTheAnswer_theLoaderDoesNotHardcodeIt() throws Exception {
        ObjectNode widened = document();
        widened.putArray("interactionBlockingKinds").add("block").add("mute");
        CommunityPolicy other = new CommunityPolicy(widened);
        assertThat(other.blocksInteraction("mute")).isTrue();
        assertThat(policy.blocksInteraction("mute")).isFalse();
        assertThat(other.blockKinds()).isEqualTo(List.of("block", "mute"));
    }

    private ObjectNode document() throws Exception {
        return (ObjectNode) mapper.readTree(
                getClass().getClassLoader().getResourceAsStream(CommunityPolicy.RESOURCE));
    }
}