package dev.nexus.api.search;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.publish.PublishedProject;
import dev.nexus.api.search.SearchDtos.SearchAnswer;
import dev.nexus.api.search.SearchDtos.SearchClaim;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * M7 v425 - the HTTP surface for SEARCH, graded directly.
 *
 * <p>A separate door from {@code GET /projects}, because a search is a different feature with different
 * rules: "what is published" and "which of these mention this word" are different questions. The answer
 * carries the SAME shape as the listing's ({@code publications}, {@code count}, {@code limit},
 * {@code offset}) so a client that knows one knows the other - plus the offset the listing does not
 * carry, because a search result set is long enough to need one.
 *
 * <p>No Spring context and no database here on purpose. The request the URL is built from is a
 * {@link MockHttpServletRequest} placed AT THE DOOR'S OWN ADDRESS, which is what lets the URL be asked
 * the one question that matters: does a result's URL name an address that SERVES it, or does it carry
 * the door it was asked at? v425 measured this door composing from the CURRENT REQUEST - asked at
 * /search it answered /search/projects/pub-1, an address no endpoint serves. v429 decided: the base is
 * the CONTEXT PATH, the same rule the publish door follows, and the URL test below pins that the two
 * doors now agree.
 */
@ExtendWith(MockitoExtension.class)
class SearchControllerTest {

    private static final Instant AT = Instant.parse("2026-10-20T12:00:00Z");

    @Mock
    private SearchService service;

    private SearchController controller;

