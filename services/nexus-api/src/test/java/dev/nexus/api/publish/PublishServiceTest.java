package dev.nexus.api.publish;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.nexus.api.publish.PublishDtos.OwnerClaim;
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

    /** v271 — the AUDIT TRAIL the service writes into. A mock, because these cases grade the publication
     *  rules; the trail's own rules are graded in {@code AuditServiceTest}. */
    @Mock
    private dev.nexus.api.ops.AuditService audit;

    private PublishService service;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(PUBLISHED_AT, ZoneOffset.UTC);
        service = new PublishService(repository, new ObjectMapper(), clock, audit);
    }

    // ── rule 4: create once, then update ────────────────────────────────────────────────────────────

    @Test
    void publishingAnUnpublishedIdCreatesVersionOne() {
        when(repository.findById("doc-1")).thenReturn(Optional.empty());
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        PublishedProject saved = service.publish("doc-1", "Harbour at dusk", VALID_DOCUMENT, null);

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

        PublishedProject saved = service.publish("doc-1", "Second", "{\"pages\":[]}", null);

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

        PublishedProject saved = service.publish("doc-1", "  Harbour at dusk  ", spacedDocument, null);

        assertThat(saved.getTitle()).isEqualTo("Harbour at dusk");
        // Byte-for-byte: this service is a record, not a formatter.
        assertThat(saved.getDocumentJson()).isEqualTo(spacedDocument);
    }

    // ── rule 1: a project id must be usable ─────────────────────────────────────────────────────────

    @Test
    void aBlankProjectIdIsRefused() {
        assertThatThrownBy(() -> service.publish("  ", "t", VALID_DOCUMENT, null))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("project id must not be blank");
        verify(repository, never()).save(any());
    }

    @Test
    void anOverlongProjectIdIsRefusedWithBothNumbers() {
        String tooLong = "x".repeat(PublishService.MAX_PROJECT_ID_LENGTH + 1);

        assertThatThrownBy(() -> service.publish(tooLong, "t", VALID_DOCUMENT, null))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("at most " + PublishService.MAX_PROJECT_ID_LENGTH)
                .hasMessageContaining("got " + tooLong.length());
        verify(repository, never()).save(any());
    }

    @Test
    void aProjectIdWithAControlCharacterIsRefused() {
        assertThatThrownBy(() -> service.publish("doc\u00001", "t", VALID_DOCUMENT, null))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("control characters");
        verify(repository, never()).save(any());
    }

    // ── rule 2: a publication needs a title the caller chose ─────────────────────────────────────────

    @Test
    void aBlankTitleIsRefused() {
        assertThatThrownBy(() -> service.publish("doc-1", "   ", VALID_DOCUMENT, null))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("title must not be blank");
        verify(repository, never()).save(any());
    }

    @Test
    void aMissingTitleIsRefused() {
        assertThatThrownBy(() -> service.publish("doc-1", null, VALID_DOCUMENT, null))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("title must not be blank");
    }

    // ── rule 3: the document must be a JSON OBJECT ───────────────────────────────────────────────────

    @Test
    void malformedJsonIsRefusedAndTheParsersOwnMessageIsKept() {
        assertThatThrownBy(() -> service.publish("doc-1", "t", "{\"pages\":", null))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("document must be valid JSON");
        verify(repository, never()).save(any());
    }

    @Test
    void validJsonThatIsNotAnObjectIsRefusedAndNamedByItsOwnType() {
        // `42` parses. It is still not a design document, and the refusal says WHICH shape arrived.
        assertThatThrownBy(() -> service.publish("doc-1", "t", "42", null))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("must be a JSON object")
                .hasMessageContaining("number");

        assertThatThrownBy(() -> service.publish("doc-1", "t", "[1,2]", null))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("array");

        assertThatThrownBy(() -> service.publish("doc-1", "t", "\"a string\"", null))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("string");
    }

    @Test
    void aBlankDocumentIsRefused() {
        assertThatThrownBy(() -> service.publish("doc-1", "t", "   ", null))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("document must not be blank");
    }

    @Test
    void anEmptyJsonObjectIsAccepted() {
        // `{}` IS an object. Refusing it would be the service inventing a minimum document size.
        when(repository.findById("doc-1")).thenReturn(Optional.empty());
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        assertThat(service.publish("doc-1", "t", "{}", null).getDocumentJson()).isEqualTo("{}");
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
        PublishService nanoService = new PublishService(repository, new ObjectMapper(), Clock.fixed(nanosecondPrecise, ZoneOffset.UTC), audit);
        when(repository.findById("doc-1")).thenReturn(Optional.empty());
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        PublishedProject saved = nanoService.publish("doc-1", "t", VALID_DOCUMENT, null);

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

    // === v270: the PROFILE half — the listing narrowed to one OWNER ===

    /**
     * v270 — a profile is "what has this account published", and the service is the only party that can answer
     * it: the owner is a COLUMN on the row, and the client holds no index of what anybody published.
     */
    @Test
    void theListingCanBeNarrowedToOneOwner() {
        when(repository.findByOwnerAccountIdOrderByPublishedAtDesc(eq("acct-ada"), any(PageRequest.class)))
                .thenReturn(List.of(new PublishedProject("doc-a", "Ada's", "{}", 1, PUBLISHED_AT)));

        List<PublishedProject> rows = service.list(10, "acct-ada");

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getProjectId()).isEqualTo("doc-a");
        verify(repository, never()).findAllByOrderByPublishedAtDesc(any(PageRequest.class));
    }

    @Test
    void aBlankOwnerIsNOTAnOwnerItIsTheAbsenceOfOneAndAnswersAnEmptyList() {
        // "the publications of nobody" is not the whole table. That distinction is the difference between a
        // profile and a leak, so it is pinned rather than left to the caller.
        assertThat(service.list(10, "   ")).isEmpty();
        assertThat(service.list(10, "")).isEmpty();
        verify(repository, never()).findAllByOrderByPublishedAtDesc(any(PageRequest.class));
        verify(repository, never()).findByOwnerAccountIdOrderByPublishedAtDesc(any(String.class), any(PageRequest.class));
    }

    @Test
    void theOwnerIsTRIMMEDBeforeItIsAskedFor() {
        when(repository.findByOwnerAccountIdOrderByPublishedAtDesc(any(String.class), any(PageRequest.class)))
                .thenReturn(List.of());

        service.list(10, "  acct-ada  ");

        verify(repository).findByOwnerAccountIdOrderByPublishedAtDesc(eq("acct-ada"), any(PageRequest.class));
    }

    @Test
    void theOwnerNarrowingKeepsTheSameLimitRules() {
        assertThatThrownBy(() -> service.list(0, "acct-ada"), null)
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("limit must be a positive number");

        when(repository.findByOwnerAccountIdOrderByPublishedAtDesc(any(String.class), any(PageRequest.class)))
                .thenReturn(List.of());
        service.list(10_000, "acct-ada");
        ArgumentCaptor<PageRequest> asked = ArgumentCaptor.forClass(PageRequest.class);
        verify(repository).findByOwnerAccountIdOrderByPublishedAtDesc(any(String.class), asked.capture());
        assertThat(asked.getValue().getPageSize()).isEqualTo(PublishService.MAX_LIST_LIMIT);
    }

    @Test
    void unpublishingARowThatExistsDeletesItAndAnswersTrue() {
        // v242: `unpublish` reads the ROW now rather than asking whether it exists, because the owner rule
        // needs the row's own answer about who owns it.
        when(repository.findById("doc-1")).thenReturn(Optional.of(new PublishedProject("doc-1", "T", VALID_DOCUMENT, 1, PUBLISHED_AT)));

        assertThat(service.unpublish("doc-1", "acct-self")).isTrue();

        verify(repository).deleteById("doc-1");
    }

    @Test
    void unpublishingSomethingAlreadyDownAnswersFalseRatherThanThrowing() {
        // Taking down what is already down is a caller's mistake, not a corrupt store — the same rule the
        // Studio's own disk lane uses for a delete of a name that is not there.
        when(repository.findById("gone")).thenReturn(Optional.empty());

        assertThat(service.unpublish("gone", "acct-self")).isFalse();

        verify(repository, never()).deleteById(any());
    }

    @Test
    void unpublishingAnUnusableIdIsRefusedBeforeTheRepositoryIsAsked() {
        assertThatThrownBy(() -> service.unpublish("  ", "acct-self"))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("project id must not be blank");
        verify(repository, never()).findById(any());
    }
    // === M7 v242: the OWNER CLAIM (ADR 0018) ===

    private static final long CLAIMED_AT_MS = Instant.parse("2026-10-07T11:59:00Z").toEpochMilli();
    /** The same claim in the CLIENT's unit — milliseconds since the epoch, which is what the wire carries. */
    private static final Instant CLAIMED_AT = Instant.ofEpochMilli(CLAIMED_AT_MS);

    private static OwnerClaim claim(String accountId) {
        return claim(accountId, "ada");
    }

    private static OwnerClaim claim(String accountId, String handle) {
        return new OwnerClaim(accountId, handle, "unsigned-local", CLAIMED_AT_MS);
    }

    @Test
    void aPublishWithAClaimRecordsTheClaimOnTheRow() {
        when(repository.findById("doc-1")).thenReturn(Optional.empty());
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        PublishedProject saved = service.publish("doc-1", "Harbour at dusk", VALID_DOCUMENT, claim("acct-ada"));

        assertThat(saved.hasOwner()).isTrue();
        assertThat(saved.getOwnerAccountId()).isEqualTo("acct-ada");
        assertThat(saved.getOwnerHandle()).isEqualTo("ada");
        assertThat(saved.getOwnerAssurance()).isEqualTo("unsigned-local");
        // The claim carries the AUTHOR's instant, not the publish instant: they are different facts.
        assertThat(saved.getOwnerClaimedAt()).isEqualTo(CLAIMED_AT);
        assertThat(saved.getPublishedAt()).isEqualTo(PUBLISHED_AT);
    }

    @Test
    void aPublishWithNoClaimRecordsNoOwnerAndThatIsNotAnError() {
        when(repository.findById("doc-1")).thenReturn(Optional.empty());
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        PublishedProject saved = service.publish("doc-1", "Harbour at dusk", VALID_DOCUMENT, null);

        assertThat(saved.hasOwner()).isFalse();
        assertThat(saved.getOwnerAccountId()).isNull();
    }

    @Test
    void republishingUnderTheSameAccountKeepsTheOwnerAndBumpsTheVersion() {
        PublishedProject existing = new PublishedProject("doc-1", "First", VALID_DOCUMENT, 1, PUBLISHED_AT.minusSeconds(60));
        existing.claimOwner("acct-ada", "ada", "unsigned-local", CLAIMED_AT);
        when(repository.findById("doc-1")).thenReturn(Optional.of(existing));
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        PublishedProject saved = service.publish("doc-1", "Second", VALID_DOCUMENT, claim("acct-ada"));

        assertThat(saved.getVersion()).isEqualTo(2);
        assertThat(saved.getOwnerAccountId()).isEqualTo("acct-ada");
    }

    @Test
    void aRePublishUnderADifferentAccountIsRefusedAndTheRowIsNotSaved() {
        PublishedProject existing = new PublishedProject("doc-1", "First", VALID_DOCUMENT, 1, PUBLISHED_AT.minusSeconds(60));
        existing.claimOwner("acct-ada", "ada", "unsigned-local", CLAIMED_AT);
        when(repository.findById("doc-1")).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> service.publish("doc-1", "Takeover", VALID_DOCUMENT, claim("acct-mallory")))
                .isInstanceOf(OwnerTaken.class)
                .hasMessageContaining("acct-ada")
                .hasMessageContaining("acct-mallory");
        verify(repository, never()).save(any(PublishedProject.class));
    }

    @Test
    void aRePublishThatNamesNobodyKeepsTheOwnerTheRowAlreadyHas() {
        PublishedProject existing = new PublishedProject("doc-1", "First", VALID_DOCUMENT, 1, PUBLISHED_AT.minusSeconds(60));
        existing.claimOwner("acct-ada", "ada", "unsigned-local", CLAIMED_AT);
        when(repository.findById("doc-1")).thenReturn(Optional.of(existing));
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        // A client that stopped naming its author must not silently ORPHAN a publication.
        PublishedProject saved = service.publish("doc-1", "Second", VALID_DOCUMENT, null);

        assertThat(saved.getOwnerAccountId()).isEqualTo("acct-ada");
        assertThat(saved.getVersion()).isEqualTo(2);
    }


    @Test
    void theOwnerMayUnpublish() {
        PublishedProject existing = new PublishedProject("doc-1", "First", VALID_DOCUMENT, 1, PUBLISHED_AT);
        existing.claimOwner("acct-ada", "ada", "unsigned-local", CLAIMED_AT);
        when(repository.findById("doc-1")).thenReturn(Optional.of(existing));

        assertThat(service.unpublish("doc-1", "acct-ada")).isTrue();
        verify(repository).deleteById("doc-1");
    }

    @Test
    void aStrangerMayNotUnpublishAnOwnedPublicationAndNothingIsDeleted() {
        PublishedProject existing = new PublishedProject("doc-1", "First", VALID_DOCUMENT, 1, PUBLISHED_AT);
        existing.claimOwner("acct-ada", "ada", "unsigned-local", CLAIMED_AT);
        when(repository.findById("doc-1")).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> service.unpublish("doc-1", "acct-mallory"))
                .isInstanceOf(NotTheOwner.class)
                .hasMessageContaining("acct-ada");
        verify(repository, never()).deleteById(any());
    }

    @Test
    void aCallerWhoNamesNobodyMayNotUnpublishAnOwnedPublication() {
        PublishedProject existing = new PublishedProject("doc-1", "First", VALID_DOCUMENT, 1, PUBLISHED_AT);
        existing.claimOwner("acct-ada", "ada", "unsigned-local", CLAIMED_AT);
        when(repository.findById("doc-1")).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> service.unpublish("doc-1", null)).isInstanceOf(NotTheOwner.class);
        verify(repository, never()).deleteById(any());
    }

    @Test
    void anOwnerlessPublicationMayBeUnpublishedByAnyoneIncludingNobody() {
        PublishedProject anonymous = new PublishedProject("doc-1", "First", VALID_DOCUMENT, 1, PUBLISHED_AT);
        when(repository.findById("doc-1")).thenReturn(Optional.of(anonymous));

        // The pre-v242 rule, kept on purpose: locking an anonymous publication to nobody would make
        // every publication ever written unpublishable by anybody.
        assertThat(service.unpublish("doc-1", null)).isTrue();
        assertThat(service.unpublish("doc-1", "acct-anyone")).isTrue();
        verify(repository, times(2)).deleteById("doc-1");
    }

    @Test
    void anUnpublishOfAPublicationThatDoesNotExistStillAnswersFalse() {
        when(repository.findById("doc-1")).thenReturn(Optional.empty());

        assertThat(service.unpublish("doc-1", "acct-ada")).isFalse();
        verify(repository, never()).deleteById(any());
    }

    @Test
    void aMalformedClaimIsRefusedByNameRatherThanRecordedHalf() {
        when(repository.findById("doc-1")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.publish("doc-1", "T", VALID_DOCUMENT, new OwnerClaim("", "ada", "unsigned-local", CLAIMED_AT_MS)), null)
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("must name an account id");
        assertThatThrownBy(() -> service.publish("doc-1", "T", VALID_DOCUMENT, new OwnerClaim("acct-ada", "  ", "unsigned-local", CLAIMED_AT_MS)), null)
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("must name a handle");
        assertThatThrownBy(() -> service.publish("doc-1", "T", VALID_DOCUMENT, new OwnerClaim("acct-ada", "ada", "unsigned-local", null)))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("must name when it was made");
        assertThatThrownBy(() -> service.publish("doc-1", "T", VALID_DOCUMENT, new OwnerClaim("acct-ada", "a".repeat(25), "unsigned-local", CLAIMED_AT_MS)), null)
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("at most 24");
        verify(repository, never()).save(any(PublishedProject.class));
    }

    @Test
    void aClaimThatSaysItIsVerifiedIsRefusedBecauseNothingVerifiedIt() {
        when(repository.findById("doc-1")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.publish("doc-1", "T", VALID_DOCUMENT, new OwnerClaim("acct-ada", "ada", "verified", CLAIMED_AT_MS)), null)
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("this service records claims and verifies nothing");
        assertThatThrownBy(() -> service.publish("doc-1", "T", VALID_DOCUMENT, new OwnerClaim("acct-ada", "ada", null, CLAIMED_AT_MS)), null)
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("is nothing");
    }

    // === M7 v263: the claim's INSTANT is read in the CLIENT's unit ====

    /**
     * v263 — the claim's instant crosses the wire as MILLISECONDS since the epoch, because that is what the
     * Studio's own {@code ownerClaim} produces, and this service's record said it mirrored that shape. It did
     * not: it declared the field an {@link Instant} while the client sent a number, and Jackson reads a bare
     * number as epoch SECONDS — so {@code 1700000000000} (2023-11-14) was stored as the year 55840. The unit
     * is now the client's, and this case pins the conversion at the storage boundary.
     */
    @Test
    void theClaimsInstantIsStoredInTheClientsOwnUnit() {
        when(repository.findById("doc-1")).thenReturn(Optional.empty());
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        long clientMillis = 1_700_000_000_000L;
        PublishedProject saved = service.publish("doc-1", "T", VALID_DOCUMENT,
                new OwnerClaim("acct-ada", "ada", "unsigned-local", clientMillis));

        assertThat(saved.getOwnerClaimedAt())
                .isEqualTo(Instant.ofEpochMilli(clientMillis));
        assertThat(saved.getOwnerClaimedAt().getEpochSecond())
                .as("the stored instant is the client's MILLISECONDS, not the same number read as seconds")
                .isEqualTo(1_700_000_000L);
    }

    @Test
    void anInstantTheServiceCannotCheckIsStillRecordedBecauseAClaimIsAClaim() {
        when(repository.findById("doc-1")).thenReturn(Optional.empty());
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        // The service does NOT compare the claimed instant against its own clock, and this case says so
        // rather than leaving it implied: every `long` of milliseconds is inside Instant's range, so a
        // range guard could never fire, and a clock comparison would be a verification this service does
        // not claim to do. The instant is recorded AS STATED, exactly like the rest of the claim.
        PublishedProject saved = service.publish("doc-1", "T", VALID_DOCUMENT,
                new OwnerClaim("acct-ada", "ada", "unsigned-local", Long.MAX_VALUE));

        assertThat(saved.getOwnerClaimedAt()).isEqualTo(Instant.ofEpochMilli(Long.MAX_VALUE));
    }

    // === M7 v243: a REMIX forks a publication into a NEW, OWNERLESS project ====
    // The remix does NOT inherit the owner claim: the remixed row names nobody
    // (pre-v242 rule), so anyone may take it down, and the source is recorded in _lineage.

    @Test
    void aRemixOfAnExistingPublicationCreatesANewOwnerlessPublication() throws Exception {
        PublishedProject source = new PublishedProject("doc-1", "First", VALID_DOCUMENT, 1, PUBLISHED_AT);
        source.claimOwner("acct-ada", "ada", "unsigned-local", CLAIMED_AT);
        when(repository.findById("doc-1")).thenReturn(Optional.of(source));
        when(repository.existsById("doc-2")).thenReturn(false);
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        Optional<PublishedProject> remixed = service.remix("doc-1", "doc-2");

        assertThat(remixed).isPresent();
        PublishedProject created = remixed.get();
        assertThat(created.getProjectId()).isEqualTo("doc-2");
        assertThat(created.getVersion()).isEqualTo(1);
        assertThat(created.getTitle()).isEqualTo("First (remix)");
        // The remix does NOT inherit the owner claim: the remixed row names nobody.
        assertThat(created.hasOwner()).isFalse();
        assertThat(created.getOwnerAccountId()).isNull();
        assertThat(created.getOwnerHandle()).isNull();
        // Lineage travels with the document.
        JsonNode lineage = new ObjectMapper().readTree(created.getDocumentJson()).get("_lineage");
        assertThat(lineage.get("sourceProjectId").asText()).isEqualTo("doc-1");
        assertThat(lineage.get("remixedAt")).isNotNull();
    }

    @Test
    void aRemixOfAMissingPublicationReturnsEmpty() {
        when(repository.findById("missing")).thenReturn(Optional.empty());

        assertThat(service.remix("missing", "doc-2")).isEmpty();
    }

    @Test
    void aRemixToAnExistingTargetIdIsRefused() {
        PublishedProject source = new PublishedProject("doc-1", "First", VALID_DOCUMENT, 1, PUBLISHED_AT);
        when(repository.findById("doc-1")).thenReturn(Optional.of(source));
        when(repository.existsById("doc-2")).thenReturn(true);

        assertThatThrownBy(() -> service.remix("doc-1", "doc-2"))
                .isInstanceOf(InvalidPublication.class)
                .hasMessageContaining("remix target project id already exists: doc-2");
        verify(repository, never()).save(any(PublishedProject.class));
    }

    @Test
    void aRemixDoesNotInheritTheSourceOwnerClaim() {
        PublishedProject source = new PublishedProject("doc-1", "First", VALID_DOCUMENT, 1, PUBLISHED_AT);
        source.claimOwner("acct-ada", "ada", "unsigned-local", CLAIMED_AT);
        when(repository.findById("doc-1")).thenReturn(Optional.of(source));
        when(repository.existsById("doc-2")).thenReturn(false);
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        Optional<PublishedProject> remixed = service.remix("doc-1", "doc-2");

        assertThat(remixed).isPresent();
        assertThat(remixed.get().hasOwner()).isFalse();
        // ownerless → anyone may act (pre-v242 rule kept on purpose).
        assertThat(remixed.get().isOwnedBy("acct-ada")).isTrue();
        assertThat(remixed.get().isOwnedBy("acct-anyone-else")).isTrue();
    }

    // === M7 v242: re-publish owner consistency ===

    @Test
    void aRepublishWithTheSameAccountIdKeepsTheOwnerAndIncrementsTheVersion() {
        PublishedProject existing = new PublishedProject("doc-1", "First", VALID_DOCUMENT, 1, PUBLISHED_AT);
        existing.claimOwner("acct-ada", "ada", "unsigned-local", CLAIMED_AT);
        when(repository.findById("doc-1")).thenReturn(Optional.of(existing));
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        PublishedProject saved = service.publish("doc-1", "Second", "{\"pages\":[]}", claim("acct-ada"));

        assertThat(saved).isSameAs(existing);
        assertThat(saved.getVersion()).isEqualTo(2);
        assertThat(saved.hasOwner()).isTrue();
        assertThat(saved.getOwnerAccountId()).isEqualTo("acct-ada");
    }

    @Test
    void aRepublishNamingADifferentAccountIsRefusedAndNothingIsSaved() {
        PublishedProject existing = new PublishedProject("doc-1", "First", VALID_DOCUMENT, 1, PUBLISHED_AT);
        existing.claimOwner("acct-ada", "ada", "unsigned-local", CLAIMED_AT);
        when(repository.findById("doc-1")).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> service.publish("doc-1", "Second", "{\"pages\":[]}", claim("acct-other")))
                .isInstanceOf(OwnerTaken.class);
        verify(repository, never()).save(any(PublishedProject.class));
    }

    @Test
    void aRepublishNamingNobodyKeepsTheExistingOwner() {
        PublishedProject existing = new PublishedProject("doc-1", "First", VALID_DOCUMENT, 1, PUBLISHED_AT);
        existing.claimOwner("acct-ada", "ada", "unsigned-local", CLAIMED_AT);
        when(repository.findById("doc-1")).thenReturn(Optional.of(existing));
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        PublishedProject saved = service.publish("doc-1", "Second", "{\"pages\":[]}", null);

        assertThat(saved.getVersion()).isEqualTo(2);
        assertThat(saved.hasOwner()).isTrue();
        assertThat(saved.getOwnerAccountId()).isEqualTo("acct-ada");
    }

    @Test
    void aRepublishOfAnOwnerlessRowWithAClaimerSetsTheOwner() {
        PublishedProject existing = new PublishedProject("doc-1", "First", VALID_DOCUMENT, 1, PUBLISHED_AT);
        when(repository.findById("doc-1")).thenReturn(Optional.of(existing));
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        PublishedProject saved = service.publish("doc-1", "Second", "{\"pages\":[]}", claim("acct-ada"));

        assertThat(saved.hasOwner()).isTrue();
        assertThat(saved.getOwnerAccountId()).isEqualTo("acct-ada");
    }

    // === v271: the AUDIT TRAIL — what the publication verbs DID ===

    /**
     * v271 — the trail records what happened, and it records the actor exactly as it was received: a claim
     * carries an account id, a handle and an assurance, and an ANONYMOUS publish carries none.
     */
    @Test
    void publishingRecordsAnAuditEntryWithTheClaimAsItsActor() {
        when(repository.findById("doc-1")).thenReturn(Optional.empty());
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        service.publish("doc-1", "T", VALID_DOCUMENT, new OwnerClaim("acct-ada", "ada", "unsigned-local", CLAIMED_AT_MS));

        verify(audit).record("publish", "acct-ada", "ada", "unsigned-local", "doc-1", dev.nexus.api.ops.AuditService.TARGET_PUBLICATION);
    }

    @Test
    void anAnonymousPublishRecordsAnEntryWithNOActorRatherThanNoEntry() {
        when(repository.findById("doc-1")).thenReturn(Optional.empty());
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        service.publish("doc-1", "T", VALID_DOCUMENT, null);

        // the entry EXISTS and says nobody did it: an audit trail that could not say "nobody" would have to
        // invent an actor.
        verify(audit).record("publish", null, null, null, "doc-1", dev.nexus.api.ops.AuditService.TARGET_PUBLICATION);
    }

    @Test
    void aRepublishIsAnEventToo() {
        PublishedProject existing = new PublishedProject("doc-1", "T", "{}", 1, PUBLISHED_AT);
        when(repository.findById("doc-1")).thenReturn(Optional.of(existing));
        when(repository.save(any(PublishedProject.class))).thenAnswer(i -> i.getArgument(0));

        service.publish("doc-1", "T2", VALID_DOCUMENT, new OwnerClaim("acct-ada", "ada", "unsigned-local", CLAIMED_AT_MS));

        verify(audit).record("publish", "acct-ada", "ada", "unsigned-local", "doc-1", dev.nexus.api.ops.AuditService.TARGET_PUBLICATION);
    }

    @Test
    void aTakeDownRecordsAnEntryNamingOnlyTheAccountIdItWasGiven() {
        when(repository.findById("doc-1")).thenReturn(Optional.of(new PublishedProject("doc-1", "T", "{}", 1, PUBLISHED_AT)));

        service.unpublish("doc-1", "acct-ada");

        // the request carried a CLAIMER, not a claim: the service never saw a handle or an assurance for it
        // and records none rather than borrowing the publication's.
        verify(audit).record("unpublish", "acct-ada", null, null, "doc-1", dev.nexus.api.ops.AuditService.TARGET_PUBLICATION);
    }

    @Test
    void aREFUSEDTakeDownRecordsNothing() {
        // the owner rule throws before anything is written, and the refusal is already in the response the
        // caller received. The trail says what HAPPENED, not what was attempted.
        // The row must be OWNED for the rule to bite: an ownerless row is open to anybody, and a take-down of
        // one SUCCEEDS — which is the pre-v242 rule, and it is a different case (an earlier one).
        PublishedProject owned = new PublishedProject("doc-1", "T", "{}", 1, PUBLISHED_AT);
        owned.claimOwner("acct-ada", "ada", "unsigned-local", CLAIMED_AT);
        when(repository.findById("doc-1")).thenReturn(Optional.of(owned));

        assertThatThrownBy(() -> service.unpublish("doc-1", "acct-someone-else"), null)
                .isInstanceOf(NotTheOwner.class);

        verify(audit, never()).record(any(), any(), any(), any(), any(), any());
    }
}
