package dev.nexus.api.publish;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.nexus.api.publish.PublishDtos.OwnerClaim;
import dev.nexus.api.publish.PublishDtos.Publication;
import dev.nexus.api.publish.PublishDtos.PublishRequest;
import dev.nexus.api.publish.PublishDtos.Receipt;
import dev.nexus.api.publish.PublishDtos.RemixReceipt;
import dev.nexus.api.publish.PublishDtos.RemixRequest;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * M7 v424 - the slice's whole HTTP surface for PUBLICATIONS, graded directly.
 *
 * <p>The publish door is the one every other door stands behind, and its controller owns decisions no
 * other does. The URL is built from the REQUEST that asked ({@code ServletUriComponentsBuilder} composes
 * it from this server's own scheme/host/port), so a receipt names an address that actually serves the
 * publication rather than a configured base that could point at nothing. The document crosses the HTTP
 * boundary as a JSON OBJECT and reaches the service as TEXT - a missing or JSON-null document is passed
 * through as null so the service's own rule names the problem rather than a Jackson error describing a
 * type. A created publication answers 201 and an updated one 200. And the claim goes back out in the
 * CLIENT's unit - the claim that comes back is the claim that went in.
 *
 * <p>No Spring context and no database here on purpose; the request the URL is built from is a
 * {@link MockHttpServletRequest} bound to the holder, which is the smallest honest stand-in for the
 * servlet the real door runs inside.
 */
@ExtendWith(MockitoExtension.class)
class PublishControllerTest {

    private static final Instant AT = Instant.parse("2026-10-20T12:00:00Z");

    @Mock
    private PublishService service;

    private PublishController controller;

    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        controller = new PublishController(service, mapper);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    private static PublishedProject row(String projectId, String title, int version) {
        return new PublishedProject(projectId, title, "{\"name\":\"Harbour\"}", version, AT);
    }

    private static OwnerClaim claim() {
        return new OwnerClaim("acct-a", "ada", "unsigned-local", 1_700_000_000_000L);
    }

    @Test
    void aNewPublicationAnswers201AndAnUpdatedOneAnswers200() {
        when(service.find("pub-1")).thenReturn(Optional.empty());
        when(service.publish(eq("pub-1"), any(), any(), any())).thenReturn(row("pub-1", "Harbour", 1));

        ResponseEntity<Receipt> created = controller.publish("pub-1", new PublishRequest("Harbour", document(), claim()));

        assertThat(created.getStatusCode().value()).isEqualTo(201);

        when(service.find("pub-1")).thenReturn(Optional.of(row("pub-1", "Harbour", 1)));
        when(service.publish(eq("pub-1"), any(), any(), any())).thenReturn(row("pub-1", "Harbour", 2));

        ResponseEntity<Receipt> updated = controller.publish("pub-1", new PublishRequest("Harbour", document(), claim()));

        // The status is the difference between "this id was new" and "this id already had a publication",
        // which a caller syncing a Studio document wants to know.
        assertThat(updated.getStatusCode().value()).isEqualTo(200);
        assertThat(updated.getBody()).isNotNull();
        assertThat(updated.getBody().version()).isEqualTo(2);
    }

    @Test
    void theReceiptCarriesTheUrlBuiltFromThisServersOwnAddress() {
        when(service.find("pub-1")).thenReturn(Optional.empty());
        when(service.publish(eq("pub-1"), any(), any(), any())).thenReturn(row("pub-1", "Harbour", 1));

        ResponseEntity<Receipt> res = controller.publish("pub-1", new PublishRequest("Harbour", document(), claim()));

        // Not a configured "public base": the URL is composed from the request that asked, so it names an
        // address that actually serves the publication.
        assertThat(res.getBody()).isNotNull();
        assertThat(res.getBody().url()).endsWith("/projects/pub-1");
    }

    @Test
    void aMissingOrJsonNullDocumentIsPassedThroughAsNull() {
        when(service.find("pub-1")).thenReturn(Optional.empty());
        when(service.publish(eq("pub-1"), any(), eq(null), any())).thenReturn(row("pub-1", "Harbour", 1));

        controller.publish("pub-1", new PublishRequest("Harbour", null, claim()));
        controller.publish("pub-1", new PublishRequest("Harbour", JsonNodeFactory.instance.nullNode(), claim()));

        // A missing or JSON-null document reaches the service as null, so the SERVICE's own rule names the
        // problem rather than a Jackson error describing a type.
        verify(service, org.mockito.Mockito.times(2)).publish(eq("pub-1"), any(), eq(null), any());
    }

    @Test
    void theDocumentCrossesAsTextNotAsAnObject() {
        ObjectNode doc = document();
        when(service.find("pub-1")).thenReturn(Optional.empty());
        when(service.publish("pub-1", "Harbour", doc.toString(), claim())).thenReturn(row("pub-1", "Harbour", 1));

        controller.publish("pub-1", new PublishRequest("Harbour", doc, claim()));

        // The service owns what a document must BE; this adapter only changes its representation.
        verify(service).publish("pub-1", "Harbour", doc.toString(), claim());
    }

    @Test
    void aNullRequestBodyIsAskedAsNullsRatherThanThrownIntoA500() {
        when(service.find("pub-1")).thenReturn(Optional.empty());
        when(service.publish("pub-1", null, null, null)).thenReturn(row("pub-1", null, 1));

        controller.publish("pub-1", null);

        verify(service).publish("pub-1", null, null, null);
    }

    @Test
    void theReadAnswers404WhenThereIsNoSuchProject() {
        when(service.find("pub-1")).thenReturn(Optional.empty());

        ResponseEntity<Publication> res = controller.read("pub-1");

        assertThat(res.getStatusCode().value()).isEqualTo(404);
        assertThat(res.getBody()).isNull();
    }

    @Test
    void theReadAnswersTheStoredDocumentAsJSONNotAsAnEscapedString() {
        when(service.find("pub-1")).thenReturn(Optional.of(row("pub-1", "Harbour", 1)));

        ResponseEntity<Publication> res = controller.read("pub-1");

        // The column holds TEXT and the response must not: a document returned as an escaped string is
        // the classic double-encoding bug, and a caller would have to parse it twice to use it.
        assertThat(res.getBody()).isNotNull();
        assertThat(res.getBody().document()).isInstanceOf(JsonNode.class);
        assertThat(((JsonNode) res.getBody().document()).get("name").asText()).isEqualTo("Harbour");
    }

    @Test
    void theListAsksWithTheRawCapAndClampsOnlyTheEcho() {
        when(service.list(PublishService.MAX_LIST_LIMIT + 9_900, null)).thenReturn(List.of(row("pub-1", "Harbour", 1)));

        ResponseEntity<dev.nexus.api.publish.PublishDtos.Listing> res = controller.list(10_000, null);

        // The ask travels raw; the ANSWER carries the clamped cap, so a caller can tell "there are twenty"
        // from "there are at least twenty" without knowing the service's own ceiling.
        verify(service).list(PublishService.MAX_LIST_LIMIT + 9_900, null);
        assertThat(res.getBody()).isNotNull();
        assertThat(res.getBody().limit()).isEqualTo(PublishService.MAX_LIST_LIMIT);
        assertThat(res.getBody().count()).isEqualTo(1);
    }

    @Test
    void aNonPositiveLimitIsClampedToZeroInTheAnswerRatherThanRefused() {
        when(service.list(-5, null)).thenReturn(List.of());

        ResponseEntity<dev.nexus.api.publish.PublishDtos.Listing> res = controller.list(-5, null);

        // The door's own comment promises a 400 for a non-positive limit; the code clamps the echo to
        // zero instead. Pinned as the code reads - making the comment true is a decision, not a drift.
        verify(service).list(-5, null);
        assertThat(res.getStatusCode().value()).isEqualTo(200);
        assertThat(res.getBody()).isNotNull();
        assertThat(res.getBody().limit()).isZero();
    }

    @Test
    void theListingCarriesNoDocuments() {
        when(service.list(PublishService.DEFAULT_LIST_LIMIT, null)).thenReturn(List.of(row("pub-1", "Harbour", 1)));

        ResponseEntity<dev.nexus.api.publish.PublishDtos.Listing> res = controller.list(null, null);

        // A listing that carried documents would answer "what is published" with the whole corpus - the
        // row of a listing is the receipt's facts and no document.
        assertThat(dev.nexus.api.publish.PublishDtos.ListingEntry.class.getRecordComponents())
                .noneMatch(c -> c.getName().toLowerCase().contains("document"));
        assertThat(res.getBody()).isNotNull();
        assertThat(res.getBody().publications()).hasSize(1);
        assertThat(res.getBody().publications().get(0).projectId()).isEqualTo("pub-1");
    }

    @Test
    void theTakeDownAnswers200WithRemovedFalseWhenThereWasNothing() {
        when(service.unpublish("pub-1", "acct-a")).thenReturn(false);

        ResponseEntity<dev.nexus.api.publish.PublishDtos.Removal> res = controller.unpublish("pub-1", "acct-a");

        // There is no 404: the URL names a project, not a resource that must exist.
        assertThat(res.getStatusCode().value()).isEqualTo(200);
        assertThat(res.getBody()).isNotNull();
        assertThat(res.getBody().removed()).isFalse();
        assertThat(res.getBody().projectId()).isEqualTo("pub-1");
    }

    @Test
    void theTakeDownPassesTheClaimerQueryParameterStraightThrough() {
        when(service.unpublish("pub-1", "acct-a")).thenReturn(true);
        when(service.unpublish("pub-1", null)).thenReturn(true);

        controller.unpublish("pub-1", "acct-a");
        controller.unpublish("pub-1", null);

        // The claim arrives as a QUERY PARAMETER - a DELETE with no body is the conventional shape - and
        // the parameter can be omitted entirely, which for a publication that names nobody is exactly
        // the answer it deserves.
        verify(service).unpublish("pub-1", "acct-a");
        verify(service).unpublish("pub-1", null);
    }

    @Test
    void theClaimGoesBackOutInTheClientsUnitAndNullWhenTheRowNamesNobody() {
        PublishedProject owned = row("pub-1", "Harbour", 1);
        owned.claimOwner("acct-a", "ada", "unsigned-local", AT);
        when(service.find("pub-1")).thenReturn(Optional.of(owned));

        ResponseEntity<Publication> res = controller.read("pub-1");

        // v263 - the claim goes back out in the CLIENT's unit, so the claim that comes back is the claim
        // that went in. A row with no owner answers null: "anyone", said plainly.
        assertThat(res.getBody()).isNotNull();
        assertThat(res.getBody().owner()).isEqualTo(new OwnerClaim("acct-a", "ada", "unsigned-local", AT.toEpochMilli()));

        PublishedProject anonymous = row("pub-2", "Old", 1);
        when(service.find("pub-2")).thenReturn(Optional.of(anonymous));
        assertThat(controller.read("pub-2").getBody().owner()).isNull();
    }

    @Test
    void aBrokenRuleIsA400ThatNamesIt() {
        ResponseEntity<Map<String, String>> res = controller.invalid(new InvalidPublication("a publication needs a document"));

        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(res.getBody())
                .containsEntry("error", "invalid-publication")
                .containsEntry("message", "a publication needs a document");
    }

    @Test
    void notTheOwnerAndOwnerTakenAreBoth403WithDifferentCodes() {
        // 403 rather than 400, and deliberately not a subtype: the request was well-formed. The error code
        // names WHICH refusal it was, so a Studio can tell "you may not" from "you would move it" without
        // matching on a sentence.
        ResponseEntity<Map<String, String>> notYours = controller.notTheOwner(new NotTheOwner("that publication is not yours"));
        assertThat(notYours.getStatusCode().value()).isEqualTo(403);
        assertThat(notYours.getBody()).containsEntry("error", "not-the-owner");

        ResponseEntity<Map<String, String>> taken = controller.notTheOwner(new OwnerTaken("that publication already has an owner"));
        assertThat(taken.getStatusCode().value()).isEqualTo(403);
        assertThat(taken.getBody()).containsEntry("error", "owner-taken");
    }

    @Test
    void theRemixAnswers201WithTheSourceNamed() {
        when(service.remix("pub-src", "pub-fork")).thenReturn(Optional.of(row("pub-fork", "Harbour", 1)));

        ResponseEntity<RemixReceipt> res = controller.remix("pub-src", new RemixRequest("pub-src", "pub-fork"));

        assertThat(res.getStatusCode().value()).isEqualTo(201);
        assertThat(res.getBody()).isNotNull();
        // The receipt names the SOURCE it was forked from, and the URL is the fork's own.
        assertThat(res.getBody().sourceProjectId()).isEqualTo("pub-src");
        assertThat(res.getBody().url()).endsWith("/projects/pub-fork");
    }

    @Test
    void theRemixGeneratesATargetWhenTheCallerNamesNoneAnd404sWhenTheSourceIsGone() {
        when(service.remix(eq("pub-src"), any())).thenReturn(Optional.of(row("remix-abc", "Harbour", 1)));

        controller.remix("pub-src", null);

        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(service).remix(eq("pub-src"), captor.capture());
        assertThat(captor.getValue()).startsWith("remix-");

        when(service.remix(eq("pub-gone"), any())).thenReturn(Optional.empty());
        assertThat(controller.remix("pub-gone", null).getStatusCode().value()).isEqualTo(404);
    }

    private static ObjectNode document() {
        return JsonNodeFactory.instance.objectNode().put("name", "Harbour");
    }
}
