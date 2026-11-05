package dev.nexus.api.tools;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;

/**
 * M10 v614 — the walk that turns two canonical schemas into the paths that differ.
 *
 * <p>A path is an RFC 6901 JSON Pointer: {@code ""} is the whole document, {@code /properties/city} a field,
 * {@code /required/1} the second element of an array. {@code ~} and {@code /} inside a field name are escaped
 * as {@code ~0} and {@code ~1}, so a field named "a/b" cannot be mistaken for the nested path a → b.
 *
 * <p>Objects are compared by KEY (a key present on one side only is added or removed, never a change of its
 * parent); arrays by INDEX (a shorter side is the removed or added tail); anything else is compared by value.
 * The walk is bounded by the schema bound the write path already enforces (8192 canonical bytes), so no
 * separate cap is invented here.
 */
final class JsonPointers {

    private JsonPointers() {
    }

    static ContractComparison.SchemaDiff diff(JsonNode from, JsonNode to) {
        List<String> added = new ArrayList<>();
        List<String> removed = new ArrayList<>();
        List<String> changed = new ArrayList<>();
        walk("", from, to, added, removed, changed);
        return new ContractComparison.SchemaDiff(List.copyOf(added), List.copyOf(removed), List.copyOf(changed));
    }

    private static void walk(String at, JsonNode left, JsonNode right,
            List<String> added, List<String> removed, List<String> changed) {
        if (left.isObject() && right.isObject()) {
            left.fieldNames().forEachRemaining(field -> {
                if (right.has(field)) {
                    walk(at + "/" + escape(field), left.get(field), right.get(field), added, removed, changed);
                } else {
                    removed.add(at + "/" + escape(field));
                }
            });
            right.fieldNames().forEachRemaining(field -> {
                if (!left.has(field)) {
                    added.add(at + "/" + escape(field));
                }
            });
            return;
        }
        if (left.isArray() && right.isArray()) {
            int shared = Math.min(left.size(), right.size());
            for (int i = 0; i < shared; i++) {
                walk(at + "/" + i, left.get(i), right.get(i), added, removed, changed);
            }
            for (int i = shared; i < left.size(); i++) {
                removed.add(at + "/" + i);
            }
            for (int i = shared; i < right.size(); i++) {
                added.add(at + "/" + i);
            }
            return;
        }
        if (!left.equals(right)) {
            changed.add(at);
        }
    }

    private static String escape(String field) {
        return field.replace("~", "~0").replace("/", "~1");
    }
}