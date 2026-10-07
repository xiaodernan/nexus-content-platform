package dev.nexus.api.publish;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;

/**
 * The four rules {@link PublishService} owns, and the one behaviour that is not a rule: re-publishing
 * UPDATES rather than creating a second row.
 *
 * <p>No Spring context and no database here on purpose. These cases are about what the service decides; the
 * proof (`docs/evidence/m7/publish-proof.mjs`) is what runs the real jar against a real PostgreSQL and
 * reads the row back. A test that needed a database to check "a blank title is refused" would be slow and
 * would prove less.
 *
 * <p>The clock is PINNED, so the instant a publication records is asserted rather than read back and
 * compared to itself.
 */
@ExtendWith(MockitoExtension.class)
class PublishServiceTest {

    private static final Instant PUBLISHED_AT = Instant.parse("2026-10-07T12:00:00Z");
    private static final String VALID_DOCUMENT = "{\"pages\":[{\"id\":\"p1\"}],\"version\":3}";

    @Mock
    private PublishedProjectRepository repository;

    private PublishService service;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(PUBLISHED_AT, ZoneOffset.UTC);
        service = new PublishService(repository, new ObjectMapper(), clock);
    }

    // ── rule 4: create once, then update ────────────────────────────────────────────────────────────

    @Test
    void publishingAnUnpublishedIdCreatesVersionOne() {
        when(repository.findById("doc-1")).thenReturn(Optional.empty());
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        PublishedProject saved = service.publish("doc-1", "Harbour at dusk", VALID_DOCUMENT);

        assertThat(saved.getProjectId()).isEqualTo("doc-1");
        assertThat(saved.getVersion()).isEqualTo(1);
        assertThat(saved.getPublishedAt()).isEqualTo(PUBLISHED_AT);
        assertThat(saved.getDocumentJson()).isEqualTo(VALID_DOCUMENT);
    }

    @Test
    void republishingUpdatesTheSameRowAndIncrementsTheVersion() {
        PublishedProject existing = new PublishedProject("doc-1", "First", VALID_DOCUMENT, 1, PUBLISHED_AT.minusSeconds(60));
        when(repository.findById("doc-1")).thenReturn(Optional.of(existing));
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        PublishedProject saved = service.publish("doc-1", "Second", "{\"pages\":[]}");

        // The SAME object, so the row identity never moved; only its contents did.
        assertThat(saved).isSameAs(existing);
        assertThat(saved.getVersion()).isEqualTo(2);
        assertThat(saved.getTitle()).isEqualTo("Second");
        assertThat(saved.getPublishedAt()).isEqualTo(PUBLISHED_AT);
    }

    @Test
    void theTitleIsTrimmedButTheDocumentIsStoredVerbatim() {
        when(repository.findById("doc-1")).thenReturn(Optional.empty());
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));
        String spacedDocument = "{ \"pages\" : [ ] }";

        PublishedProject saved = service.publish("doc-1", "  Harbour at dusk  ", spacedDocument);

        assertThat(saved.getTitle()).isEqualTo("Harbour at dusk");
        // Byte-for-byte: this service is a record, not a formatter.
        assertThat(saved.getDocumentJson()).isEqualTo(spacedDocument);
    }

    // ── rule 1: a project id must be usable ─────────────────────────────────────────────────────────

    @Test
    void aBlankProjectIdIsRefused() {
        assertThatThrownBy(() -> service.publish("  ", "t", VALID_DOCUMENT))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("project id must not be blank");
        verify(repository, never()).save(any());
    }

    @Test
    void anOverlongProjectIdIsRefusedWithBothNumbers() {
        String tooLong = "x".repeat(PublishService.MAX_PROJECT_ID_LENGTH + 1);

        assertThatThrownBy(() -> service.publish(tooLong, "t", VALID_DOCUMENT))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("at most " + PublishService.MAX_PROJECT_ID_LENGTH)
                .hasMessageContaining("got " + tooLong.length());
        verify(repository, never()).save(any());
    }

    @Test
    void aProjectIdWithAControlCharacterIsRefused() {
        assertThatThrownBy(() -> service.publish("doc\u00001", "t", VALID_DOCUMENT))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("control characters");
        verify(repository, never()).save(any());
    }

    // ── rule 2: a publication needs a title the caller chose ─────────────────────────────────────────

    @Test
    void aBlankTitleIsRefused() {
        assertThatThrownBy(() -> service.publish("doc-1", "   ", VALID_DOCUMENT))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("title must not be blank");
        verify(repository, never()).save(any());
    }

    @Test
    void aMissingTitleIsRefused() {
        assertThatThrownBy(() -> service.publish("doc-1", null, VALID_DOCUMENT))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("title must not be blank");
    }

    // ── rule 3: the document must be a JSON OBJECT ───────────────────────────────────────────────────

    @Test
    void malformedJsonIsRefusedAndTheParsersOwnMessageIsKept() {
        assertThatThrownBy(() -> service.publish("doc-1", "t", "{\"pages\":"))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("document must be valid JSON");
        verify(repository, never()).save(any());
    }

    @Test
    void validJsonThatIsNotAnObjectIsRefusedAndNamedByItsOwnType() {
        // `42` parses. It is still not a design document, and the refusal says WHICH shape arrived.
        assertThatThrownBy(() -> service.publish("doc-1", "t", "42"))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("must be a JSON object")
                .hasMessageContaining("number");

        assertThatThrownBy(() -> service.publish("doc-1", "t", "[1,2]"))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("array");

        assertThatThrownBy(() -> service.publish("doc-1", "t", "\"a string\""))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("string");
    }

    @Test
    void aBlankDocumentIsRefused() {
        assertThatThrownBy(() -> service.publish("doc-1", "t", "   "))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("document must not be blank");
    }

    @Test
    void anEmptyJsonObjectIsAccepted() {
        // `{}` IS an object. Refusing it would be the service inventing a minimum document size.
        when(repository.findById("doc-1")).thenReturn(Optional.empty());
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        assertThat(service.publish("doc-1", "t", "{}").getDocumentJson()).isEqualTo("{}");
    }

    // ── reading ─────────────────────────────────────────────────────────────────────────────────────

    @Test
    void readingAnUnpublishedIdAnswersEmptyRatherThanInventingARow() {
        when(repository.findById("nobody")).thenReturn(Optional.empty());
        assertThat(service.find("nobody")).isEmpty();
    }

    // ── the instant a publication records is the one that was STORED ────────────────────────────────

    @Test
    void theRecordedInstantIsTruncatedToMicrosecondsBecauseThatIsWhatPostgresStores() {
        // Found by the M7 proof, not by reading: `Clock.instant()` on this JDK carries NANOSECONDS, so the
        // receipt reported `…01.824829200Z` while the row read back as `…01.824829Z` — a receipt claiming six
        // digits of precision the database had already dropped. A publication's instant is what was
        // RECORDED, so it is truncated before it is stored.
        Instant nanosecondPrecise = Instant.parse("2026-10-07T15:19:01.824829200Z");
        PublishService nanoService = new PublishService(repository, new ObjectMapper(), Clock.fixed(nanosecondPrecise, ZoneOffset.UTC));
        when(repository.findById("doc-1")).thenReturn(Optional.empty());
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        PublishedProject saved = nanoService.publish("doc-1", "t", VALID_DOCUMENT);

        assertThat(saved.getPublishedAt()).isEqualTo(Instant.parse("2026-10-07T15:19:01.824829Z"));
        // And the truncated value is the one a PostgreSQL round-trip returns unchanged.
        assertThat(saved.getPublishedAt().getNano() % 1000).isZero();
    }

    // ── v195: listing ────────────────────────────────────────────────────────────────────────────────

    @Test
    void listingAsksTheRepositoryForTheDefaultCapWhenNothingIsNamed() {
        when(repository.findAllByOrderByPublishedAtDesc(any(PageRequest.class))).thenReturn(List.of());

        service.list(PublishService.DEFAULT_LIST_LIMIT);

        ArgumentCaptor<PageRequest> asked = ArgumentCaptor.forClass(PageRequest.class);
        verify(repository).findAllByOrderByPublishedAtDesc(asked.capture());
        assertThat(asked.getValue().getPageSize()).isEqualTo(PublishService.DEFAULT_LIST_LIMIT);
        assertThat(asked.getValue().getPageNumber()).isZero();
    }

    @Test
    void aLimitAboveTheCapIsCLAMPEDRatherThanRefused() {
        // "As many as you will give me" is a legitimate thing to mean, so 10 000 gets the cap instead of a
        // 400 that would make the caller guess the number.
        when(repository.findAllByOrderByPublishedAtDesc(any(PageRequest.class))).thenReturn(List.of());

        service.list(10_000);

        ArgumentCaptor<PageRequest> asked = ArgumentCaptor.forClass(PageRequest.class);
        verify(repository).findAllByOrderByPublishedAtDesc(asked.capture());
        assertThat(asked.getValue().getPageSize()).isEqualTo(PublishService.MAX_LIST_LIMIT);
    }

    @Test
    void aNonPositiveLimitIsRefusedBecauseThereIsNoHonestReadingOfIt() {
        assertThatThrownBy(() -> service.list(0))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("limit must be a positive number, got 0");
        assertThatThrownBy(() -> service.list(-5))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("got -5");
        verify(repository, never()).findAllByOrderByPublishedAtDesc(any());
    }

    @Test
    void listingReturnsWhatTheRepositoryHeldInTheOrderItGaveThem() {
        PublishedProject newer = new PublishedProject("doc-b", "Newer", "{}", 1, PUBLISHED_AT);
        PublishedProject older = new PublishedProject("doc-a", "Older", "{}", 1, PUBLISHED_AT.minusSeconds(60));
        when(repository.findAllByOrderByPublishedAtDesc(any(PageRequest.class))).thenReturn(List.of(newer, older));

        assertThat(service.list(10)).containsExactly(newer, older);
    }

    // ── v195: unpublish ──────────────────────────────────────────────────────────────────────────────

    @Test
    void unpublishingARowThatExistsDeletesItAndAnswersTrue() {
        when(repository.existsById("doc-1")).thenReturn(true);

        assertThat(service.unpublish("doc-1")).isTrue();

        verify(repository).deleteById("doc-1");
    }

    @Test
    void unpublishingSomethingAlreadyDownAnswersFalseRatherThanThrowing() {
        // Taking down what is already down is a caller's mistake, not a corrupt store — the same rule the
        // Studio's own disk lane uses for a delete of a name that is not there.
        when(repository.existsById("gone")).thenReturn(false);

        assertThat(service.unpublish("gone")).isFalse();

        verify(repository, never()).deleteById(any());
    }

    @Test
    void unpublishingAnUnusableIdIsRefusedBeforeTheRepositoryIsAsked() {
        assertThatThrownBy(() -> service.unpublish("  "))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("project id must not be blank");
        verify(repository, never()).existsById(any());
    }
}
