package com.nexus.domain.web;

import com.nexus.domain.ResourceNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Turns this service's refusals into the status codes that name them.
 *
 * <p>Two facts, two codes:
 *
 * <ul>
 *   <li><b>404</b> — the row is not there. The caller should look for another one.</li>
 *   <li><b>400</b> — the caller sent something that is not in the schema's vocabulary (a kind that is not
 *       a kind, a role that is not a role). The caller should fix the request.</li>
 * </ul>
 *
 * <p>Before this advice existed, both arrived as a 500 from Spring's default handler, which told the
 * caller the SERVER was broken for what was in fact the caller's own bad word. And an unknown kind was
 * not even caught here: {@code projects.kind} is a PostgreSQL enum, so the bad word reached the
 * database and came back as a constraint violation.
 *
 * <p>The body names the refusal in the caller's own terms. It is an error message, not a stack trace and
 * not a description of the machine.
 */
@RestControllerAdvice
public class DomainErrors {

    /**
     * The error body. One field, and the word explains itself.
     */
    public record Error(String error) {
    }

    /**
     * A row that is not there.
     */
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<Error> notFound(ResourceNotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .contentType(MediaType.APPLICATION_JSON)
                .body(new Error(e.getMessage()));
    }

    /**
     * A word that the schema does not hold.
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Error> badRequest(IllegalArgumentException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .contentType(MediaType.APPLICATION_JSON)
                .body(new Error(e.getMessage()));
    }

    /**
     * A request that contradicts the row it names — claiming a guest account that is not a guest.
     *
     * <p>409 rather than 400: the request was well-formed, the row exists, and the two disagree. The
     * caller has to decide what to do about it, which is what a conflict means.
     */
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Error> conflict(IllegalStateException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .contentType(MediaType.APPLICATION_JSON)
                .body(new Error(e.getMessage()));
    }
}
