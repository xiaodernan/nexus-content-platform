package com.nexus.domain.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * The user vocabulary, and the LABELS it stores.
 *
 * <p>These tests exist because of a measured failure. {@code users.role} is a PostgreSQL enum whose
 * labels are {@code 'creator'} and {@code 'admin'}, and this service used to write the Java constant
 * names instead:
 *
 * <pre>ERROR: invalid input value for enum user_role: "CREATOR"</pre>
 *
 * <p>So the write path of this service was broken for every user it created, and nothing in the unit
 * tests noticed — because the unit tests never touched the vocabulary. These pin it.
 */
class UserVocabularyTest {

    @Test
    void aRoleIsStoredUnderTheLabelsTheDatabaseHolds() {
        assertThat(User.UserRole.CREATOR.label()).isEqualTo("creator");
        assertThat(User.UserRole.ADMIN.label()).isEqualTo("admin");
    }

    @Test
    void everyRoleLabelIsLowercaseAndUnique() {
        for (User.UserRole role : User.UserRole.values()) {
            assertThat(role.label())
                    .as("the label is what the column holds, and the column holds lowercase")
                    .isEqualTo(role.label().toLowerCase(java.util.Locale.ROOT));
        }
        assertThat(User.UserRole.values()).hasSize(2);
    }

    @Test
    void aRoleIsReadFromTheWireWhateverCaseItArrivesIn() {
        assertThat(User.UserRole.fromLabel("creator")).isEqualTo(User.UserRole.CREATOR);
        assertThat(User.UserRole.fromLabel("CREATOR")).isEqualTo(User.UserRole.CREATOR);
        assertThat(User.UserRole.fromLabel("Creator")).isEqualTo(User.UserRole.CREATOR);
        assertThat(User.UserRole.fromLabel(" admin ")).isEqualTo(User.UserRole.ADMIN);
    }

    @Test
    void aRoleTheSchemaDoesNotHoldIsRefusedByName() {
        assertThatThrownBy(() -> User.UserRole.fromLabel("moderator"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("moderator")
                .hasMessageContaining("creator");
    }

    @Test
    void anEmptyRoleIsRefused() {
        assertThatThrownBy(() -> User.UserRole.fromLabel("  "))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> User.UserRole.fromLabel(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void theRoleConverterStoresTheLabelAndReadsItBack() {
        UserRoleLabelConverter converter = new UserRoleLabelConverter();

        assertThat(converter.convertToDatabaseColumn(User.UserRole.ADMIN)).isEqualTo("admin");
        assertThat(converter.convertToEntityAttribute("admin")).isEqualTo(User.UserRole.ADMIN);
        assertThat(converter.convertToEntityAttribute(converter.convertToDatabaseColumn(User.UserRole.CREATOR)))
                .isEqualTo(User.UserRole.CREATOR);
    }

    @Test
    void aPlanTierIsStoredUnderTheLabelThePlatformSpeaks() {
        assertThat(User.UserPlan.FREE.label()).isEqualTo("free");
        assertThat(User.UserPlan.PRO.label()).isEqualTo("pro");
        assertThat(User.UserPlan.CREATOR.label()).isEqualTo("creator");
        assertThat(User.UserPlan.STUDIO.label()).isEqualTo("studio");
        assertThat(User.UserPlan.ENTERPRISE.label()).isEqualTo("enterprise");
    }

    @Test
    void aPlanIsReadFromTheWireWhateverCaseItArrivesIn() {
        assertThat(User.UserPlan.fromLabel("free")).isEqualTo(User.UserPlan.FREE);
        assertThat(User.UserPlan.fromLabel("FREE")).isEqualTo(User.UserPlan.FREE);
        assertThat(User.UserPlan.fromLabel("Enterprise")).isEqualTo(User.UserPlan.ENTERPRISE);
    }

    @Test
    void aPlanTheSchemaDoesNotHoldIsRefusedByName() {
        assertThatThrownBy(() -> User.UserPlan.fromLabel("platinum"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("platinum");
    }

    @Test
    void thePlanConverterStoresTheLabelAndReadsItBack() {
        UserPlanLabelConverter converter = new UserPlanLabelConverter();

        assertThat(converter.convertToDatabaseColumn(User.UserPlan.STUDIO)).isEqualTo("studio");
        assertThat(converter.convertToEntityAttribute("studio")).isEqualTo(User.UserPlan.STUDIO);
        assertThat(converter.convertToEntityAttribute(converter.convertToDatabaseColumn(User.UserPlan.FREE)))
                .isEqualTo(User.UserPlan.FREE);
    }

    @Test
    void theConvertersLeaveAnAbsentValueAbsent() {
        assertThat(new UserRoleLabelConverter().convertToDatabaseColumn(null)).isNull();
        assertThat(new UserRoleLabelConverter().convertToEntityAttribute(null)).isNull();
        assertThat(new UserPlanLabelConverter().convertToDatabaseColumn(null)).isNull();
        assertThat(new UserPlanLabelConverter().convertToEntityAttribute(null)).isNull();
    }
}
