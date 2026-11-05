package dev.nexus.api.tools;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
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
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
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

    @Mock
    private ToolRevisionRepository revisions;

    @Mock
    private ToolDeprecationRepository deprecations;

    @Mock
    private ToolOwnershipRepository ownership;

    @Mock
    private ToolChangeRepository changes;

    @Mock
    private ToolAttestationRepository attestations;

    private final ObjectMapper mapper = new ObjectMapper();

    private ToolService service() {
        return new ToolService(repository, revisions, deprecations, ownership, changes, attestations, Clock.fixed(AT, ZoneOffset.UTC), mapper);
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
        verify(repository, never()).lockById(any());
    }

    @Test
    void updatingAnUnknownIdIsA404AndSavesNothing() {
        when(repository.lockById("tool-missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().update("tool-missing", OWNER, "a tool", mapper.readTree("{}")))
                .isInstanceOf(UnknownTool.class)
                .hasMessageContaining("tool-missing");
        verify(repository, never()).save(any(ToolEntry.class));
    }

    @Test
    void aStrangerCannotUpdateAndTheRowIsUntouched() {
        ToolEntry somebodys = row("tool-1", "acct-bob", "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(somebodys));

        assertThatThrownBy(() -> service().update("tool-1", OWNER, "rewritten", mapper.readTree("{}")))
                .isInstanceOf(NotYourTool.class)
                .hasMessageContaining("another account");
        assertThat(somebodys.getSummary()).isEqualTo("a tool");
        verify(repository, never()).save(any(ToolEntry.class));
    }

    @Test
    void theOwnerReplacesSummaryAndSchemaWhileTheNameAndInstantStay() throws Exception {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(mine));
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
        when(repository.lockById("tool-1")).thenReturn(Optional.of(mine));

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
    @Test
    void registeringRecordsRevisionOneOfTheDeclarationAsBorn() throws Exception {
        when(repository.findByName("weather.lookup")).thenReturn(Optional.empty());
        when(repository.save(any(ToolEntry.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ToolEntry stored = service().register(OWNER, "weather.lookup", "Looks up weather.", mapper.readTree("{}"));

        ArgumentCaptor<ToolRevision> written = ArgumentCaptor.forClass(ToolRevision.class);
        verify(revisions).save(written.capture());
        ToolRevision first = written.getValue();
        assertThat(first.getToolId()).isEqualTo(stored.getToolId());
        assertThat(first.getRevision()).isEqualTo(1);
        assertThat(first.getSummary()).isEqualTo(stored.getSummary());
        assertThat(first.getInputSchema()).isEqualTo(stored.getInputSchema());
        assertThat(first.getRecordedAt()).isEqualTo(AT);
    }

    @Test
    void anUpdateAppendsTheNextRevisionAndLeavesTheEarlierOneAlone() throws Exception {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(mine));
        when(revisions.findTopByToolIdOrderByRevisionDesc("tool-1"))
                .thenReturn(Optional.of(new ToolRevision("tool-1", 1, "a tool", "{}", AT)));
        when(repository.save(mine)).thenAnswer(invocation -> invocation.getArgument(0));

        service().update("tool-1", OWNER, "A better sentence.", mapper.readTree("{\n  \"type\": \"object\"\n}"));

        ArgumentCaptor<ToolRevision> written = ArgumentCaptor.forClass(ToolRevision.class);
        verify(revisions).save(written.capture());
        ToolRevision second = written.getValue();
        assertThat(second.getToolId()).isEqualTo("tool-1");
        assertThat(second.getRevision()).isEqualTo(2);
        assertThat(second.getSummary()).isEqualTo("A better sentence.");
        assertThat(second.getInputSchema()).isEqualTo("{\"type\":\"object\"}");
        assertThat(second.getRecordedAt()).isEqualTo(AT);
        // The parent row is locked so two updates cannot both read "the newest is 1" and both write 2.
        verify(repository).lockById("tool-1");
    }

    @Test
    void aHistoryIsANewestFirstWindowWithTheWholeCount() {
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(revisions.findByToolIdOrderByRevisionDesc("tool-1", PageRequest.of(0, 1)))
                .thenReturn(List.of(new ToolRevision("tool-1", 3, "third", "{}", AT)));
        when(revisions.findByToolIdOrderByRevisionDesc("tool-1", PageRequest.of(3, 1)))
                .thenReturn(List.of(new ToolRevision("tool-1", 1, "first", "{}", AT)));
        when(revisions.countByToolId("tool-1")).thenReturn(3L);

        List<ToolRevision> newest = service().history("tool-1", null, 1, 0);
        List<ToolRevision> older = service().history("tool-1", null, 1, 3);

        assertThat(newest).extracting(ToolRevision::getRevision).containsExactly(3);
        assertThat(older).extracting(ToolRevision::getRevision).containsExactly(1);
        assertThat(service().revisionCount("tool-1", null)).isEqualTo(3);
    }

    @Test
    void aHistoryOfAnUnknownToolIsA404AndNoWindowIsRead() {
        when(repository.findById("tool-missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().history("tool-missing", null, 20, 0))
                .isInstanceOf(UnknownTool.class)
                .hasMessageContaining("tool-missing");
        verify(revisions, never()).findByToolIdOrderByRevisionDesc(any(), any());
    }

    @Test
    void removalTakesTheHistoryWithTheDeclaration() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.findById("tool-1")).thenReturn(Optional.of(mine));

        assertThat(service().remove("tool-1", OWNER)).isTrue();

        verify(revisions).deleteByToolId("tool-1");
        verify(repository).delete(mine);
    }

    @Test
    void aStrangersUpdateWritesNoRevision() throws Exception {
        ToolEntry somebodys = row("tool-1", "acct-bob", "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(somebodys));

        assertThatThrownBy(() -> service().update("tool-1", OWNER, "rewritten", mapper.readTree("{}")))
                .isInstanceOf(NotYourTool.class);
        verify(revisions, never()).save(any(ToolRevision.class));
    }
    @Test
    void aDeclarationIsReadableByItsGlobalNameAndTheNameIsTrimmed() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.findByName("a.tool")).thenReturn(Optional.of(mine));

        assertThat(service().getByName("  a.tool  ")).isSameAs(mine);
    }

    @Test
    void aNameThatHoldsNoRowIsA404() {
        when(repository.findByName("no.such.tool")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().getByName("no.such.tool"))
                .isInstanceOf(UnknownTool.class)
                .hasMessageContaining("no.such.tool");
    }

    @Test
    void aMalformedNameIsA400BeforeAnyLookup() {
        assertThatThrownBy(() -> service().getByName("Weather.Lookup"))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("tool name");
        assertThatThrownBy(() -> service().getByName("  "))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("tool name");
        verify(repository, never()).findByName(any());
    }
    @Test
    void deprecatingTrimsTheSentenceAndStoresTheHint() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(mine));
        when(deprecations.findByToolId("tool-1")).thenReturn(Optional.empty());
        when(deprecations.save(any(ToolDeprecation.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ToolDeprecation stored = service().deprecate("tool-1", OWNER, "  Use b.tool instead.  ", "  b.tool  ");

        assertThat(stored.getToolId()).isEqualTo("tool-1");
        assertThat(stored.getMessage()).isEqualTo("Use b.tool instead.");
        assertThat(stored.getReplacementName()).isEqualTo("b.tool");
        assertThat(stored.getDeprecatedAt()).isEqualTo(AT);
    }

    @Test
    void aDeprecationWithoutAReplacementStoresNoHint() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(mine));
        when(deprecations.findByToolId("tool-1")).thenReturn(Optional.empty());
        when(deprecations.save(any(ToolDeprecation.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ToolDeprecation stored = service().deprecate("tool-1", OWNER, "Going away.", "   ");

        assertThat(stored.getReplacementName()).isNull();
    }

    @Test
    void deprecatingAgainReplacesTheOneRowRatherThanAppending() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        ToolDeprecation existing = new ToolDeprecation("tool-1", "Old reason.", "b.tool", AT.minusSeconds(60));
        when(repository.lockById("tool-1")).thenReturn(Optional.of(mine));
        when(deprecations.findByToolId("tool-1")).thenReturn(Optional.of(existing));
        when(deprecations.save(existing)).thenReturn(existing);

        ToolDeprecation stored = service().deprecate("tool-1", OWNER, "A new reason.", null);

        assertThat(stored.getMessage()).isEqualTo("A new reason.");
        assertThat(stored.getReplacementName()).isNull();
        assertThat(stored.getDeprecatedAt()).isEqualTo(AT);
        verify(deprecations).save(existing);
    }

    @Test
    void aDeprecationRefusesItsOwnToolAsTheReplacement() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(mine));

        assertThatThrownBy(() -> service().deprecate("tool-1", OWNER, "Going away.", "a.tool"))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("its own tool");
        verify(deprecations, never()).save(any(ToolDeprecation.class));
    }

    @Test
    void aDeprecationRefusesAMalformedReplacementName() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(mine));

        assertThatThrownBy(() -> service().deprecate("tool-1", OWNER, "Going away.", "B.Tool"))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("tool name");
        verify(deprecations, never()).save(any(ToolDeprecation.class));
    }

    @Test
    void aDeprecationMessageIsRequiredAndBounded() {
        assertThatThrownBy(() -> ToolService.requireDeprecationMessage("  "))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("message");
        assertThatThrownBy(() -> ToolService.requireDeprecationMessage("x".repeat(281)))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("281");
        assertThat(ToolService.requireDeprecationMessage("  Going away.  ")).isEqualTo("Going away.");
    }

    @Test
    void aStrangerCannotDeprecateAndWritesNothing() {
        ToolEntry somebodys = row("tool-1", "acct-bob", "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(somebodys));

        assertThatThrownBy(() -> service().deprecate("tool-1", OWNER, "Mine now.", null))
                .isInstanceOf(NotYourTool.class);
        verify(deprecations, never()).save(any(ToolDeprecation.class));
    }

    @Test
    void withdrawingADeprecationSaysWhetherOneExisted() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        ToolDeprecation existing = new ToolDeprecation("tool-1", "Going away.", null, AT);
        when(repository.lockById("tool-1")).thenReturn(Optional.of(mine));
        when(deprecations.findByToolId("tool-1")).thenReturn(Optional.of(existing), Optional.empty());

        assertThat(service().undeprecate("tool-1", OWNER)).isTrue();
        assertThat(service().undeprecate("tool-1", OWNER)).isFalse();

        verify(deprecations).delete(existing);
    }

    @Test
    void theDeprecationOfALiveToolIsA404UnderItsOwnName() {
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(deprecations.findByToolId("tool-1")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().deprecationOf("tool-1"))
                .isInstanceOf(UnknownDeprecation.class)
                .hasMessageContaining("not deprecated");
    }

    @Test
    void removalTakesTheDeprecationWithTheDeclaration() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.findById("tool-1")).thenReturn(Optional.of(mine));

        assertThat(service().remove("tool-1", OWNER)).isTrue();

        verify(deprecations).deleteByToolId("tool-1");
        verify(repository).delete(mine);
    }

    @Test
    void aDeprecationPageIsANewestFirstWindowWithTheWholeCount() {
        when(deprecations.firstPage(PageRequest.of(0, 1)))
                .thenReturn(List.of(new ToolDeprecation("tool-2", "Going away.", null, AT)));
        when(deprecations.count()).thenReturn(1L);

        List<ToolDeprecation> window = service().deprecationPage(1, 0);

        assertThat(window).extracting(ToolDeprecation::getToolId).containsExactly("tool-2");
        assertThat(service().deprecationCount()).isEqualTo(1);
    }

    @Test
    void aDeprecationCursorAsksForThePairAfterItAndTheTotalStaysWhole() {
        String key = AT.toEpochMilli() + ":tool-2";
        when(deprecations.pageAfter(AT, "tool-2", PageRequest.of(0, 20)))
                .thenReturn(List.of(new ToolDeprecation("tool-3", "Also going away.", null, AT.minusSeconds(1))));

        List<ToolDeprecation> window = service().deprecationPage("  " + key + "  ", 20, 0);

        assertThat(window).extracting(ToolDeprecation::getToolId).containsExactly("tool-3");
        verify(deprecations, never()).firstPage(any());
    }

    @Test
    void aDeprecationCursorAndANonZeroOffsetAreRefusedTogether() {
        assertThatThrownBy(() -> service().deprecationPage("100:tool-2", 20, 1))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("offset");
        verify(deprecations, never()).pageAfter(any(), any(), any());
        verify(deprecations, never()).firstPage(any());
    }

    @Test
    void aDeprecationCursorThatIsNotAPairIsRefusedByItsShape() {
        assertThatThrownBy(() -> service().deprecationPage("tool-2", 20, 0))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("<epochMillis>:<toolId>");
        assertThatThrownBy(() -> service().deprecationPage("abc:tool-2", 20, 0))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("<epochMillis>:<toolId>");
        assertThatThrownBy(() -> service().deprecationPage("100:", 20, 0))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("<epochMillis>:<toolId>");
        assertThatThrownBy(() -> service().deprecationPage("9".repeat(30) + ":tool-2", 20, 0))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("<epochMillis>:<toolId>");
        assertThatThrownBy(() -> service().deprecationPage("100:" + "t".repeat(65), 20, 0))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("<epochMillis>:<toolId>");
        verify(deprecations, never()).pageAfter(any(), any(), any());
        verify(deprecations, never()).firstPage(any());
    }

    @Test
    void aBlankDeprecationCursorIsTheOffsetPath() {
        when(deprecations.firstPage(PageRequest.of(0, 20)))
                .thenReturn(List.of());

        service().deprecationPage("   ", 20, 0);

        verify(deprecations, never()).pageAfter(any(), any(), any());
    }

    @Test
    void anOwnerNarrowsTheDeprecationWindowAndItsWholeCount() {
        when(deprecations.firstPageByOwner(OWNER, PageRequest.of(0, 1)))
                .thenReturn(List.of(new ToolDeprecation("tool-2", "Going away.", null, AT)));
        when(deprecations.countByOwner(OWNER)).thenReturn(1L);

        assertThat(service().deprecationPage(OWNER, null, 1, 0))
                .extracting(ToolDeprecation::getToolId).containsExactly("tool-2");
        assertThat(service().deprecationCount(OWNER)).isEqualTo(1);
        verify(deprecations, never()).firstPage(any());
        verify(deprecations, never()).count();
    }

    @Test
    void anOwnerComposesWithTheDeprecationPairCursor() {
        String key = AT.toEpochMilli() + ":tool-2";
        when(deprecations.pageAfterByOwner(OWNER, AT, "tool-2", PageRequest.of(0, 20)))
                .thenReturn(List.of(new ToolDeprecation("tool-3", "Also going away.", null, AT.minusSeconds(1))));

        assertThat(service().deprecationPage(OWNER, key, 20, 0))
                .extracting(ToolDeprecation::getToolId).containsExactly("tool-3");
        verify(deprecations, never()).pageAfter(any(), any(), any());
    }

    @Test
    void aReplacementStatusNarrowsTheDeprecationWindowAndItsWholeCount() {
        when(deprecations.firstPageFiltered(null, "none", PageRequest.of(0, 1)))
                .thenReturn(List.of(new ToolDeprecation("tool-2", "No successor.", null, AT)));
        when(deprecations.countFiltered(null, "none")).thenReturn(1L);

        assertThat(service().deprecationPage(null, "none", null, 1, 0))
                .extracting(ToolDeprecation::getToolId).containsExactly("tool-2");
        assertThat(service().deprecationCount(null, "none")).isEqualTo(1);

        verify(deprecations, never()).firstPage(any());
        verify(deprecations, never()).count();
    }

    @Test
    void aSelectionOfStatesIsCanonicalisedAndNarrowsBothWindowAndCount() {
        when(deprecations.firstPageFiltered(null, "none,unresolved", PageRequest.of(0, 20)))
                .thenReturn(List.of());
        when(deprecations.countFiltered(null, "none,unresolved")).thenReturn(0L);

        assertThat(service().deprecationPage(null, " none , unresolved,none ", null, 20, 0)).isEmpty();
        assertThat(service().deprecationCount(null, "none,unresolved,none")).isZero();

        verify(deprecations).firstPageFiltered(null, "none,unresolved", PageRequest.of(0, 20));
        verify(deprecations).countFiltered(null, "none,unresolved");
        verify(deprecations, never()).firstPage(any());
    }

    @Test
    void anUnknownWordInsideASelectionIsRefusedByItsOwnName() {
        assertThatThrownBy(() -> service().deprecationPage(null, "none,Gone", null, 20, 0))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("\"Gone\"");

        verify(deprecations, never()).firstPageFiltered(any(), any(), any());
    }

    @Test
    void anOwnerAndAReplacementStatusComposeWithThePairCursor() {
        String key = AT.toEpochMilli() + ":tool-2";
        when(deprecations.pageAfterFiltered(OWNER, "deprecated", AT, "tool-2", PageRequest.of(0, 20)))
                .thenReturn(List.of(new ToolDeprecation("tool-3", "Its successor goes too.", "b.tool", AT.minusSeconds(1))));

        assertThat(service().deprecationPage(OWNER, "deprecated", key, 20, 0))
                .extracting(ToolDeprecation::getToolId).containsExactly("tool-3");

        verify(deprecations, never()).pageAfterByOwner(any(), any(), any(), any());
    }

    @Test
    void aBlankReplacementStatusIsTheAbsentFilter() {
        when(deprecations.firstPage(PageRequest.of(0, 20))).thenReturn(List.of());
        when(deprecations.count()).thenReturn(0L);

        service().deprecationPage(null, "   ", null, 20, 0);
        assertThat(service().deprecationCount(null, "   ")).isZero();

        verify(deprecations, never()).firstPageFiltered(any(), any(), any());
        verify(deprecations, never()).countFiltered(any(), any());
    }

    @Test
    void aReplacementStatusOutsideTheClosedVocabularyIsRefusedBeforeAnyQuery() {
        assertThatThrownBy(() -> service().deprecationPage(null, "LIVE", null, 20, 0))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("none")
                .hasMessageContaining("deprecated");

        verify(deprecations, never()).firstPage(any());
        verify(deprecations, never()).firstPageFiltered(any(), any(), any());
    }

    @Test
    void aBlankOwnerIsTheAbsentFilterNotAnEmptyDeprecationList() {
        when(deprecations.firstPage(PageRequest.of(0, 20))).thenReturn(List.of());
        when(deprecations.count()).thenReturn(0L);

        service().deprecationPage("   ", null, 20, 0);
        assertThat(service().deprecationCount("   ")).isZero();

        verify(deprecations, never()).firstPageByOwner(any(), any());
        verify(deprecations, never()).countByOwner(any());
    }

    @Test
    void anAbsentReplacementHintIsNoneAndReadsNothing() {
        assertThat(service().resolveReplacement(null).status()).isEqualTo("none");
        assertThat(service().resolveReplacement("   ").status()).isEqualTo("none");
        assertThat(service().resolveReplacement(null).toolId()).isNull();

        verify(repository, never()).findByNameIn(any());
    }

    @Test
    void aReplacementHintThatNamesNothingIsUnresolved() {
        when(repository.findByNameIn(List.of("b.tool"))).thenReturn(List.of());

        ToolService.ReplacementResolution resolved = service().resolveReplacement("  b.tool  ");

        assertThat(resolved.status()).isEqualTo("unresolved");
        assertThat(resolved.toolId()).isNull();
        verify(deprecations, never()).findAllById(any());
    }

    @Test
    void aReplacementHintResolvesToTheLiveRowAndItsId() {
        when(repository.findByNameIn(List.of("b.tool")))
                .thenReturn(List.of(row("tool-2", OWNER, "b.tool")));
        when(deprecations.findAllById(List.of("tool-2"))).thenReturn(List.of());

        ToolService.ReplacementResolution resolved = service().resolveReplacement("b.tool");

        assertThat(resolved.status()).isEqualTo("live");
        assertThat(resolved.toolId()).isEqualTo("tool-2");
    }

    @Test
    void aReplacementHintThatNamesADeprecatedRowSaysSo() {
        when(repository.findByNameIn(List.of("b.tool")))
                .thenReturn(List.of(row("tool-2", OWNER, "b.tool")));
        when(deprecations.findAllById(List.of("tool-2")))
                .thenReturn(List.of(new ToolDeprecation("tool-2", "Also going away.", null, AT)));

        ToolService.ReplacementResolution resolved = service().resolveReplacement("b.tool");

        assertThat(resolved.status()).isEqualTo("deprecated");
        assertThat(resolved.toolId()).isEqualTo("tool-2");
    }

    @Test
    void aPageOfHintsResolvesInOneBatchWithDuplicatesCollapsed() {
        when(repository.findByNameIn(List.of("b.tool", "c.tool")))
                .thenReturn(List.of(row("tool-2", OWNER, "b.tool")));
        when(deprecations.findAllById(List.of("tool-2"))).thenReturn(List.of());

        Map<String, ToolService.ReplacementResolution> resolved =
                service().resolveReplacements(java.util.Arrays.asList("b.tool", null, "  b.tool  ", "c.tool"));

        assertThat(resolved).hasSize(2);
        assertThat(resolved.get("b.tool").status()).isEqualTo("live");
        assertThat(resolved.get("c.tool").status()).isEqualTo("unresolved");
        verify(repository, times(1)).findByNameIn(List.of("b.tool", "c.tool"));
        verify(deprecations, times(1)).findAllById(List.of("tool-2"));
    }
    @Test
    void aSearchNarrowsToNameOrSummaryMatchesAndIsCaseInsensitive() {
        ToolEntry mine = row("tool-1", OWNER, "weather.lookup");
        when(repository.searchAll("%weather%", PageRequest.of(0, 20))).thenReturn(List.of(mine));

        assertThat(service().catalog(null, "  WEATHER  ", 20, 0)).containsExactly(mine);
    }

    @Test
    void aSearchNarrowsOneOwnersDeclarationsWithTheSamePattern() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.searchByOwner(OWNER, "%tool%", PageRequest.of(0, 20))).thenReturn(List.of(mine));

        assertThat(service().catalog("  acct-ada  ", "tool", 20, 0)).containsExactly(mine);
    }

    @Test
    void aSearchCountsTheSameMatchesItsWindowShows() {
        when(repository.countSearchAll("%weather%")).thenReturn(1L);
        when(repository.countSearchByOwner(OWNER, "%weather%")).thenReturn(1L);

        assertThat(service().countOf(null, "weather")).isEqualTo(1);
        assertThat(service().countOf(OWNER, "weather")).isEqualTo(1);
    }

    @Test
    void aBlankSearchIsTheAbsentFilterNotEverything() {
        when(repository.findAllByOrderByNameAsc(PageRequest.of(0, 20)))
                .thenReturn(List.of(row("tool-1", OWNER, "a.tool")));

        assertThat(service().catalog(null, "   ", 20, 0)).hasSize(1);
        verify(repository, never()).searchAll(any(), any());
    }

    @Test
    void aSearchLongerThanTheBoundIsRefusedBeforeAnyQuery() {
        assertThatThrownBy(() -> service().catalog(null, "x".repeat(101), 20, 0))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("101");
        verify(repository, never()).searchAll(any(), any());
    }

    @Test
    void likeWildcardsInASearchAreSearchedForLiterally() {
        assertThat(ToolService.likePattern("weather")).isEqualTo("%weather%");
        assertThat(ToolService.likePattern("100%")).isEqualTo("%100\\%%");
        assertThat(ToolService.likePattern("a_b")).isEqualTo("%a\\_b%");
        assertThat(ToolService.likePattern("c:\\temp")).isEqualTo("%c:\\\\temp%");
    }
    // ── v578: the pin a consumer holds ────────────────────────────────────────────────────────────────
    // The digest is over the canonical object {"summary":…,"inputSchema":…} written by the SAME mapper that
    // stored the schema, so these two vectors fix the rule: a change to the wrapper, the key order or the
    // separator would change them, and that is exactly what a consumer's pin must never do silently.
    @Test
    void aPinIsTheSha256OfTheSummaryAndTheSchemaInThatOrder() {
        ToolEntry empty = row("tool-1", OWNER, "a.tool");
        ToolEntry typed = new ToolEntry("tool-2", OWNER, "b.tool", "a tool", "{\"type\":\"object\"}", AT);

        assertThat(service().contractSha256(empty))
                .isEqualTo("61a98b7253feb4139f9e031f6bedc00f917353564cf627e5f3b603be5c9891a7");
        assertThat(service().contractSha256(typed))
                .isEqualTo("87882f0bd39f1e9d796ca58ffc9e52fb7658ad34f5724840bd0cd083f61e5ecc");
    }

    @Test
    void aPinIsSixtyFourLowercaseHexCharacters() {
        assertThat(service().contractSha256(row("tool-1", OWNER, "a.tool")))
                .hasSize(ContractFingerprint.HEX_LENGTH)
                .matches("[0-9a-f]{64}");
    }

    @Test
    void twoSpellingsOfOneSchemaPinToTheSameContract() throws Exception {
        when(repository.findByName("a.tool")).thenReturn(Optional.empty());
        when(repository.findByName("b.tool")).thenReturn(Optional.empty());
        when(repository.save(any(ToolEntry.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ToolEntry pretty = service().register(
                OWNER, "a.tool", "a tool", mapper.readTree("{\n  \"type\": \"object\"\n}"));
        ToolEntry compact = service().register(
                OWNER, "b.tool", "a tool", mapper.readTree("{\"type\":\"object\"}"));

        assertThat(pretty.getInputSchema()).isEqualTo(compact.getInputSchema());
        assertThat(service().contractSha256(pretty)).isEqualTo(service().contractSha256(compact));
    }

    @Test
    void aChangedSummaryChangesThePinEvenWhenTheSchemaIsUntouched() {
        ToolEntry born = row("tool-1", OWNER, "a.tool");
        ToolEntry reworded = new ToolEntry("tool-1", OWNER, "a.tool", "a better tool", "{}", AT);

        assertThat(service().contractSha256(reworded)).isNotEqualTo(service().contractSha256(born));
    }

    @Test
    void aChangedSchemaChangesThePinEvenWhenTheSummaryIsUntouched() {
        ToolEntry born = row("tool-1", OWNER, "a.tool");
        ToolEntry respecified = new ToolEntry("tool-1", OWNER, "a.tool", "a tool", "{\"type\":\"object\"}", AT);

        assertThat(service().contractSha256(respecified)).isNotEqualTo(service().contractSha256(born));
    }

    @Test
    void aRevisionPinsWhatItSaidNotWhatIsServedNow() {
        ToolEntry current = new ToolEntry("tool-1", OWNER, "a.tool", "a better tool", "{\"type\":\"object\"}", AT);
        ToolRevision birth = new ToolRevision("tool-1", 1, "a tool", "{}", AT);

        assertThat(service().contractSha256(birth)).isNotEqualTo(service().contractSha256(current));
        assertThat(service().contractSha256(birth)).isEqualTo(service().contractSha256(row("tool-1", OWNER, "a.tool")));
    }

    @Test
    void thePinIsRecomputedFromTheRowSoItCannotDriftFromTheTextItDescribes() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");

        assertThat(service().contractSha256(mine)).isEqualTo(service().contractSha256(mine));
        // Nothing was written to keep it: there is no column to read and none to update.
        verify(repository, never()).save(any(ToolEntry.class));
    }
    // ── v579: a declaration can change hands, and the chain keeps both holders ───────────────────────
    @Test
    void aTransferHandsTheDeclarationOverAndRecordsTheHandover() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(mine));
        when(repository.save(mine)).thenAnswer(invocation -> invocation.getArgument(0));

        ToolEntry handedOver = service().transfer("tool-1", OWNER, "  acct-bob  ");

        // Same declaration: the id and the name are the ones it was born with.
        assertThat(handedOver.getToolId()).isEqualTo("tool-1");
        assertThat(handedOver.getName()).isEqualTo("a.tool");
        assertThat(handedOver.getOwner()).isEqualTo("acct-bob");

        ArgumentCaptor<ToolOwnership> chain = ArgumentCaptor.forClass(ToolOwnership.class);
        verify(ownership).save(chain.capture());
        ToolOwnership first = chain.getValue();
        assertThat(first.getToolId()).isEqualTo("tool-1");
        assertThat(first.getTransfer()).isEqualTo(1);
        assertThat(first.getFromOwner()).isEqualTo(OWNER);
        assertThat(first.getToOwner()).isEqualTo("acct-bob");
        assertThat(first.getTransferredAt()).isEqualTo(AT);

        // A handover changes nothing the declaration SAYS, so it is not a revision: a revision number means
        // "the contract changed", and this contract did not.
        verify(revisions, never()).save(any(ToolRevision.class));
    }

    @Test
    void aHandoverDoesNotChangeTheContractPin() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        ToolEntry theirs = new ToolEntry("tool-1", "acct-bob", "a.tool", "a tool", "{}", AT);

        // A consumer built against this contract; the account holding the row is not part of what it built.
        assertThat(service().contractSha256(theirs)).isEqualTo(service().contractSha256(mine));
    }

    @Test
    void aStrangersTransferIsRefusedAndWritesNothing() {
        when(repository.lockById("tool-1")).thenReturn(Optional.of(row("tool-1", "acct-bob", "a.tool")));

        assertThatThrownBy(() -> service().transfer("tool-1", OWNER, "acct-eve"))
                .isInstanceOf(NotYourTool.class);
        verify(ownership, never()).save(any(ToolOwnership.class));
        verify(repository, never()).save(any(ToolEntry.class));
    }

    @Test
    void aTransferToTheCurrentHolderIsRefusedRatherThanRecorded() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(mine));

        assertThatThrownBy(() -> service().transfer("tool-1", OWNER, OWNER))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("different account");
        // A no-op handover row would put a holder change in the chain that never happened.
        verify(ownership, never()).save(any(ToolOwnership.class));
    }

    @Test
    void aTransferWithoutATargetIsRefused() {
        when(repository.lockById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));

        assertThatThrownBy(() -> service().transfer("tool-1", OWNER, "   "))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("to");
        verify(ownership, never()).save(any(ToolOwnership.class));
    }

    @Test
    void aSecondTransferAppendsToTheChainInsteadOfReplacingIt() {
        ToolEntry mine = row("tool-1", "acct-bob", "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(mine));
        when(repository.save(mine)).thenAnswer(invocation -> invocation.getArgument(0));
        when(ownership.findTopByToolIdOrderByTransferDesc("tool-1"))
                .thenReturn(Optional.of(new ToolOwnership("tool-1", 1, OWNER, "acct-bob", AT)));

        service().transfer("tool-1", "acct-bob", "acct-cy");

        ArgumentCaptor<ToolOwnership> chain = ArgumentCaptor.forClass(ToolOwnership.class);
        verify(ownership).save(chain.capture());
        assertThat(chain.getValue().getTransfer()).isEqualTo(2);
        assertThat(chain.getValue().getFromOwner()).isEqualTo("acct-bob");
        assertThat(chain.getValue().getToOwner()).isEqualTo("acct-cy");
    }

    @Test
    void anUnknownToolCannotBeTransferred() {
        when(repository.lockById("tool-missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().transfer("tool-missing", OWNER, "acct-bob"))
                .isInstanceOf(UnknownTool.class)
                .hasMessageContaining("tool-missing");
        verify(ownership, never()).save(any(ToolOwnership.class));
    }

    @Test
    void aChainOfHoldersIsANewestFirstWindowWithTheWholeCount() {
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", "acct-cy", "a.tool")));
        when(ownership.findByToolIdOrderByTransferDesc("tool-1", PageRequest.of(0, 1)))
                .thenReturn(List.of(new ToolOwnership("tool-1", 2, "acct-bob", "acct-cy", AT)));
        when(ownership.countByToolId("tool-1")).thenReturn(2L);

        assertThat(service().ownershipHistory("tool-1", 1, 0))
                .extracting(ToolOwnership::getTransfer)
                .containsExactly(2);
        assertThat(service().ownershipCount("tool-1")).isEqualTo(2L);
    }

    @Test
    void aChainOfAnUnknownToolIsA404RatherThanAnEmptyChain() {
        when(repository.findById("tool-missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().ownershipHistory("tool-missing", 20, 0))
                .isInstanceOf(UnknownTool.class);
        verify(ownership, never()).findByToolIdOrderByTransferDesc(any(), any());
    }

    @Test
    void removalTakesTheChainOfHoldersWithTheDeclaration() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.findById("tool-1")).thenReturn(Optional.of(mine));

        assertThat(service().remove("tool-1", OWNER)).isTrue();

        verify(ownership).deleteByToolId("tool-1");
        verify(repository).delete(mine);
    }

    // ── v580: a consumer asks for what came AFTER the revision it already has ─────────────────────────
    @Test
    void aHistorySinceIsOnlyTheRevisionsTheCallerDoesNotHave() {
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(revisions.findByToolIdAndRevisionGreaterThanOrderByRevisionDesc("tool-1", 1, PageRequest.of(0, 20)))
                .thenReturn(List.of(new ToolRevision("tool-1", 2, "second", "{}", AT)));
        when(revisions.countByToolIdAndRevisionGreaterThan("tool-1", 1)).thenReturn(1L);

        List<ToolRevision> newer = service().history("tool-1", 1, 20, 0);

        assertThat(newer).extracting(ToolRevision::getRevision).containsExactly(2);
        assertThat(service().revisionCount("tool-1", 1)).isEqualTo(1L);
        // The narrowed window must not be counted with the whole history's query.
        verify(revisions, never()).countByToolId("tool-1");
    }

    @Test
    void aHistoryWithoutASinceIsTheWholeHistoryAndUsesTheWholeCount() {
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(revisions.findByToolIdOrderByRevisionDesc("tool-1", PageRequest.of(0, 20))).thenReturn(List.of());
        when(revisions.countByToolId("tool-1")).thenReturn(4L);

        service().history("tool-1", null, 20, 0);

        assertThat(service().revisionCount("tool-1", null)).isEqualTo(4L);
        verify(revisions, never()).countByToolIdAndRevisionGreaterThan("tool-1", 0);
    }

    @Test
    void aSinceBoundsTheWindowAndTheCountTheSameWay() {
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(revisions.findByToolIdAndRevisionGreaterThanOrderByRevisionDesc("tool-1", 3, PageRequest.of(1, 1)))
                .thenReturn(List.of());
        when(revisions.countByToolIdAndRevisionGreaterThan("tool-1", 3)).thenReturn(0L);

        service().history("tool-1", 3, 1, 1);

        assertThat(service().revisionCount("tool-1", 3)).isZero();
    }

    @Test
    void aNegativeSinceIsRefusedBeforeAnyQuery() {
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));

        assertThatThrownBy(() -> service().history("tool-1", -1, 20, 0))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("0 or more");
        verify(revisions, never()).findByToolIdAndRevisionGreaterThanOrderByRevisionDesc(any(), any(Integer.class), any());
    }

    // ── v581: retention — the owner removes the revisions older than a bound it names ─────────────────
    @Test
    void aPruneRemovesOnlyTheRevisionsOlderThanItsBound() {
        when(repository.lockById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(revisions.findTopByToolIdOrderByRevisionDesc("tool-1"))
                .thenReturn(Optional.of(new ToolRevision("tool-1", 3, "third", "{}", AT)));
        when(revisions.deleteByToolIdAndRevisionLessThan("tool-1", 2)).thenReturn(1);

        assertThat(service().pruneRevisions("tool-1", OWNER, 2)).isEqualTo(1);
        verify(revisions).deleteByToolIdAndRevisionLessThan("tool-1", 2);
    }

    @Test
    void aPruneThatNamesTheNewestRevisionKeepsIt() {
        when(repository.lockById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(revisions.findTopByToolIdOrderByRevisionDesc("tool-1"))
                .thenReturn(Optional.of(new ToolRevision("tool-1", 3, "third", "{}", AT)));
        when(revisions.deleteByToolIdAndRevisionLessThan("tool-1", 3)).thenReturn(2);

        assertThat(service().pruneRevisions("tool-1", OWNER, 3)).isEqualTo(2);
    }

    @Test
    void aPrunePastTheNewestRevisionIsRefusedAndDeletesNothing() {
        when(repository.lockById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(revisions.findTopByToolIdOrderByRevisionDesc("tool-1"))
                .thenReturn(Optional.of(new ToolRevision("tool-1", 3, "third", "{}", AT)));

        assertThatThrownBy(() -> service().pruneRevisions("tool-1", OWNER, 4))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("keeps the newest");
        verify(revisions, never()).deleteByToolIdAndRevisionLessThan(any(), any(Integer.class));
    }

    @Test
    void aPruneWithoutABoundHasNoBoundaryToCheck() {
        when(repository.lockById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));

        assertThatThrownBy(() -> service().pruneRevisions("tool-1", OWNER, null))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("before");
        verify(revisions, never()).deleteByToolIdAndRevisionLessThan(any(), any(Integer.class));
    }

    @Test
    void aPruneOfANonPositiveBoundIsRefused() {
        when(repository.lockById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));

        assertThatThrownBy(() -> service().pruneRevisions("tool-1", OWNER, 0))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("1 or more");
        verify(revisions, never()).deleteByToolIdAndRevisionLessThan(any(), any(Integer.class));
    }

    @Test
    void aStrangersPruneIsRefusedBeforeAnyCountIsRead() {
        when(repository.lockById("tool-1")).thenReturn(Optional.of(row("tool-1", "acct-bob", "a.tool")));

        assertThatThrownBy(() -> service().pruneRevisions("tool-1", OWNER, 2))
                .isInstanceOf(NotYourTool.class);
        verify(revisions, never()).deleteByToolIdAndRevisionLessThan(any(), any(Integer.class));
        verify(revisions, never()).findTopByToolIdOrderByRevisionDesc(any());
    }

    @Test
    void anUnknownToolCannotBePruned() {
        when(repository.lockById("tool-missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().pruneRevisions("tool-missing", OWNER, 2))
                .isInstanceOf(UnknownTool.class);
        verify(revisions, never()).deleteByToolIdAndRevisionLessThan(any(), any(Integer.class));
    }

    @Test
    void aDeclarationWithNoRecordedHistoryHasNothingToPrune() {
        when(repository.lockById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(revisions.findTopByToolIdOrderByRevisionDesc("tool-1")).thenReturn(Optional.empty());

        assertThat(service().pruneRevisions("tool-1", OWNER, 1)).isZero();
        verify(revisions, never()).deleteByToolIdAndRevisionLessThan(any(), any(Integer.class));
    }

    // ── v590: the declaration at ONE pin, and the fact that the pin is not a column ────────────────
    @Test
    void thePinAPinnedConsumerHoldsFindsTheRevisionThatCarriesIt() {
        ToolRevision birth = new ToolRevision("tool-1", 1, "a tool", "{}", AT);
        ToolRevision later = new ToolRevision("tool-1", 2, "a better tool", "{}", AT);
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(revisions.findByToolIdOrderByRevisionDesc("tool-1")).thenReturn(List.of(later, birth));

        String birthPin = service().contractSha256(birth);

        assertThat(service().atPin("tool-1", birthPin).getRevision()).isEqualTo(1);
    }

    @Test
    void aPinThisDeclarationNeverRecordedIs404UnderItsOwnName() {
        ToolRevision birth = new ToolRevision("tool-1", 1, "a tool", "{}", AT);
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(revisions.findByToolIdOrderByRevisionDesc("tool-1")).thenReturn(List.of(birth));

        assertThatThrownBy(() -> service().atPin("tool-1", "0".repeat(64)))
                .isInstanceOf(UnknownPin.class)
                .hasMessageContaining("no revision");
    }

    @Test
    void aMalformedPinIs400AndTheHistoryIsNeverScanned() {
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));

        assertThatThrownBy(() -> service().atPin("tool-1", "ABC"))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("64");
        verify(revisions, never()).findByToolIdOrderByRevisionDesc(any(String.class));
    }

    @Test
    void theIdIsSettledBeforeThePinIsJudged() {
        when(repository.findById("tool-missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().atPin("tool-missing", "nonsense"))
                .isInstanceOf(UnknownTool.class);
    }
    // ── v613: a keyset page is a position in a set, not a filter on it ──────────────────────────────
    @Test
    void theCursorAsksForWhatSortsAfterItAndTheTotalStaysTheWholeSet() {
        when(repository.searchCatalog(null, null, 0, 0, 0, 0, "m.tool", PageRequest.of(0, 20)))
                .thenReturn(List.of(row("tool-3", OWNER, "weather.lookup"), row("tool-4", OWNER, "z.tool")));
        when(repository.count()).thenReturn(4L);

        assertThat(service().catalog(null, null, null, null, "m.tool", 20, 0)).hasSize(2);
        assertThat(service().countOf(null, null, null, null)).isEqualTo(4L);
        // The plain derivation is never consulted when a cursor is present: the composed query carries it.
        verify(repository, never()).findAllByOrderByNameAsc(any());
    }

    @Test
    void aCursorAndANonZeroOffsetAreRefusedTogether() {
        assertThatThrownBy(() -> service().catalog(null, null, null, null, "m.tool", 20, 1))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("offset");
        verify(repository, never()).searchCatalog(any(), any(), anyInt(), anyInt(), anyInt(), anyInt(), any(), any());
    }

    @Test
    void aCursorThatIsNotANameIsRefused() {
        assertThatThrownBy(() -> service().catalog(null, null, null, null, "M.TOOL", 20, 0))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("not a tool name");
        assertThatThrownBy(() -> service().catalog(null, null, null, null, "a".repeat(65), 20, 0))
                .isInstanceOf(InvalidTool.class);
    }

    @Test
    void aBlankCursorIsTheAbsentOne() {
        when(repository.findAllByOrderByNameAsc(PageRequest.of(0, 20))).thenReturn(List.of());

        service().catalog(null, null, null, null, "   ", 20, 0);

        verify(repository, never()).searchCatalog(any(), any(), anyInt(), anyInt(), anyInt(), anyInt(), any(), any());
    }
    // ── v582/v589: the polarity filters, and the fact that they never change a row ────────────────────
    @Test
    void theDeprecatedFilterAsksTheDeprecatedPolarityAndTheCountFollows() {
        when(repository.searchCatalog(null, null, 1, 0, 0, 0, null, PageRequest.of(0, 20)))
                .thenReturn(List.of(row("tool-1", OWNER, "a.tool")));
        when(repository.countCatalog(null, null, 1, 0, 0, 0)).thenReturn(1L);

        assertThat(service().catalog(null, null, true, 20, 0)).hasSize(1);
        assertThat(service().countOf(null, null, true)).isEqualTo(1L);
        verify(repository, never()).findAllByOrderByNameAsc(any());
        verify(repository, never()).count();
    }

    @Test
    void theLiveFilterAsksTheOppositePolarity() {
        when(repository.searchCatalog(null, null, 0, 1, 0, 0, null, PageRequest.of(0, 20))).thenReturn(List.of());
        when(repository.countCatalog(null, null, 0, 1, 0, 0)).thenReturn(0L);

        service().catalog(null, null, false, 20, 0);

        assertThat(service().countOf(null, null, false)).isZero();
        // The opposite side is the SAME statement with the other flag set — never the deprecated polarity.
        verify(repository, never()).searchCatalog(any(), any(), eq(1), eq(0), anyInt(), anyInt(), any(), any());
    }

    @Test
    void theDeprecationFilterComposesWithOwnerAndSearch() {
        when(repository.searchCatalog("acct-ada", "%weather%", 1, 0, 0, 0, null, PageRequest.of(0, 20)))
                .thenReturn(List.of(row("tool-1", OWNER, "weather.lookup")));
        when(repository.countCatalog("acct-ada", "%weather%", 1, 0, 0, 0)).thenReturn(1L);

        assertThat(service().catalog("  acct-ada  ", "  weather  ", true, 20, 0)).hasSize(1);
        assertThat(service().countOf("acct-ada", "weather", true)).isEqualTo(1L);
        // The composed query is the ONE call: the unfiltered derivations are never consulted.
        verify(repository, never()).searchByOwner(any(), any(), any());
        verify(repository, never()).countSearchByOwner(any(), any());
    }

    @Test
    void anAbsentDeprecationFilterIsTheUnfilteredCatalog() {
        when(repository.findAllByOrderByNameAsc(PageRequest.of(0, 20))).thenReturn(List.of());
        when(repository.count()).thenReturn(0L);

        service().catalog(null, null, null, 20, 0);

        assertThat(service().countOf(null, null, null)).isZero();
        verify(repository, never()).searchCatalog(any(), any(), anyInt(), anyInt(), anyInt(), anyInt(), any(), any());
    }

    // ── v589: the tested filter names the CLAIM, and it composes with the other three ─────────────────
    @Test
    void theTestedFilterAsksForAnAttestationAndNarrowsTheCount() {
        when(repository.searchCatalog(null, null, 0, 0, 1, 0, null, PageRequest.of(0, 20)))
                .thenReturn(List.of(row("tool-1", OWNER, "a.tool")));
        when(repository.countCatalog(null, null, 0, 0, 1, 0)).thenReturn(1L);

        assertThat(service().catalog(null, null, null, true, 20, 0)).hasSize(1);
        assertThat(service().countOf(null, null, null, true)).isEqualTo(1L);
        verify(repository, never()).findAllByOrderByNameAsc(any());
    }

    @Test
    void theUntestedFilterAsksForTheAbsenceOfOne() {
        when(repository.searchCatalog(null, null, 0, 0, 0, 1, null, PageRequest.of(0, 20))).thenReturn(List.of());
        when(repository.countCatalog(null, null, 0, 0, 0, 1)).thenReturn(0L);

        service().catalog(null, null, null, false, 20, 0);

        assertThat(service().countOf(null, null, null, false)).isZero();
        verify(repository, never()).searchCatalog(any(), any(), anyInt(), anyInt(), eq(1), anyInt(), any(), any());
    }

    @Test
    void oneTestedAndOneLiveIsFourFlagsInONEStatement() {
        when(repository.searchCatalog("acct-ada", null, 0, 1, 1, 0, null, PageRequest.of(0, 20)))
                .thenReturn(List.of(row("tool-1", OWNER, "a.tool")));
        when(repository.countCatalog("acct-ada", null, 0, 1, 1, 0)).thenReturn(1L);

        assertThat(service().catalog("acct-ada", null, false, true, 20, 0)).hasSize(1);
        assertThat(service().countOf("acct-ada", null, false, true)).isEqualTo(1L);
        // Composed, not two passes: the plain owner derivation is never consulted.
        verify(repository, never()).findByOwnerOrderByNameAsc(any(), any());
    }

    @Test
    void anAbsentPairOfPolaritiesNeverReachesTheComposedQuery() {
        when(repository.findAllByOrderByNameAsc(PageRequest.of(0, 20))).thenReturn(List.of());
        when(repository.count()).thenReturn(0L);

        service().catalog(null, null, null, null, 20, 0);

        assertThat(service().countOf(null, null, null, null)).isZero();
        verify(repository, never()).searchCatalog(any(), any(), anyInt(), anyInt(), anyInt(), anyInt(), any(), any());
        verify(repository, never()).countCatalog(any(), any(), anyInt(), anyInt(), anyInt(), anyInt());
    }
    // ── v583: the journal — every accepted write, in one order, including the ones state cannot hold ───
    @Test
    void declaringAJournalsTheDeclaration() throws Exception {
        when(repository.findByName("weather.lookup")).thenReturn(Optional.empty());
        when(repository.save(any(ToolEntry.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ToolEntry stored = service().register(OWNER, "weather.lookup", "Looks up weather.", mapper.readTree("{}"));

        ArgumentCaptor<ToolChange> journal = ArgumentCaptor.forClass(ToolChange.class);
        verify(changes).save(journal.capture());
        ToolChange entry = journal.getValue();
        assertThat(entry.getToolId()).isEqualTo(stored.getToolId());
        assertThat(entry.getName()).isEqualTo("weather.lookup");
        assertThat(entry.getKind()).isEqualTo("declared");
        assertThat(entry.getRevision()).isEqualTo(1);
        assertThat(entry.getChangedAt()).isEqualTo(AT);
    }

    @Test
    void anUpdateJournalsTheRevisionItWrote() throws Exception {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(mine));
        when(revisions.findTopByToolIdOrderByRevisionDesc("tool-1"))
                .thenReturn(Optional.of(new ToolRevision("tool-1", 1, "a tool", "{}", AT)));
        when(repository.save(mine)).thenAnswer(invocation -> invocation.getArgument(0));

        service().update("tool-1", OWNER, "A better sentence.", mapper.readTree("{}"));

        ArgumentCaptor<ToolChange> journal = ArgumentCaptor.forClass(ToolChange.class);
        verify(changes).save(journal.capture());
        assertThat(journal.getValue().getKind()).isEqualTo("updated");
        assertThat(journal.getValue().getRevision()).isEqualTo(2);
    }

    @Test
    void aRemovalJournalsTheNameBeforeTheRowsGo() {
        ToolEntry mine = new ToolEntry("tool-1", OWNER, "a.tool", "a tool", "{}", AT);
        when(repository.findById("tool-1")).thenReturn(Optional.of(mine));

        assertThat(service().remove("tool-1", OWNER)).isTrue();

        ArgumentCaptor<ToolChange> journal = ArgumentCaptor.forClass(ToolChange.class);
        verify(changes).save(journal.capture());
        assertThat(journal.getValue().getKind()).isEqualTo("removed");
        assertThat(journal.getValue().getName()).isEqualTo("a.tool", "a removed tool must still be nameable");
        assertThat(journal.getValue().getRevision()).isNull();
        // The entry is written BEFORE the deletion: a deletion takes every row a later reader could ask.
        org.mockito.InOrder order = org.mockito.Mockito.inOrder(changes, repository);
        order.verify(changes).save(any(ToolChange.class));
        order.verify(repository).delete(mine);
    }

    @Test
    void aTransferJournalsTheHandover() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(mine));
        when(repository.save(mine)).thenAnswer(invocation -> invocation.getArgument(0));

        service().transfer("tool-1", OWNER, "acct-bob");

        ArgumentCaptor<ToolChange> journal = ArgumentCaptor.forClass(ToolChange.class);
        verify(changes).save(journal.capture());
        assertThat(journal.getValue().getKind()).isEqualTo("transferred");
        assertThat(journal.getValue().getName()).isEqualTo("a.tool");
    }

    @Test
    void aDeprecationAndItsWithdrawalAreBothJournalled() {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(mine));
        when(deprecations.findByToolId("tool-1")).thenReturn(Optional.empty())
                .thenReturn(Optional.of(new ToolDeprecation("tool-1", "Going.", "b.tool", AT)));

        service().deprecate("tool-1", OWNER, "Going.", "b.tool");
        service().undeprecate("tool-1", OWNER);

        ArgumentCaptor<ToolChange> journal = ArgumentCaptor.forClass(ToolChange.class);
        verify(changes, times(2)).save(journal.capture());
        assertThat(journal.getAllValues()).extracting(ToolChange::getKind)
                .containsExactly("deprecated", "undeprecated");
    }

    @Test
    void aWithdrawalThatRemovedNothingJournalsNothing() {
        when(repository.lockById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(deprecations.findByToolId("tool-1")).thenReturn(Optional.empty());

        assertThat(service().undeprecate("tool-1", OWNER)).isFalse();
        verify(changes, never()).save(any(ToolChange.class));
    }

    @Test
    void theJournalReadsForwardFromItsCursor() {
        ToolChange entry = new ToolChange(5L, "tool-1", "a.tool", "updated", 2, AT);
        when(changes.feed(4, null, null, PageRequest.of(0, 20))).thenReturn(List.of(entry));
        when(changes.feedCount(4, null, null)).thenReturn(1L);

        assertThat(service().journal(null, null, 4, 20, 0)).containsExactly(entry);
        assertThat(service().journalCount(null, null, 4)).isEqualTo(1L);
    }

    @Test
    void theJournalCanBeNarrowedToOneKind() {
        ToolChange entry = new ToolChange(9L, "tool-1", "a.tool", "removed", null, AT);
        when(changes.feed(0, "removed", null, PageRequest.of(0, 20))).thenReturn(List.of(entry));
        when(changes.feedCount(0, "removed", null)).thenReturn(1L);

        assertThat(service().journal("removed", null, 0, 20, 0)).containsExactly(entry);
        assertThat(service().journalCount("removed", null, 0)).isEqualTo(1L);
    }

    @Test
    void theJournalCanBeNarrowedToOneDeclaration() {
        ToolChange entry = new ToolChange(9L, "tool-1", "a.tool", "removed", null, AT);
        when(changes.feed(0, null, "tool-1", PageRequest.of(0, 20))).thenReturn(List.of(entry));
        when(changes.feedCount(0, null, "tool-1")).thenReturn(1L);

        assertThat(service().journal(null, "tool-1", 0, 20, 0)).containsExactly(entry);
        assertThat(service().journalCount(null, "tool-1", 0)).isEqualTo(1L);
    }

    @Test
    void aKindAndADeclarationNarrowTogether() {
        when(changes.feed(3, "deprecated", "tool-1", PageRequest.of(0, 20))).thenReturn(List.of());
        when(changes.feedCount(3, "deprecated", "tool-1")).thenReturn(0L);

        assertThat(service().journal(" deprecated ", " tool-1 ", 3, 20, 0)).isEmpty();
        assertThat(service().journalCount("deprecated", "tool-1", 3)).isZero();
    }

    @Test
    void aBlankKindAndABlankToolAreTheAbsentFilters() {
        when(changes.feed(0, null, null, PageRequest.of(0, 20))).thenReturn(List.of());

        assertThat(service().journal("   ", "", 0, 20, 0)).isEmpty();
        verify(changes).feed(0, null, null, PageRequest.of(0, 20));
    }

    @Test
    void anUnknownKindIsRefusedBeforeAnyQuery() {
        assertThatThrownBy(() -> service().journal("pruned", null, 0, 20, 0))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("declared, updated, transferred, deprecated, undeprecated, attested, unattested, removed");
        // The vocabulary is case-sensitive: a capitalised word is a typo, not a synonym.
        assertThatThrownBy(() -> service().journal("Removed", null, 0, 20, 0))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("Removed");
        verify(changes, never()).feed(any(Long.class), any(), any(), any());
        verify(changes, never()).feedCount(any(Long.class), any(), any());
    }

    @Test
    void aNegativeJournalCursorIsRefusedBeforeAnyQuery() {
        assertThatThrownBy(() -> service().journal(null, null, -1, 20, 0))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("0 or more");
        verify(changes, never()).feed(any(Long.class), any(), any(), any());
    }

    // ── v621: journal retention ───────────────────────────────────────────────────────────────────
    @Test
    void aPruneRemovesOnlyThePrefixBelowTheBound() {
        when(changes.newestSeq()).thenReturn(9L);
        when(changes.pruneBefore(7)).thenReturn(6);
        when(changes.oldestSeq()).thenReturn(7L);
        when(changes.count()).thenReturn(3L);

        assertThat(service().pruneJournal(7)).isEqualTo(new JournalPrune(7, 6, 7L, 3L));
        verify(changes).pruneBefore(7);
    }

    @Test
    void aPruneMayKeepOnlyTheNewestEntry() {
        when(changes.newestSeq()).thenReturn(9L);
        when(changes.pruneBefore(9)).thenReturn(8);
        when(changes.oldestSeq()).thenReturn(9L);
        when(changes.count()).thenReturn(1L);

        assertThat(service().pruneJournal(9).oldest()).isEqualTo(9L);
    }

    @Test
    void aPruneAboveTheNewestEntryIsRefusedByName() {
        when(changes.newestSeq()).thenReturn(9L);

        assertThatThrownBy(() -> service().pruneJournal(10))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("newest entry (9)")
                .hasMessageContaining("10");
        verify(changes, never()).pruneBefore(anyLong());
    }

    @Test
    void aPruneBelowOneIsRefusedByName() {
        assertThatThrownBy(() -> service().pruneJournal(0))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("1 or more");
        verify(changes, never()).pruneBefore(anyLong());
    }

    @Test
    void aPruneOnAnEmptyJournalRemovesNothingAndNamesNoBoundary() {
        when(changes.newestSeq()).thenReturn(null);
        when(changes.pruneBefore(5)).thenReturn(0);
        when(changes.oldestSeq()).thenReturn(null);
        when(changes.count()).thenReturn(0L);

        assertThat(service().pruneJournal(5)).isEqualTo(new JournalPrune(5, 0, null, 0L));
    }

    @Test
    void aCursorBelowTheRetainedBoundaryIsA410NamingTheOldestEntry() {
        when(changes.oldestSeq()).thenReturn(101L);

        assertThatThrownBy(() -> service().journal(null, null, 50, 20, 0))
                .isInstanceOf(JournalPruned.class)
                .hasMessageContaining("seq 101")
                .hasMessageContaining("cursor 50")
                .hasMessageContaining("resume at 100");
        assertThatThrownBy(() -> service().journalCount(null, null, 50))
                .isInstanceOf(JournalPruned.class);
        verify(changes, never()).feed(any(Long.class), any(), any(), any());
        verify(changes, never()).feedCount(any(Long.class), any(), any());
    }

    @Test
    void aCursorOneBelowTheRetainedBoundaryIsCaughtUp() {
        when(changes.oldestSeq()).thenReturn(101L);
        when(changes.feed(100, null, null, PageRequest.of(0, 20))).thenReturn(List.of());
        when(changes.feedCount(100, null, null)).thenReturn(0L);

        assertThat(service().journal(null, null, 100, 20, 0)).isEmpty();
        assertThat(service().journalCount(null, null, 100)).isZero();
    }

    @Test
    void anEmptyJournalHasNoBoundaryToBeBelow() {
        when(changes.oldestSeq()).thenReturn(null);
        when(changes.feed(0, null, null, PageRequest.of(0, 20))).thenReturn(List.of());

        assertThat(service().journal(null, null, 0, 20, 0)).isEmpty();
    }

    @Test
    void cursorZeroReadsTheRetainedPrefixRatherThanFailing() {
        when(changes.oldestSeq()).thenReturn(101L);
        when(changes.feed(0, null, null, PageRequest.of(0, 20))).thenReturn(List.of());

        assertThat(service().journal(null, null, 0, 20, 0)).isEmpty();
    }

    // ── v622: where a replacement chain ends ─────────────────────────────────────────────────────
    @Test
    void aChainEndsAtALiveDeclaration() {
        ToolEntry start = row("tool-1", OWNER, "a.tool");
        ToolEntry end = row("tool-2", OWNER, "b.tool");
        when(repository.findById("tool-1")).thenReturn(Optional.of(start));
        when(deprecations.findByToolId("tool-1"))
                .thenReturn(Optional.of(new ToolDeprecation("tool-1", "Going.", "b.tool", AT)));
        when(repository.findByName("b.tool")).thenReturn(Optional.of(end));
        when(deprecations.findByToolId("tool-2")).thenReturn(Optional.empty());

        ReplacementChain chain = service().replacementChain("tool-1");

        assertThat(chain.outcome()).isEqualTo("live");
        assertThat(chain.cycleTo()).isNull();
        assertThat(chain.steps()).containsExactly(
                new ReplacementChain.Step("tool-1", "a.tool", true, "b.tool", "live"),
                new ReplacementChain.Step("tool-2", "b.tool", false, null, null));
    }

    @Test
    void aChainEndsAtAWarningWithNoSuccessor() {
        ToolEntry start = row("tool-1", OWNER, "a.tool");
        when(repository.findById("tool-1")).thenReturn(Optional.of(start));
        when(deprecations.findByToolId("tool-1"))
                .thenReturn(Optional.of(new ToolDeprecation("tool-1", "Going.", null, AT)));

        ReplacementChain chain = service().replacementChain("tool-1");

        assertThat(chain.outcome()).isEqualTo("none");
        assertThat(chain.steps()).containsExactly(
                new ReplacementChain.Step("tool-1", "a.tool", true, null, "none"));
    }

    @Test
    void aChainEndsAtAHintNobodyDeclared() {
        ToolEntry start = row("tool-1", OWNER, "a.tool");
        when(repository.findById("tool-1")).thenReturn(Optional.of(start));
        when(deprecations.findByToolId("tool-1"))
                .thenReturn(Optional.of(new ToolDeprecation("tool-1", "Going.", "ghost.tool", AT)));
        when(repository.findByName("ghost.tool")).thenReturn(Optional.empty());

        ReplacementChain chain = service().replacementChain("tool-1");

        assertThat(chain.outcome()).isEqualTo("unresolved");
        assertThat(chain.steps()).containsExactly(
                new ReplacementChain.Step("tool-1", "a.tool", true, "ghost.tool", "unresolved"));
    }

    @Test
    void aChainThatLoopsNamesTheStepItRepeats() {
        ToolEntry a = row("tool-1", OWNER, "a.tool");
        ToolEntry b = row("tool-2", OWNER, "b.tool");
        when(repository.findById("tool-1")).thenReturn(Optional.of(a));
        when(deprecations.findByToolId("tool-1"))
                .thenReturn(Optional.of(new ToolDeprecation("tool-1", "Going.", "b.tool", AT)));
        when(repository.findByName("b.tool")).thenReturn(Optional.of(b));
        when(deprecations.findByToolId("tool-2"))
                .thenReturn(Optional.of(new ToolDeprecation("tool-2", "Back.", "a.tool", AT)));
        when(repository.findByName("a.tool")).thenReturn(Optional.of(a));

        ReplacementChain chain = service().replacementChain("tool-1");

        assertThat(chain.outcome()).isEqualTo("cycle");
        assertThat(chain.cycleTo()).isEqualTo("a.tool");
        assertThat(chain.steps()).extracting(ReplacementChain.Step::name).containsExactly("a.tool", "b.tool");
        assertThat(chain.steps().get(1).replacementStatus()).isEqualTo("deprecated");
    }

    @Test
    void aWarningThatNamesItselfIsACycleOfOne() {
        ToolEntry start = row("tool-1", OWNER, "a.tool");
        when(repository.findById("tool-1")).thenReturn(Optional.of(start));
        when(deprecations.findByToolId("tool-1"))
                .thenReturn(Optional.of(new ToolDeprecation("tool-1", "Going.", "a.tool", AT)));
        when(repository.findByName("a.tool")).thenReturn(Optional.of(start));

        ReplacementChain chain = service().replacementChain("tool-1");

        assertThat(chain.outcome()).isEqualTo("cycle");
        assertThat(chain.cycleTo()).isEqualTo("a.tool");
        assertThat(chain.steps()).hasSize(1);
    }

    @Test
    void aChainStopsAtTheDepthBoundAndSaysSo() {
        ToolEntry start = row("id-0", OWNER, "n.0");
        when(repository.findById("id-0")).thenReturn(Optional.of(start));
        for (int i = 0; i <= ToolService.MAX_REPLACEMENT_CHAIN; i++) {
            when(deprecations.findByToolId("id-" + i)).thenReturn(Optional.of(
                    new ToolDeprecation("id-" + i, "Going.", "n." + (i + 1), AT)));
            if (i < ToolService.MAX_REPLACEMENT_CHAIN) {
                when(repository.findByName("n." + (i + 1)))
                        .thenReturn(Optional.of(row("id-" + (i + 1), OWNER, "n." + (i + 1))));
            }
        }

        ReplacementChain chain = service().replacementChain("id-0");

        assertThat(chain.outcome()).isEqualTo("depth");
        assertThat(chain.steps()).hasSize(ToolService.MAX_REPLACEMENT_CHAIN);
        assertThat(chain.steps().get(ToolService.MAX_REPLACEMENT_CHAIN - 1).replacementStatus())
                .isEqualTo("deprecated");
    }

    @Test
    void aToolWithNoWarningHasNoChainToFollow() {
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(deprecations.findByToolId("tool-1")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().replacementChain("tool-1"))
                .isInstanceOf(UnknownDeprecation.class)
                .hasMessageContaining("no replacement to follow");
    }

    // ── v587: the batch read ───────────────────────────────────────────────────────────────────────
    @Test
    void batchIdsAreTrimmedDedupedAndKeptInFirstSeenOrder() {
        assertThat(ToolService.normalizeIds(List.of(" b ", "a", "b", "  ", "a", "c")))
                .containsExactly("b", "a", "c");
    }

    @Test
    void aBatchAnswersInTheOrderTheCallerNamed() {
        // The repository answers in its own order; the batch must not inherit it.
        when(repository.findAllById(List.of("b", "a")))
                .thenReturn(List.of(row("a", OWNER, "a.tool"), row("b", OWNER, "b.tool")));

        assertThat(service().batch(List.of("b", "a"))).extracting(ToolEntry::getToolId)
                .containsExactly("b", "a");
    }

    @Test
    void aBatchOmitsAnIdThatHoldsNothing() {
        when(repository.findAllById(List.of("a", "gone")))
                .thenReturn(List.of(row("a", OWNER, "a.tool")));

        assertThat(service().batch(List.of("a", "gone"))).extracting(ToolEntry::getToolId)
                .containsExactly("a");
    }

    @Test
    void aBatchWithNoIdIsRefusedBeforeAnyQuery() {
        assertThatThrownBy(() -> ToolService.normalizeIds(List.of()))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("at least one id");
        assertThatThrownBy(() -> ToolService.normalizeIds(List.of("  ", "")))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("at least one id");
        verify(repository, never()).findAllById(any());
    }

    @Test
    void aBatchOverTheBoundIsRefusedByName() {
        List<String> tooMany = java.util.stream.IntStream.range(0, ToolService.MAX_BATCH_IDS + 1)
                .mapToObj(i -> "tool-" + i)
                .toList();

        assertThatThrownBy(() -> ToolService.normalizeIds(tooMany))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("at most " + ToolService.MAX_BATCH_IDS);
        // The bound counts DISTINCT ids: a hundred copies of one id is still one id.
        assertThat(ToolService.normalizeIds(java.util.Collections.nCopies(100, "tool-1")))
                .containsExactly("tool-1");
    }

    // ── v588: the attestation — a claim about ONE contract, made by its owner ──────────────────────
    @Test
    void anAttestationRecordsThePinItTestedAndTheNote() {
        ToolEntry row = row("tool-1", OWNER, "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(row));
        when(attestations.findByToolId("tool-1")).thenReturn(Optional.empty());
        when(attestations.save(any(ToolAttestation.class))).thenAnswer(invocation -> invocation.getArgument(0));
        String pin = service().contractSha256(row);

        ToolAttestation claim = service().attest("tool-1", OWNER, pin, "  ran the example suite  ");

        assertThat(claim.getContractSha256()).isEqualTo(pin);
        assertThat(claim.getNote()).isEqualTo("ran the example suite");
        assertThat(claim.getAttestedAt()).isEqualTo(AT);
        ArgumentCaptor<ToolChange> journal = ArgumentCaptor.forClass(ToolChange.class);
        verify(changes).save(journal.capture());
        assertThat(journal.getValue().getKind()).isEqualTo("attested");
        assertThat(journal.getValue().getRevision()).isNull();
    }

    @Test
    void anAttestationForAContractThatIsNoLongerServedIsRefusedWithTheServedPin() {
        ToolEntry row = row("tool-1", OWNER, "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(row));
        String stale = "0".repeat(64);

        assertThatThrownBy(() -> service().attest("tool-1", OWNER, stale, null))
                .isInstanceOf(StaleContract.class)
                .hasMessageContaining(service().contractSha256(row))
                .hasMessageContaining(stale);
        verify(attestations, never()).save(any(ToolAttestation.class));
        verify(changes, never()).save(any(ToolChange.class));
    }

    @Test
    void aPinIsRequiredAndMustLookLikeOne() {
        assertThatThrownBy(() -> ToolService.requirePin("  "))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("must name the contract pin");
        assertThatThrownBy(() -> ToolService.requirePin("abc"))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("64 lowercase hex");
        // A pin is lowercase: an uppercased copy of a real pin is a different string, not the same pin.
        assertThatThrownBy(() -> ToolService.requirePin("a".repeat(64).toUpperCase()))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("lowercase");
    }

    @Test
    void reAttestingReplacesTheOneRowRatherThanAppending() {
        ToolEntry row = row("tool-1", OWNER, "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(row));
        String pin = service().contractSha256(row);
        ToolAttestation existing = new ToolAttestation("tool-1", pin, "older note", AT);
        when(attestations.findByToolId("tool-1")).thenReturn(Optional.of(existing));
        when(attestations.save(any(ToolAttestation.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service().attest("tool-1", OWNER, pin, "newer note");

        verify(attestations).delete(existing);
        verify(attestations).save(any(ToolAttestation.class));
    }

    @Test
    void anAttestationNoteIsBoundedAndBlankIsNoNote() {
        assertThat(ToolService.normalizeNote("   ")).isNull();
        assertThat(ToolService.normalizeNote("  a sentence  ")).isEqualTo("a sentence");
        assertThatThrownBy(() -> ToolService.normalizeNote("x".repeat(ToolService.MAX_NOTE_LENGTH + 1)))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("at most " + ToolService.MAX_NOTE_LENGTH);
    }

    @Test
    void aStrangerCannotAttestSomebodyElsesTool() {
        when(repository.lockById("tool-1")).thenReturn(Optional.of(row("tool-1", "acct-other", "a.tool")));

        assertThatThrownBy(() -> service().attest("tool-1", OWNER, "0".repeat(64), null))
                .isInstanceOf(NotYourTool.class);
        verify(attestations, never()).save(any(ToolAttestation.class));
    }

    @Test
    void withdrawingATestimonyThatIsNotThereAnswersFalseAndWritesNothing() {
        when(repository.lockById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(attestations.findByToolId("tool-1")).thenReturn(Optional.empty());

        assertThat(service().withdrawAttestation("tool-1", OWNER)).isFalse();
        verify(changes, never()).save(any(ToolChange.class));
    }

    @Test
    void withdrawingAnAttestationIsJournalledAsUnattested() {
        ToolEntry row = row("tool-1", OWNER, "a.tool");
        when(repository.lockById("tool-1")).thenReturn(Optional.of(row));
        when(attestations.findByToolId("tool-1"))
                .thenReturn(Optional.of(new ToolAttestation("tool-1", "0".repeat(64), null, AT)));

        assertThat(service().withdrawAttestation("tool-1", OWNER)).isTrue();
        ArgumentCaptor<ToolChange> journal = ArgumentCaptor.forClass(ToolChange.class);
        verify(changes).save(journal.capture());
        assertThat(journal.getValue().getKind()).isEqualTo("unattested");
        assertThat(journal.getValue().getRevision()).isNull();
    }

    @Test
    void readingAnAttestationNobodyMadeIsNotAttestedRatherThanUnknown() {
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(attestations.findByToolId("tool-1")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().attestationOf("tool-1"))
                .isInstanceOf(UnknownAttestation.class)
                .hasMessageContaining("no attestation");
    }

    // ── v614: a diff names WHERE two contracts differ, and the pins name WHAT they said ─────────────
    private static final String CITY_SCHEMA_V1 =
            "{\"type\":\"object\",\"properties\":{\"city\":{\"type\":\"string\"},\"note\":{\"type\":\"string\"}},\"required\":[\"city\"]}";
    private static final String CITY_SCHEMA_V2 =
            "{\"type\":\"object\",\"properties\":{\"city\":{\"type\":\"string\",\"maxLength\":40}},\"required\":[\"city\",\"note\"]}";

    @Test
    void aDiffNamesTheSchemaPathsAddedRemovedAndChanged() {
        ToolRevision birth = new ToolRevision("tool-1", 1, "a tool", CITY_SCHEMA_V1, AT);
        ToolRevision later = new ToolRevision("tool-1", 2, "a tool", CITY_SCHEMA_V2, AT);
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(revisions.findByToolIdOrderByRevisionDesc("tool-1")).thenReturn(List.of(later, birth));

        ToolService service = service();
        ContractComparison diff = service.diff("tool-1",
                service.contractSha256(birth), service.contractSha256(later));

        assertThat(diff.toolId()).isEqualTo("tool-1");
        assertThat(diff.from().revision()).isEqualTo(1);
        assertThat(diff.to().revision()).isEqualTo(2);
        assertThat(diff.identical()).isFalse();
        assertThat(diff.summaryChanged()).isFalse();
        assertThat(diff.schema().added())
                .containsExactly("/properties/city/maxLength", "/required/1");
        assertThat(diff.schema().removed()).containsExactly("/properties/note");
        assertThat(diff.schema().changed()).isEmpty();
    }

    @Test
    void aSummaryChangeIsNamedBesideAnEmptySchemaDiff() {
        ToolRevision birth = new ToolRevision("tool-1", 1, "a tool", "{\"type\":\"object\"}", AT);
        ToolRevision later = new ToolRevision("tool-1", 2, "a better tool", "{\"type\":\"object\"}", AT);
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(revisions.findByToolIdOrderByRevisionDesc("tool-1")).thenReturn(List.of(later, birth));

        ToolService service = service();
        ContractComparison diff = service.diff("tool-1",
                service.contractSha256(birth), service.contractSha256(later));

        assertThat(diff.summaryChanged()).isTrue();
        assertThat(diff.from().summary()).isEqualTo("a tool");
        assertThat(diff.to().summary()).isEqualTo("a better tool");
        assertThat(diff.schema().added()).isEmpty();
        assertThat(diff.schema().removed()).isEmpty();
        assertThat(diff.schema().changed()).isEmpty();
    }

    @Test
    void theSamePinOnBothEndsIsIdenticalAndWalksNothing() {
        ToolRevision birth = new ToolRevision("tool-1", 1, "a tool", CITY_SCHEMA_V1, AT);
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(revisions.findByToolIdOrderByRevisionDesc("tool-1")).thenReturn(List.of(birth));

        ToolService service = service();
        String pin = service.contractSha256(birth);
        ContractComparison diff = service.diff("tool-1", pin, pin);

        assertThat(diff.identical()).isTrue();
        assertThat(diff.summaryChanged()).isFalse();
        assertThat(diff.from().contractSha256()).isEqualTo(pin);
        assertThat(diff.to().contractSha256()).isEqualTo(pin);
        assertThat(diff.schema().added()).isEmpty();
        assertThat(diff.schema().removed()).isEmpty();
        assertThat(diff.schema().changed()).isEmpty();
    }

    @Test
    void aDiffMustNameThePinItStartsFrom() {
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));

        assertThatThrownBy(() -> service().diff("tool-1", null, null))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("starts from");
        assertThatThrownBy(() -> service().diff("tool-1", "  ", null))
                .isInstanceOf(InvalidTool.class);
        verify(revisions, never()).findByToolIdOrderByRevisionDesc(any());
    }

    @Test
    void aMalformedFromPinIsRefusedBeforeTheHistoryIsScanned() {
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));

        assertThatThrownBy(() -> service().diff("tool-1", "abc", null))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("64");
        verify(revisions, never()).findByToolIdOrderByRevisionDesc(any());
    }

    @Test
    void aPinTheHistoryNeverHeldIs404NamingTheEndThatNamedIt() {
        ToolRevision birth = new ToolRevision("tool-1", 1, "a tool", CITY_SCHEMA_V1, AT);
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(revisions.findByToolIdOrderByRevisionDesc("tool-1")).thenReturn(List.of(birth));

        assertThatThrownBy(() -> service().diff("tool-1", "0".repeat(64), null))
                .isInstanceOf(UnknownPin.class)
                .hasMessageContaining("from pin");
    }

    @Test
    void aPresentButBlankToPinIsRefusedRatherThanReadAsCurrent() {
        ToolRevision birth = new ToolRevision("tool-1", 1, "a tool", CITY_SCHEMA_V1, AT);
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(revisions.findByToolIdOrderByRevisionDesc("tool-1")).thenReturn(List.of(birth));

        ToolService service = service();
        String pin = service.contractSha256(birth);
        assertThatThrownBy(() -> service.diff("tool-1", pin, "   "))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("to");
    }

    @Test
    void anAbsentToPinComparesAgainstTheContractServedNow() {
        ToolRevision birth = new ToolRevision("tool-1", 1, "a tool", "{\"type\":\"object\"}", AT);
        ToolRevision later = new ToolRevision("tool-1", 2, "a better tool", "{\"type\":\"object\"}", AT);
        when(repository.findById("tool-1")).thenReturn(Optional.of(row("tool-1", OWNER, "a.tool")));
        when(revisions.findByToolIdOrderByRevisionDesc("tool-1")).thenReturn(List.of(later, birth));
        when(revisions.findTopByToolIdOrderByRevisionDesc("tool-1")).thenReturn(Optional.of(later));

        ToolService service = service();
        ContractComparison diff = service.diff("tool-1", service.contractSha256(birth), null);

        assertThat(diff.to().revision()).isEqualTo(2);
        assertThat(diff.to().contractSha256()).isEqualTo(service.contractSha256(later));
        assertThat(diff.to().summary()).isEqualTo("a better tool");
        assertThat(diff.identical()).isFalse();
    }

    @Test
    void theIdIsSettledBeforeEitherPinIsJudged() {
        when(repository.findById("tool-missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().diff("tool-missing", "nonsense", "also nonsense"))
                .isInstanceOf(UnknownTool.class);
    }

    // ── v615: a pin names CONTENT, so the global lookup answers every declaration that carries it ────
    private static ToolEntry declared(String id, String owner, String name, String summary) {
        return new ToolEntry(id, owner, name, summary, "{}", AT);
    }

    @Test
    void aPinIsContentSoEveryDeclarationThatCarriesItAnswers() {
        ToolRevision first = new ToolRevision("tool-1", 1, "shared sentence", "{}", AT);
        ToolRevision second = new ToolRevision("tool-2", 1, "shared sentence", "{}", AT);
        when(revisions.findAll()).thenReturn(List.of(second, first));
        when(repository.findAllById(any())).thenReturn(List.of(
                declared("tool-2", "acct-b", "b.tool", "shared sentence"),
                declared("tool-1", OWNER, "a.tool", "shared sentence")));

        ToolService service = service();
        PinLookup lookup = service.byPin(service.contractSha256(first));

        assertThat(lookup.pin()).isEqualTo(service.contractSha256(first));
        assertThat(lookup.matches()).extracting(PinLookup.Match::name)
                .containsExactly("a.tool", "b.tool");
        assertThat(lookup.matches()).allMatch(PinLookup.Match::current);
        assertThat(lookup.matches().get(0).revision()).isEqualTo(1);
        assertThat(lookup.matches().get(0).owner()).isEqualTo(OWNER);
    }

    @Test
    void theNewestRevisionCarryingThePinIsAnsweredAndCurrencyIsDerived() {
        ToolRevision sharedBirth = new ToolRevision("tool-1", 1, "shared sentence", "{}", AT);
        ToolRevision moved = new ToolRevision("tool-1", 2, "a later sentence", "{}", AT);
        ToolRevision otherBirth = new ToolRevision("tool-2", 1, "shared sentence", "{}", AT);
        when(revisions.findAll()).thenReturn(List.of(moved, sharedBirth, otherBirth));
        when(repository.findAllById(any())).thenReturn(List.of(
                declared("tool-1", OWNER, "a.tool", "a later sentence"),
                declared("tool-2", "acct-b", "b.tool", "shared sentence")));

        ToolService service = service();
        PinLookup lookup = service.byPin(service.contractSha256(sharedBirth));

        assertThat(lookup.matches()).hasSize(2);
        assertThat(lookup.matches()).extracting(PinLookup.Match::name)
                .containsExactly("a.tool", "b.tool");
        assertThat(lookup.matches().get(0).revision()).isEqualTo(1);
        assertThat(lookup.matches().get(0).current())
                .as("a.tool has moved away from these bytes")
                .isFalse();
        assertThat(lookup.matches().get(1).current()).isTrue();
    }

    @Test
    void movingAwayAndBackAnswersTheNewestRevisionOnce() {
        ToolRevision birth = new ToolRevision("tool-1", 1, "shared sentence", "{}", AT);
        ToolRevision moved = new ToolRevision("tool-1", 2, "a later sentence", "{}", AT);
        ToolRevision back = new ToolRevision("tool-1", 3, "shared sentence", "{}", AT);
        when(revisions.findAll()).thenReturn(List.of(back, moved, birth));
        when(repository.findAllById(any())).thenReturn(List.of(
                declared("tool-1", OWNER, "a.tool", "shared sentence")));

        ToolService service = service();
        PinLookup lookup = service.byPin(service.contractSha256(birth));

        assertThat(lookup.matches()).hasSize(1);
        assertThat(lookup.matches().get(0).revision()).isEqualTo(3);
        assertThat(lookup.matches().get(0).current()).isTrue();
    }

    @Test
    void aRevisionWhoseDeclarationIsGoneIsNotAnswered() {
        ToolRevision live = new ToolRevision("tool-1", 1, "shared sentence", "{}", AT);
        ToolRevision orphan = new ToolRevision("tool-gone", 1, "shared sentence", "{}", AT);
        when(revisions.findAll()).thenReturn(List.of(orphan, live));
        when(repository.findAllById(any())).thenReturn(List.of(
                declared("tool-1", OWNER, "a.tool", "shared sentence")));

        PinLookup lookup = service().byPin(service().contractSha256(live));

        assertThat(lookup.matches()).extracting(PinLookup.Match::toolId).containsExactly("tool-1");
    }

    @Test
    void aPinNobodyRecordedIs404UnderItsOwnName() {
        ToolRevision birth = new ToolRevision("tool-1", 1, "a sentence", "{}", AT);
        when(revisions.findAll()).thenReturn(List.of(birth));

        assertThatThrownBy(() -> service().byPin("0".repeat(64)))
                .isInstanceOf(UnknownPin.class)
                .hasMessageContaining("ever recorded");
    }

    @Test
    void aMalformedPinIsRefusedBeforeAnyRevisionIsRead() {
        assertThatThrownBy(() -> service().byPin("ABC"))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("64");
        verify(revisions, never()).findAll();
    }

    // ── v616: a manifest of pins is ONE scan and answers in the order it was asked ──────────────────
    @Test
    void aManifestOfPinsIsAnsweredFromOneScanInRequestOrder() {
        ToolRevision first = new ToolRevision("tool-1", 1, "sentence one", "{}", AT);
        ToolRevision second = new ToolRevision("tool-2", 1, "sentence two", "{}", AT);
        ToolRevision twin = new ToolRevision("tool-3", 1, "sentence two", "{}", AT);
        when(revisions.findAll()).thenReturn(List.of(twin, second, first));
        when(repository.findAllById(any())).thenReturn(List.of(
                declared("tool-1", OWNER, "a.tool", "sentence one"),
                declared("tool-2", OWNER, "b.tool", "sentence two"),
                declared("tool-3", OWNER, "c.tool", "sentence two")));

        ToolService service = service();
        String one = service.contractSha256(first);
        String two = service.contractSha256(second);
        String absent = "0".repeat(64);
        PinBatchLookup batch = service.byPins(List.of(one, two, absent));

        assertThat(batch.requested()).isEqualTo(3);
        assertThat(batch.found()).isEqualTo(2);
        assertThat(batch.missing()).containsExactly(absent);
        assertThat(batch.matches()).extracting(PinLookup.Match::name)
                .containsExactly("a.tool", "b.tool", "c.tool");
        assertThat(batch.matches()).extracting(PinLookup.Match::contractSha256)
                .containsExactly(one, two, two);
        verify(revisions, times(1)).findAll();
    }

    @Test
    void aRepeatedPinIsOneQuestionAndABlankIsNotAQuestion() {
        ToolRevision first = new ToolRevision("tool-1", 1, "sentence one", "{}", AT);
        when(revisions.findAll()).thenReturn(List.of(first));
        when(repository.findAllById(any())).thenReturn(List.of(
                declared("tool-1", OWNER, "a.tool", "sentence one")));

        ToolService service = service();
        String pin = service.contractSha256(first);
        PinBatchLookup batch = service.byPins(List.of("  " + pin + "  ", pin, "   "));

        assertThat(batch.requested()).isEqualTo(1);
        assertThat(batch.found()).isEqualTo(1);
        assertThat(batch.matches()).hasSize(1);
    }

    @Test
    void aManifestWithNoPinIsRefusedBeforeTheScan() {
        assertThatThrownBy(() -> service().byPins(null))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("at least one pin");
        assertThatThrownBy(() -> service().byPins(List.of()))
                .isInstanceOf(InvalidTool.class);
        assertThatThrownBy(() -> service().byPins(List.of("  ", " ")))
                .isInstanceOf(InvalidTool.class);
        verify(revisions, never()).findAll();
    }

    @Test
    void aMalformedPinInAManifestIsRefusedBeforeTheScan() {
        assertThatThrownBy(() -> service().byPins(List.of("0".repeat(64), "ABC")))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("64");
        verify(revisions, never()).findAll();
    }

    @Test
    void aManifestOverTheCapIsRefusedByName() {
        List<String> many = java.util.stream.IntStream.range(0, 51)
                .mapToObj(i -> String.format("%064x", i))
                .toList();

        assertThatThrownBy(() -> service().byPins(many))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("50")
                .hasMessageContaining("51");
        verify(revisions, never()).findAll();
    }

    @Test
    void aStalePinInAManifestResolvesWithCurrencyDerived() {
        ToolRevision birth = new ToolRevision("tool-1", 1, "shared sentence", "{}", AT);
        ToolRevision moved = new ToolRevision("tool-1", 2, "a later sentence", "{}", AT);
        when(revisions.findAll()).thenReturn(List.of(moved, birth));
        when(repository.findAllById(any())).thenReturn(List.of(
                declared("tool-1", OWNER, "a.tool", "a later sentence")));

        ToolService service = service();
        PinBatchLookup batch = service.byPins(List.of(service.contractSha256(birth)));

        assertThat(batch.found()).isEqualTo(1);
        assertThat(batch.matches()).hasSize(1);
        assertThat(batch.matches().get(0).revision()).isEqualTo(1);
        assertThat(batch.matches().get(0).current()).isFalse();
    }
}