    @BeforeEach
    void setUp() {
        controller = new SearchController(service);
        // The door's real address, not the root: this is the fact the URL test measures.
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest("GET", "/search")));
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    private static PublishedProject row(String projectId) {
        return new PublishedProject(projectId, "Harbour", "{}", 1, AT);
    }

    @Test
    void aBlankTermIsThePlainListingAndTheAnswerNamesItsWindow() {
        when(service.search("   ", null, SearchService.DEFAULT_SEARCH_LIMIT, 0)).thenReturn(List.of(row("pub-1")));

        ResponseEntity<SearchAnswer> res = controller.search("   ", null, null, null);

        verify(service).search("   ", null, SearchService.DEFAULT_SEARCH_LIMIT, 0);
        SearchAnswer answer = res.getBody();
        assertThat(answer).isNotNull();
        assertThat(answer.publications()).hasSize(1);
        assertThat(answer.count()).isEqualTo(1);
        assertThat(answer.limit()).isEqualTo(SearchService.DEFAULT_SEARCH_LIMIT);
        assertThat(answer.offset()).isZero();
    }

    @Test
    void theTermAndTheOwnerTravelToTheServiceUntouched() {
        when(service.search("harbour", "acct-a", SearchService.DEFAULT_SEARCH_LIMIT, 0)).thenReturn(List.of());

        controller.search("harbour", "acct-a", null, null);

        // The controller does not read the term: what a blank one MEANS is the service's rule, and the
        // door only carries it.
        verify(service).search("harbour", "acct-a", SearchService.DEFAULT_SEARCH_LIMIT, 0);
    }

    @Test
    void theAskTravelsWithTheRawCapAndTheClampedOffsetAndTheAnswerEchoesBoth() {
        when(service.search(null, null, 500, 0)).thenReturn(List.of(row("pub-1")));

        ResponseEntity<SearchAnswer> res = controller.search(null, null, 500, -7);

        // A page before the first is the first; the cap travels raw (the service's own clamp is the one
        // clamp), and the answer says which window it is - so a caller can tell "the 25th result" from
        // "the 25th page" without keeping its own bookkeeping.
        verify(service).search(null, null, 500, 0);
        SearchAnswer answer = res.getBody();
        assertThat(answer).isNotNull();
        assertThat(answer.limit()).isEqualTo(SearchService.MAX_SEARCH_LIMIT);
        assertThat(answer.offset()).isZero();
    }

    @Test
    void aDeepWindowTravelsWhole() {
        when(service.search(null, null, SearchService.DEFAULT_SEARCH_LIMIT, 40)).thenReturn(List.of());

        ResponseEntity<SearchAnswer> res = controller.search(null, null, null, 40);

        verify(service).search(null, null, SearchService.DEFAULT_SEARCH_LIMIT, 40);
        assertThat(res.getBody()).isNotNull();
        assertThat(res.getBody().offset()).isEqualTo(40);
    }

    @Test
    void theAnswerCarriesTheSameShapeAsTheListingPlusTheOffset() {
        when(service.search(null, null, SearchService.DEFAULT_SEARCH_LIMIT, 0)).thenReturn(List.of(row("pub-1")));

        SearchAnswer answer = controller.search(null, null, null, null).getBody();

        // A client that knows the listing knows this: the same four fields, with the window's start
        // added, because a search result set is long enough to need one.
        assertThat(SearchAnswer.class.getRecordComponents()).hasSize(4);
        assertThat(answer).isNotNull();
        assertThat(answer.publications().get(0).projectId()).isEqualTo("pub-1");
        assertThat(answer.publications().get(0).title()).isEqualTo("Harbour");
        assertThat(answer.publications().get(0).version()).isEqualTo(1);
        assertThat(answer.publications().get(0).publishedAt()).isEqualTo(AT);
    }

    @Test
    void theURLNamesAnAddressThatServesThePublicationNotTheDoorItWasAskedAt() {
        when(service.search(null, null, SearchService.DEFAULT_SEARCH_LIMIT, 0)).thenReturn(List.of(row("pub-1")));

        SearchAnswer answer = controller.search(null, null, null, null).getBody();

        // v429 - the decision, pinned. This door used to compose from the CURRENT REQUEST, and v425
        // measured what that meant: asked at /search, a result's URL was /search/projects/pub-1, an
        // address no endpoint serves (the read door is /projects/{id}). The base is now the CONTEXT
        // PATH - the publish door's own rule (v424) - so asked at /search the URL is the same address
        // the publish door answers with. The two doors agree, and a search result points at something
        // that serves it.
        assertThat(answer).isNotNull();
        assertThat(answer.publications().get(0).url()).isEqualTo("http://localhost/projects/pub-1");
    }

    @Test
    void theClaimTravelsWithTheRowAndNullWhenTheRowNamesNobody() {
        PublishedProject owned = ownedRow("pub-1", "ada", "unsigned-local", AT);
        PublishedProject anonymous = row("pub-2");
        when(owned.getOwnerAccountId()).thenReturn("acct-a");
        when(service.search(null, null, SearchService.DEFAULT_SEARCH_LIMIT, 0)).thenReturn(List.of(owned, anonymous));

        SearchAnswer answer = controller.search(null, null, null, null).getBody();

        assertThat(answer).isNotNull();
        assertThat(answer.publications().get(0).owner())
                .isEqualTo(new SearchClaim("acct-a", "ada", "unsigned-local", AT.toEpochMilli()));
        // A row that names nobody answers null: "anyone", said plainly, the same rule every door keeps.
        assertThat(answer.publications().get(1).owner()).isNull();
    }

    @Test
    void aRowWithAnOwnerButNoClaimedInstantAnswersANullInstantRatherThanCrashing() {
        PublishedProject halfClaimed = ownedRow("pub-1", "ada", "unsigned-local", null);
        when(service.search(null, null, SearchService.DEFAULT_SEARCH_LIMIT, 0)).thenReturn(List.of(halfClaimed));

        SearchAnswer answer = controller.search(null, null, null, null).getBody();

        // The service proves the instant is present on the way in; a row that arrived without one is not
        // this door's to crash over. The claim travels, and the instant says nothing.
        assertThat(answer).isNotNull();
        assertThat(answer.publications().get(0).owner()).isEqualTo(new SearchClaim("acct-a", "ada", "unsigned-local", null));
    }

    /** A row that names an owner. The claim fields are stubbed because the entity's setter is package-private. */
    private static PublishedProject ownedRow(String projectId, String handle, String assurance, Instant claimedAt) {
        PublishedProject row = mock(PublishedProject.class);
        when(row.getProjectId()).thenReturn(projectId);
        when(row.getTitle()).thenReturn("Harbour");
        when(row.getVersion()).thenReturn(1);
        when(row.getPublishedAt()).thenReturn(AT);
        when(row.getOwnerAccountId()).thenReturn("acct-a");
        when(row.getOwnerHandle()).thenReturn(handle);
        when(row.getOwnerAssurance()).thenReturn(assurance);
        when(row.getOwnerClaimedAt()).thenReturn(claimedAt);
        return row;
    }
}
