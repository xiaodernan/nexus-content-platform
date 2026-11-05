package dev.nexus.api.tools;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/**
 * M10 v614 — the schema walk behind a diff, graded on its own so the three kinds of path are pinned
 * independently of the door that serves them.
 */
class JsonPointersTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private JsonNode json(String text) throws Exception {
        return mapper.readTree(text);
    }

    @Test
    void objectsCompareByKeyAndArraysByIndex() throws Exception {
        ContractComparison.SchemaDiff diff = JsonPointers.diff(
                json("{\"a\":1,\"b\":{\"c\":[1,2]}}"),
                json("{\"a\":2,\"b\":{\"c\":[1,2,3]},\"d\":true}"));

        assertThat(diff.changed()).containsExactly("/a");
        assertThat(diff.added()).containsExactly("/b/c/2", "/d");
        assertThat(diff.removed()).isEmpty();
    }

    @Test
    void aFieldNameWithPointerCharactersIsEscaped() throws Exception {
        ContractComparison.SchemaDiff diff = JsonPointers.diff(
                json("{\"a/b\":{\"~x\":1}}"),
                json("{\"a/b\":{\"~x\":2}}"));

        assertThat(diff.changed()).containsExactly("/a~1b/~0x");
    }

    @Test
    void aValueThatChangedTypeIsOneChangedPath() throws Exception {
        ContractComparison.SchemaDiff diff = JsonPointers.diff(
                json("{\"x\":{}}"),
                json("{\"x\":1}"));

        assertThat(diff.changed()).containsExactly("/x");
        assertThat(diff.added()).isEmpty();
        assertThat(diff.removed()).isEmpty();
    }
}