package dev.nexus.api.tools;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * M10 v578 — the PIN a consumer holds, computed from bytes the registry already keeps.
 *
 * <p>A declaration's CONTRACT is what a caller actually builds against: the summary it reads and the input
 * schema it sends arguments through. Both can change under an update; nothing else in the row can, because the
 * id, owner and name are immutable and the creation instant is history. The contract is therefore exactly the
 * pair of fields a revision records, and its fingerprint is the SHA-256 of that pair written by the same
 * canonical writer this registry already uses for the schema.
 *
 * <p>The digest is taken over a canonical, order-fixed JSON OBJECT — {@code {"summary":…,"inputSchema":…}} —
 * and NOT over the two values concatenated. A concatenation needs a separator, and every separator that can
 * occur inside a summary makes two different contracts able to hash alike ({@code "a\n" + "{…}"} and
 * {@code "a" + "\n{…}"}); a wrapper object has no such question because the encoding itself delimits the
 * fields. The key order is fixed here, so the same contract hashes to the same value on every read.
 *
 * <p>Nothing is stored. The digest is recomputed from the bytes the declaration row or the revision row
 * already holds, which means it adds no column, needs no backfill for rows written before this build, and
 * cannot drift out of step with the text it describes: the rows stay the single source of truth. The cost is
 * one parse and one hash per read, bounded by the schema's 8192-byte ceiling.
 *
 * <p>A consumer does not have to recompute anything — it pins the value it was served. The recomputation rule
 * exists so the value can be CHECKED: the canonical form is compact JSON with no whitespace and keys in the
 * order shown above, so a caller that serializes {@code {summary, inputSchema}} the same way arrives at the
 * same 64 characters.
 */
public final class ContractFingerprint {

    /** The digest's name. A caller that pins a value can name the algorithm it pinned with. */
    public static final String ALGORITHM = "sha256";

    /** How many characters a fingerprint has: one byte of SHA-256 per two lowercase hex digits. */
    public static final int HEX_LENGTH = 64;

    private ContractFingerprint() {
    }

    /**
     * The fingerprint of one contract: the summary a caller read, and the schema it sends arguments through.
     *
     * @param mapper the service's canonical writer, so the digest covers the SAME bytes the registry stores
     * @param summary the declaration's summary, already trimmed by {@link ToolService#requireSummary}
     * @param schema the input schema as a tree, exactly as the row holds it
     * @return 64 lowercase hex characters
     */
    public static String of(ObjectMapper mapper, String summary, JsonNode schema) {
        ObjectNode contract = mapper.createObjectNode();
        contract.put("summary", summary);
        contract.set("inputSchema", schema);
        String canonical;
        try {
            canonical = mapper.writeValueAsString(contract);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(
                    "a stored contract could not be serialized: " + e.getOriginalMessage(), e);
        }
        return sha256Hex(canonical);
    }

    /** SHA-256 of the UTF-8 bytes of {@code text}, lowercase hex. */
    static String sha256Hex(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            // Every Java platform is required to provide SHA-256; a JVM without it cannot run this service.
            throw new IllegalStateException("this JVM does not provide SHA-256", e);
        }
    }
}