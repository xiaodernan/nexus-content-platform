package dev.nexus.api.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

/**
 * M10 — the MCP door's HTTP envelope rules.
 *
 * <p>A JSON-RPC error must stay HTTP 200 (the protocol answered; HTTP did not fail), a notification must be
 * HTTP 202 with no body, and the id must come back exactly as it was sent so a client can match answers.
 */
@ExtendWith(MockitoExtension.class)
class McpControllerTest {

    @Mock
    private McpService service;

    private final ObjectMapper mapper = new ObjectMapper();

    private McpController controller() {
        return new McpController(service);
    }

    private McpDtos.JsonRpcResponse response(ResponseEntity<?> answer) {
        assertThat(answer.getBody()).isInstanceOf(McpDtos.JsonRpcResponse.class);
        return (McpDtos.JsonRpcResponse) answer.getBody();
    }

    @Test
    void initializeIsAnEnvelopeThatEchoesTheIdItWasSent() throws Exception {
        McpDtos.InitializeResult result = new McpDtos.InitializeResult(
                McpDtos.PROTOCOL_VERSION,
                new McpDtos.Capabilities(new McpDtos.ToolsCapability(false)),
                new McpDtos.ServerInfo("nexus-api", "0.1.0"),
                "declarations only");
        when(service.call("initialize", null)).thenReturn(result);

        ResponseEntity<?> answer = controller().handle(mapper.readTree(
                "{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"initialize\"}"));

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        McpDtos.JsonRpcResponse body = response(answer);
        assertThat(body.jsonrpc()).isEqualTo("2.0");
        assertThat(body.id().asInt()).isEqualTo(7);
        assertThat(body.error()).isNull();
        assertThat(mapper.valueToTree(body).get("result").get("serverInfo").get("name").asText())
                .isEqualTo("nexus-api");
    }

    @Test
    void toolsListIsAnEnvelopeWithAStringIdAndTheWindow() throws Exception {
        McpDtos.ToolsListResult result = new McpDtos.ToolsListResult(
                List.of(new McpDtos.ToolDescriptor("alpha.tool", "Reads the weather.", mapper.readTree("{}")),
                        new McpDtos.ToolDescriptor("zulu.tool", "Writes nothing.", mapper.readTree("{}"))),
                "2");
        when(service.call("tools/list", null)).thenReturn(result);

        ResponseEntity<?> answer = controller().handle(mapper.readTree(
                "{\"jsonrpc\":\"2.0\",\"id\":\"req-1\",\"method\":\"tools/list\"}"));

        McpDtos.JsonRpcResponse body = response(answer);
        assertThat(body.id().asText()).isEqualTo("req-1");
        assertThat(mapper.valueToTree(body).get("result").get("tools").size()).isEqualTo(2);
        assertThat(mapper.valueToTree(body).get("result").get("nextCursor").asText()).isEqualTo("2");
    }

    @Test
    void aRefusedCallIsAnErrorEnvelopeAtHttpTwoHundred() throws Exception {
        when(service.call("tools/call", null)).thenThrow(
                McpRefusal.methodNotFound("tools/call is not offered: it does not execute"));

        ResponseEntity<?> answer = controller().handle(mapper.readTree(
                "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\"}"));

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        McpDtos.JsonRpcResponse body = response(answer);
        assertThat(body.result()).isNull();
        assertThat(body.error().code()).isEqualTo(McpRefusal.METHOD_NOT_FOUND);
        assertThat(body.error().message()).contains("does not execute");
        assertThat(body.id().asInt()).isEqualTo(3);
    }

    @Test
    void aNotificationIsAcceptedWithNoBodyAndNothingElseIsAsked() throws Exception {
        ResponseEntity<?> answer = controller().handle(mapper.readTree(
                "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}"));

        assertThat(answer.getStatusCode().value()).isEqualTo(202);
        assertThat(answer.getBody()).isNull();
        verify(service).notify("notifications/initialized");
    }

    @Test
    void aRequestWithoutAnIdThatIsNotANotificationIsInvalidAndStillAnswered() throws Exception {
        org.mockito.Mockito.doThrow(McpRefusal.invalidRequest("a request without an id must be a notification"))
                .when(service).notify("tools/list");

        ResponseEntity<?> answer = controller().handle(mapper.readTree(
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/list\"}"));

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        McpDtos.JsonRpcResponse body = response(answer);
        assertThat(body.error().code()).isEqualTo(McpRefusal.INVALID_REQUEST);
        assertThat(body.id().isNull()).isTrue();
    }

    @Test
    void aBatchIsRefusedAsInvalidRequestAndTheServiceIsNeverCalled() throws Exception {
        ResponseEntity<?> answer = controller().handle(mapper.readTree(
                "[{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}]"));

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        McpDtos.JsonRpcResponse body = response(answer);
        assertThat(body.error().code()).isEqualTo(McpRefusal.INVALID_REQUEST);
        assertThat(body.error().message()).contains("OBJECT", "batches");
        assertThat(body.id().isNull()).isTrue();
        verifyNoInteractions(service);
    }

    @Test
    void aWrongVersionOrAMissingMethodIsInvalidBeforeTheService() throws Exception {
        ResponseEntity<?> wrongVersion = controller().handle(mapper.readTree(
                "{\"jsonrpc\":\"1.0\",\"id\":1,\"method\":\"ping\"}"));
        assertThat(response(wrongVersion).error().code()).isEqualTo(McpRefusal.INVALID_REQUEST);
        assertThat(response(wrongVersion).error().message()).contains("2.0");

        ResponseEntity<?> noMethod = controller().handle(mapper.readTree(
                "{\"jsonrpc\":\"2.0\",\"id\":1}"));
        assertThat(response(noMethod).error().code()).isEqualTo(McpRefusal.INVALID_REQUEST);
        assertThat(response(noMethod).error().message()).contains("method");
        verifyNoInteractions(service);
    }

    @Test
    void anIdThatIsNotAStringNumberOrNullIsRefusedWithANullId() throws Exception {
        ResponseEntity<?> answer = controller().handle(mapper.readTree(
                "{\"jsonrpc\":\"2.0\",\"id\":{\"nested\":true},\"method\":\"ping\"}"));

        McpDtos.JsonRpcResponse body = response(answer);
        assertThat(body.error().code()).isEqualTo(McpRefusal.INVALID_REQUEST);
        assertThat(body.error().message()).contains("id");
        assertThat(body.id().isNull()).isTrue();
        verifyNoInteractions(service);
    }

    @Test
    void anExplicitNullIdIsARequestNotANotification() throws Exception {
        when(service.call("ping", null)).thenReturn(new McpDtos.EmptyResult());

        ResponseEntity<?> answer = controller().handle(mapper.readTree(
                "{\"jsonrpc\":\"2.0\",\"id\":null,\"method\":\"ping\"}"));

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        McpDtos.JsonRpcResponse body = response(answer);
        assertThat(body.id().isNull()).isTrue();
        assertThat(mapper.valueToTree(body).get("result").isEmpty()).isTrue();
    }
}
