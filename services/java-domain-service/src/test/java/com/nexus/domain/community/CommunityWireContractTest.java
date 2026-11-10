package com.nexus.domain.community;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The JVM's answer shape against the exported JSON Schema (SC-17, architecture rule 6: cross-end messages are
 * defined in packages/schemas, nowhere else).
 *
 * <p>There is no JSON Schema validator on this classpath, so this checks the constructs the two community
 * schemas actually use: exact field set ({@code additionalProperties: false}), every {@code required} key
 * present even when null, boolean / integer types with their bounds, and the {@code anyOf} enum-or-null.
 * That is enough to catch the realistic drift — a renamed record component, an extra field, a null dropped by
 * a NON_NULL mapper, a count that stops being integral.
 *
 * <p>The last test points the checker at a deliberately wrong document. A gate that cannot fail is not a gate.
 */
class CommunityWireContractTest {

    private static final String LIKE_SCHEMA = "contracts/community-like-state.schema.json";
    private static final String FOLLOW_SCHEMA = "contracts/community-follow-state.schema.json";

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void theLikeStateSerialisesToExactlyTheContractedFields() throws Exception {
        JsonNode schema = read(LIKE_SCHEMA);
        check(schema, mapper.valueToTree(new CommunityService.LikeState(true, 3L, null, null)));
        check(schema, mapper.valueToTree(new CommunityService.LikeState(false, 0L, "them", "对方不接受你的互动")));
        check(schema, mapper.valueToTree(new CommunityService.LikeState(false, 0L, "me", "你已经拉黑了对方，先解除才能互动")));
    }

    @Test
    void theFollowStateSerialisesToExactlyTheContractedFields() throws Exception {
        JsonNode schema = read(FOLLOW_SCHEMA);
        check(schema, mapper.valueToTree(new CommunityService.FollowState(true, 2L, null, null)));
        check(schema, mapper.valueToTree(new CommunityService.FollowState(false, 2L, "them", "对方不接受你的互动")));
    }

    @Test
    void nullsStayInThePayload_theContractRequiresTheKeys() throws Exception {
        JsonNode wire = mapper.valueToTree(new CommunityService.LikeState(true, 1L, null, null));
        assertThat(wire.has("blocked")).isTrue();
        assertThat(wire.has("reason")).isTrue();
        assertThat(wire.get("blocked").isNull()).isTrue();
    }

    @Test
    void theCheckerRejectsAnUnknownBlockedValue() throws Exception {
        JsonNode schema = read(LIKE_SCHEMA);
        JsonNode wrong = mapper.readTree("{\"liked\":true,\"count\":1,\"blocked\":\"both\",\"reason\":null}");
        assertThatThrownBy(() -> check(schema, wrong)).isInstanceOf(AssertionError.class).hasMessageContaining("blocked");
    }

    @Test
    void theCheckerRejectsAnExtraField() throws Exception {
        JsonNode schema = read(LIKE_SCHEMA);
        JsonNode wrong = mapper.readTree("{\"liked\":true,\"count\":1,\"blocked\":null,\"reason\":null,\"ok\":true}");
        assertThatThrownBy(() -> check(schema, wrong)).isInstanceOf(AssertionError.class).hasMessageContaining("ok");
    }

    @Test
    void theCheckerRejectsADroppedRequiredKey() throws Exception {
        JsonNode schema = read(FOLLOW_SCHEMA);
        JsonNode wrong = mapper.readTree("{\"following\":true,\"followers\":1,\"blocked\":null}");
        assertThatThrownBy(() -> check(schema, wrong)).isInstanceOf(AssertionError.class).hasMessageContaining("reason");
    }

    @Test
    void theCheckerRejectsANonIntegralCount() throws Exception {
        JsonNode schema = read(LIKE_SCHEMA);
        JsonNode wrong = mapper.readTree("{\"liked\":true,\"count\":1.5,\"blocked\":null,\"reason\":null}");
        assertThatThrownBy(() -> check(schema, wrong)).isInstanceOf(AssertionError.class).hasMessageContaining("count");
    }

    // ---- the checker ----

    private JsonNode read(String resource) throws Exception {
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(resource)) {
            assertThat(in).as(resource + " must be copied into the jar by the Maven build").isNotNull();
            return mapper.readTree(in);
        }
    }

    private static void check(JsonNode schema, JsonNode wire) {
        JsonNode properties = schema.path("properties");
        List<String> declared = new ArrayList<>();
        properties.fieldNames().forEachRemaining(declared::add);
        List<String> actual = new ArrayList<>();
        wire.fieldNames().forEachRemaining(actual::add);
        assertThat(actual).as("field set (additionalProperties is false)").containsExactlyInAnyOrderElementsOf(declared);

        for (JsonNode required : schema.path("required")) {
            assertThat(wire.has(required.asText())).as("required key " + required.asText()).isTrue();
        }

        for (String field : declared) {
            JsonNode value = wire.get(field);
            JsonNode spec = properties.get(field);
            if (spec.has("anyOf")) {
                boolean matched = false;
                for (JsonNode option : spec.get("anyOf")) {
                    if (option.path("type").asText().equals("null") && value.isNull()) { matched = true; break; }
                    if (option.has("enum")) {
                        for (JsonNode allowed : option.get("enum")) {
                            if (allowed.asText().equals(value.asText())) { matched = true; break; }
                        }
                    }
                }
                assertThat(matched).as(field + " must be one of the contracted values or null, got " + value).isTrue();
                continue;
            }
            JsonNode type = spec.get("type");
            String declaredType = type.asText();
            if (type.isArray()) {
                boolean nullAllowed = false;
                String nonNull = "";
                for (JsonNode option : type) {
                    if (option.asText().equals("null")) { nullAllowed = true; } else { nonNull = option.asText(); }
                }
                if (value.isNull()) {
                    assertThat(nullAllowed).as(field + " must allow null").isTrue();
                    continue;
                }
                declaredType = nonNull;
            }
            switch (declaredType) {
                case "boolean" -> assertThat(value.isBoolean()).as(field + " must be boolean").isTrue();
                case "integer" -> {
                    assertThat(value.isIntegralNumber()).as(field + " must be integral, got " + value).isTrue();
                    if (spec.has("minimum")) {
                        assertThat(value.asLong()).as(field + " minimum").isGreaterThanOrEqualTo(spec.get("minimum").asLong());
                    }
                    if (spec.has("maximum")) {
                        assertThat(value.asLong()).as(field + " maximum").isLessThanOrEqualTo(spec.get("maximum").asLong());
                    }
                }
                case "string" -> assertThat(value.isTextual()).as(field + " must be a string").isTrue();
                case "null" -> assertThat(value.isNull()).as(field + " must be null").isTrue();
                default -> throw new AssertionError("unchecked schema type for " + field + ": " + type);
            }
        }
    }

    @Test
    void theSchemasAreObjectsWithNoAdditionalProperties() throws Exception {
        for (String resource : List.of(LIKE_SCHEMA, FOLLOW_SCHEMA)) {
            JsonNode schema = read(resource);
            assertThat(schema.path("type").asText()).isEqualTo("object");
            assertThat(schema.path("additionalProperties").asBoolean()).isFalse();
            assertThat(schema.path("required").size()).isEqualTo(schema.path("properties").size());
        }
    }
}