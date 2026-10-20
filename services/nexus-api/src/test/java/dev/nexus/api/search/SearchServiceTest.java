package dev.nexus.api.search;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.publish.PublishedProject;
import dev.nexus.api.publish.PublishedProjectRepository;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

/**
 * The rules {@link SearchService} owns: a blank term is the plain listing, a term is a FILTER over the same
 * listing, and the cap and the window are the listing's own.
 *
 * <p>No Spring context and no database here on purpose \u2014 these cases are about what the service decides.
 * The finder\u2019s SQL is graded by the real-browser proof, which drives the real jar against a real
 * PostgreSQL.
 */
@ExtendWith(MockitoExtension.class)
class SearchServiceTest {

    @Mock
    private PublishedProjectRepository repository;

    private SearchService service;

    @BeforeEach
    void setUp() {
        service = new SearchService(repository);
    }

    @Test
    void aBLANKTermIsThePlainListingAndNotAnError() {
        when(repository.findAllByOrderByPublishedAtDesc(any(Pageable.class))).thenReturn(List.of());

        List<PublishedProject> rows = service.search("   ", null, 20, 0);

        assertThat(rows).isEmpty();
        // "Show me everything" is a legitimate thing to mean, and a 400 would make the caller guess.
        verify(repository).findAllByOrderByPublishedAtDesc(any(Pageable.class));
    }

    @Test
    void aTermIsAFilterOverTheSameListing() {
        when(repository.findByTextContaining(eq("harbour"), any(Pageable.class))).thenReturn(List.of());

        service.search("harbour", null, 20, 0);

        verify(repository).findByTextContaining(eq("harbour"), any(Pageable.class));
    }

    @Test
    void aTermWithAnOwnerIsNarrowedToThatOwner() {
        when(repository.findByOwnerAndTextContaining(eq("acct-ada"), eq("harbour"), any(Pageable.class)))
                .thenReturn(List.of());

        service.search("harbour", "acct-ada", 20, 0);

        verify(repository).findByOwnerAndTextContaining(eq("acct-ada"), eq("harbour"), any(Pageable.class));
    }

    @Test
    void aBLANKOwnerIsNoOwnerAndAsksForThePlainSearch() {
        when(repository.findByTextContaining(eq("harbour"), any(Pageable.class))).thenReturn(List.of());

        service.search("harbour", "   ", 20, 0);

        // A blank owner is the ABSENCE of one, and "the publications of nobody" is not a filter.
        verify(repository).findByTextContaining(eq("harbour"), any(Pageable.class));
    }

    @Test
    void theCapIsCLAMPEDRatherThanRefused() {
        when(repository.findByTextContaining(eq("x"), any(Pageable.class))).thenReturn(List.of());

        service.search("x", null, 10_000, 0);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByTextContaining(eq("x"), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(SearchService.MAX_SEARCH_LIMIT);
    }

    @Test
    void aNonPositiveLimitIsTheDefaultRatherThanZero() {
        when(repository.findByTextContaining(eq("x"), any(Pageable.class))).thenReturn(List.of());

        service.search("x", null, 0, 0);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByTextContaining(eq("x"), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(SearchService.DEFAULT_SEARCH_LIMIT);
    }

    @Test
    void theWindowCarriesTheEXACToffsetAndNOOrderOfItsOwn() {
        when(repository.findByTextContaining(eq("x"), any(Pageable.class))).thenReturn(List.of());

        service.search("x", null, 24, 25);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByTextContaining(eq("x"), window.capture());
        // The 25th row with a size of 24: a page-aligned window would have skipped 24 or 48, and the row in
        // between would have been unreachable.
        assertThat(window.getValue().getOffset()).isEqualTo(25L);
        // v302 — and the window carries NO sort of its own. The ORDER now lives in the finder's QUERY (the
        // relevance order: a title match first, then newest-first within each class), and a Pageable's own
        // sort would be APPENDED to that ORDER BY — the two would fight, and the rows would come back in an
        // order nobody wrote down.
        assertThat(window.getValue().getSort().isSorted()).isFalse();
        assertThat(window.getValue().getSort().getOrderFor("publishedAt")).isNull();
    }

    @Test
    void aNEGATIVEOffsetIsClampedToTheHeadOfTheListing() {
        when(repository.findByTextContaining(eq("x"), any(Pageable.class))).thenReturn(List.of());

        service.search("x", null, 24, -5);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByTextContaining(eq("x"), window.capture());
        assertThat(window.getValue().getOffset()).isZero();
    }
}
