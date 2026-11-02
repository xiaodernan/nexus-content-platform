package dev.nexus.api.tools;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;

/**
 * M10 v571 — the registry's rules, graded directly (no Spring context, no database).
 *
 * <p>The load-bearing cases are the ones a reader would otherwise take on trust: the name is a lowercase
 * slug and GLOBALLY unique, the schema is canonicalized before it is bounded and stored, and a removal is
 * refused by ownership BEFORE anything is deleted.
 */
@ExtendWith(MockitoExtension.class)
class ToolServiceTest {

    private static final Instant AT = Instant.parse("2026-11-02T08:00:00Z");
    private static final String OWNER = "acct-ada";

    @Mock
    private ToolRepository repository;

    private final ObjectMapper mapper = new ObjectMapper();

    private ToolService service() {
        return new ToolService(repository, Clock.fixed(AT, ZoneOffset.UTC), mapper);
    }

    private static ToolEntry row(String id, String owner, String name) {
        return new ToolEntry(id, owner, name, "a tool", "{}", AT);
    }

    @Test
    void declaringAToolTrimsTheFieldsAndStoresTheSchemaCanonically() throws Exception {
        JsonNode pretty = mapper.readTree("{\n  \"type\": \"object\",\n  \"properties\": {}\n}");
        when(repository.findByName("weather.lookup")).thenReturn(Optional.empty());
        when(repository.save(any(ToolEntry.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ToolEntry stored = service().register("  acct-ada  ", "  weather.lookup  ", "  Looks up weather.  ", pretty);

        assertThat(stored.getToolId()).matches("[0-9a-f-]{36}");
        assertThat(stored.getOwner()).isEqualTo(OWNER);
        assertThat(stored.getName()).isEqualTo("weather.lookup");
        assertThat(stored.getSummary()).isEqualTo("Looks up weather.");
        // Whitespace is not part of a schema: the row stores the compact form, so two spellings are one row.
        assertThat(stored.getInputSchema()).isEqualTo("{\"type\":\"object\",\"properties\":{}}");
        assertThat(stored.getCreatedAt()).isEqualTo(AT);
    }

    @Test
    void aTakenNameIsAConflictThatNamesTheRowThatHoldsIt() {
        when(repository.findByName("weather.lookup")).thenReturn(Optional.of(row("tool-existing", "acct-bob", "weather.lookup")));
        assertThatThrownBy(() -> service().register(OWNER, "weather.lookup", "mine", mapper.readTree("{}")))
                .isInstanceOf(ToolNameTaken.class)
                .hasMessageContaining("tool-existing");
        verify(repository, never()).save(any(ToolEntry.class));
    }

    @Test
    void aNameIsALowercaseSlugOfTwoToSixtyFourCharacters() {
        for (String bad : new String[] {null, "  ", "a", "Weather", "weather.lookup!", "-weather", "two words", "x".repeat(65)}) {
            assertThatThrownBy(() -> ToolService.requireName(bad))
                    .as("name %s", bad == null ? "null" : "\"" + bad + "\"")
                    .isInstanceOf(InvalidTool.class)
                    .hasMessageContaining("tool name");
        }
        assertThat(ToolService.requireName("  weather.lookup  ")).isEqualTo("weather.lookup");
        assertThat(ToolService.requireName("x".repeat(64))).hasSize(64);
    }

    @Test
    void theOwnerAndSummaryAreRequiredAndBounded() {
        assertThatThrownBy(() -> ToolService.requireOwner("  "))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("owner");
        assertThatThrownBy(() -> ToolService.requireOwner("a".repeat(201)))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("201");
        assertThat(ToolService.requireOwner("  acct-ada  ")).isEqualTo(OWNER);

        assertThatThrownBy(() -> ToolService.requireSummary(" "))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("summary");
        assertThatThrownBy(() -> ToolService.requireSummary("x".repeat(281)))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("281");
        assertThat(ToolService.requireSummary("  one sentence  ")).isEqualTo("one sentence");
    }

    @Test
    void theInputSchemaMustBeAJsonObject() throws Exception {
        assertThatThrownBy(() -> service().requireSchema(null))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("inputSchema");
        assertThatThrownBy(() -> service().requireSchema(mapper.readTree("\"not an object\"")))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("JSON OBJECT");
        assertThatThrownBy(() -> service().requireSchema(mapper.readTree("[1,2]")))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("JSON OBJECT");
    }

    @Test
    void theSchemaBoundIsTheCanonicalByteCount() throws Exception {
        // {"pad":"<n x's>"} is n + 10 bytes in compact form.
        JsonNode atBound = mapper.readTree("{\"pad\":\"" + "x".repeat(8182) + "\"}");
        assertThat(service().requireSchema(atBound)).hasSize(ToolService.MAX_SCHEMA_BYTES);

        JsonNode overBound = mapper.readTree("{\"pad\":\"" + "x".repeat(8183) + "\"}");
        assertThatThrownBy(() -> service().requireSchema(overBound))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("8193");
    }

    @Test
    void theCatalogIsTheWholeRegistryOrOneOwnersRows() {
        when(repository.findAllByOrderByNameAsc(any())).thenReturn(List.of(row("t1", OWNER, "a.tool")));
        when(repository.findByOwnerOrderByNameAsc(any(), any())).thenReturn(List.of(row("t1", OWNER, "a.tool")));

        service().catalog(null, 20, 0);
        service().catalog("   ", 20, 0);
        // A blank filter is the ABSENT filter, not an account: both calls are the whole catalog.
        verify(repository, times(2)).findAllByOrderByNameAsc(PageRequest.of(0, 20));

        service().catalog("  acct-ada  ", 500, 400);
        verify(repository).findByOwnerOrderByNameAsc("acct-ada", PageRequest.of(4, ToolService.MAX_LIST_LIMIT));
    }

    @Test
    void theCountIsNarrowedTheSameWayTheWindowIs() {
        when(repository.count()).thenReturn(5L);
        when(repository.countByOwner("acct-ada")).thenReturn(2L);

        assertThat(service().countOf(null)).isEqualTo(5L);
        assertThat(service().countOf("  ")).isEqualTo(5L);
        assertThat(service().countOf("  acct-ada  ")).isEqualTo(2L);
        verify(repository).countByOwner("acct-ada");
    }

    @Test
    void anIdThatNamesNothingIsAlreadyGoneAndDeletesNothing() {
        when(repository.findById("tool-missing")).thenReturn(Optional.empty());
        assertThat(service().remove("tool-missing", OWNER)).isFalse();
        verify(repository, never()).delete(any(ToolEntry.class));
    }

    @Test
    void removingSomebodyElsesRowIsForbiddenBeforeAnyDelete() {
        ToolEntry somebodys = row("tool-1", "acct-bob", "a.tool");
        when(repository.findById("tool-1")).thenReturn(Optional.of(somebodys));
        assertThatThrownBy(() -> service().remove("tool-1", OWNER))
                .isInstanceOf(NotYourTool.class)
                .hasMessageContaining("another account");
        verify(repository, never()).delete(any(ToolEntry.class));
    }

    @Test
    void theOwnerRemovesItsOwnRow() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.findById("tool-1")).thenReturn(Optional.of(mine));
        assertThat(service().remove("tool-1", OWNER)).isTrue();
        verify(repository).delete(mine);
    }

    @Test
    void aRemovalWithoutAnOwnerIsRefusedBeforeAnyRead() {
        assertThatThrownBy(() -> service().remove("tool-1", "  "))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("owner");
        verify(repository, never()).findById(any());
    }

    @Test
    void readingAToolThatNamesNothingIsA404() {
        when(repository.findById("tool-missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().get("tool-missing"))
                .isInstanceOf(UnknownTool.class)
                .hasMessageContaining("tool-missing");
    }

    @Test
    void readingAToolAnswersTheStoredRow() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.findById("tool-1")).thenReturn(Optional.of(mine));

        assertThat(service().get("tool-1")).isSameAs(mine);
        verify(repository, never()).save(any(ToolEntry.class));
    }

    @Test
    void anUpdateWithoutAnOwnerIsRefusedBeforeAnyRead() {
        assertThatThrownBy(() -> service().update("tool-1", "  ", "a tool", mapper.readTree("{}")))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("owner");
        verify(repository, never()).findById(any());
    }

    @Test
    void updatingAnUnknownIdIsA404AndSavesNothing() {
        when(repository.findById("tool-missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().update("tool-missing", OWNER, "a tool", mapper.readTree("{}")))
                .isInstanceOf(UnknownTool.class)
                .hasMessageContaining("tool-missing");
        verify(repository, never()).save(any(ToolEntry.class));
    }

    @Test
    void aStrangerCannotUpdateAndTheRowIsUntouched() {
        ToolEntry somebodys = row("tool-1", "acct-bob", "a.tool");
        when(repository.findById("tool-1")).thenReturn(Optional.of(somebodys));

        assertThatThrownBy(() -> service().update("tool-1", OWNER, "rewritten", mapper.readTree("{}")))
                .isInstanceOf(NotYourTool.class)
                .hasMessageContaining("another account");
        assertThat(somebodys.getSummary()).isEqualTo("a tool");
        verify(repository, never()).save(any(ToolEntry.class));
    }

    @Test
    void theOwnerReplacesSummaryAndSchemaWhileTheNameAndInstantStay() throws Exception {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.findById("tool-1")).thenReturn(Optional.of(mine));
        when(repository.save(mine)).thenAnswer(invocation -> invocation.getArgument(0));
        JsonNode pretty = mapper.readTree("{\n  \"type\": \"object\"\n}");

        ToolEntry updated = service().update("tool-1", "  acct-ada  ", "  A better sentence.  ", pretty);

        assertThat(updated.getSummary()).isEqualTo("A better sentence.");
        assertThat(updated.getInputSchema()).isEqualTo("{\"type\":\"object\"}");
        assertThat(updated.getToolId()).isEqualTo("tool-1");
        assertThat(updated.getName()).isEqualTo("a.tool");
        assertThat(updated.getOwner()).isEqualTo(OWNER);
        assertThat(updated.getCreatedAt()).isEqualTo(AT);
        verify(repository).save(mine);
    }

    @Test
    void anUpdateRefusesTheSameFieldBoundsBeforeSaving() throws Exception {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.findById("tool-1")).thenReturn(Optional.of(mine));

        assertThatThrownBy(() -> service().update("tool-1", OWNER, "x".repeat(281), mapper.readTree("{}")))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("281");
        assertThatThrownBy(() -> service().update("tool-1", OWNER, "a tool", mapper.readTree("\"not an object\"")))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("JSON OBJECT");
        assertThatThrownBy(() -> service().update("tool-1", OWNER, "a tool",
                        mapper.readTree("{\"pad\":\"" + "x".repeat(8183) + "\"}")))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("8193");
        verify(repository, never()).save(any(ToolEntry.class));
    }
}
