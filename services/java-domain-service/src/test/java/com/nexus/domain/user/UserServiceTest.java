package com.nexus.domain.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * The user lifecycle rules, graded without a database.
 *
 * <p>The database enforces what a column can say (NOT NULL, unique email/handle); this class covers what a
 * column cannot: which default a create applies, that a handle taken by SOMEONE ELSE is refused, that only
 * a guest can be claimed, and that a soft-deleted account is no longer readable.
 */
@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository repository;

    @InjectMocks
    private UserService service;

    @Test
    void aRegistrationDerivesItsHandleFromTheEmail() {
        when(repository.save(any(User.class))).thenAnswer(call -> call.getArgument(0));

        User user = service.createUser("Ada", "Ada@Example.COM", "hash", false);

        // The part before the @, lowercased: the schema's unique index is on the raw handle, so the
        // derivation has to be stable rather than "whatever the caller typed".
        assertThat(user.getHandle()).isEqualTo("ada");
        assertThat(user.getGuest()).isFalse();
        assertThat(user.getId()).isNotNull();
    }

    @Test
    void aGuestWithNoEmailHasNoHandleInsteadOfAnEmptyOne() {
        when(repository.save(any(User.class))).thenAnswer(call -> call.getArgument(0));

        User guest = service.createUser("Guest", null, null, true);

        assertThat(guest.getHandle()).isNull();
        assertThat(guest.getGuest()).isTrue();
    }

    @Test
    void aHandleHeldByAnotherUserIsRefused() {
        UUID me = UUID.randomUUID();
        User current = user(me, "ada");
        User other = user(UUID.randomUUID(), "ada");
        when(repository.findById(me)).thenReturn(Optional.of(current));
        when(repository.findByHandle("ada")).thenReturn(Optional.of(other));

        assertThatThrownBy(() -> service.updateUserProfile(me, null, "ada", null, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Handle already taken");
    }

    @Test
    void keepingYourOwnHandleIsNotAConflict() {
        UUID me = UUID.randomUUID();
        User current = user(me, "ada");
        when(repository.findById(me)).thenReturn(Optional.of(current));
        when(repository.findByHandle("ada")).thenReturn(Optional.of(current));
        when(repository.save(any(User.class))).thenAnswer(call -> call.getArgument(0));

        User updated = service.updateUserProfile(me, null, "ada", null, "Bio");

        assertThat(updated.getHandle()).isEqualTo("ada");
        assertThat(updated.getBio()).isEqualTo("Bio");
    }

    @Test
    void onlyAGuestCanBeClaimed() {
        UUID registered = UUID.randomUUID();
        User user = user(registered, "ada");
        user.setGuest(false);
        when(repository.findById(registered)).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> service.claimGuestAccount(registered, "ada@example.com", "hash"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("not a guest");
    }

    @Test
    void claimingAGuestRecordsWhenItHappened() {
        UUID guestId = UUID.randomUUID();
        User guest = user(guestId, null);
        guest.setGuest(true);
        when(repository.findById(guestId)).thenReturn(Optional.of(guest));
        when(repository.save(any(User.class))).thenAnswer(call -> call.getArgument(0));

        User claimed = service.claimGuestAccount(guestId, "ada@example.com", "hash");

        assertThat(claimed.getGuest()).isFalse();
        assertThat(claimed.getEmail()).isEqualTo("ada@example.com");
        assertThat(claimed.getClaimedAt()).isNotNull();
    }

    @Test
    void aSoftDeletedUserIsNotReadable() {
        User deleted = user(UUID.randomUUID(), "ada");
        deleted.setDeletedAt(java.time.Instant.now());
        when(repository.findById(deleted.getId())).thenReturn(Optional.of(deleted));

        assertThat(service.getUserById(deleted.getId())).isEmpty();
    }

    private static User user(UUID id, String handle) {
        User user = new User();
        user.setId(id);
        user.setDisplayName("Ada");
        user.setHandle(handle);
        user.setRole(User.UserRole.CREATOR);
        return user;
    }
}
