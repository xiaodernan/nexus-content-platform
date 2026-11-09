package com.nexus.domain.user;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * The one mapping fact the database has an opinion about: the label's case.
 *
 * <p>Measured failure that created this class — {@code select ... where role=?} bound {@code "CREATOR"} and
 * PostgreSQL answered {@code invalid input value for enum user_role: "CREATOR"}. The converter's whole job is
 * the lowercasing; null stays null so an absent value is "absent", not a fourth role.
 */
class UserRoleConverterTest {

    private final UserRoleConverter converter = new UserRoleConverter();

    @Test
    void writesTheLowercaseLabelTheDatabaseDefines() {
        assertThat(converter.convertToDatabaseColumn(User.UserRole.CREATOR)).isEqualTo("creator");
        assertThat(converter.convertToDatabaseColumn(User.UserRole.ADMIN)).isEqualTo("admin");
    }

    @Test
    void readsEitherCaseBack() {
        assertThat(converter.convertToEntityAttribute("creator")).isEqualTo(User.UserRole.CREATOR);
        assertThat(converter.convertToEntityAttribute("ADMIN")).isEqualTo(User.UserRole.ADMIN);
    }

    @Test
    void nullIsNullBothWays() {
        assertThat(converter.convertToDatabaseColumn(null)).isNull();
        assertThat(converter.convertToEntityAttribute(null)).isNull();
    }
}
