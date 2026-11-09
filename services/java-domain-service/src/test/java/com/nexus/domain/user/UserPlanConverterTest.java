package com.nexus.domain.user;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * The plan labels the shared schema actually stores.
 *
 * <p>Measured failure that created this class — reading a row with {@code plan = 'free'} under
 * {@code @Enumerated(STRING)} threw {@code No enum constant UserPlan.free}. The stored spelling is lowercase;
 * the Java names are not.
 */
class UserPlanConverterTest {

    private final UserPlanConverter converter = new UserPlanConverter();

    @Test
    void writesAndReadsTheLowercaseLabel() {
        assertThat(converter.convertToDatabaseColumn(User.UserPlan.FREE)).isEqualTo("free");
        assertThat(converter.convertToDatabaseColumn(User.UserPlan.STUDIO)).isEqualTo("studio");
        assertThat(converter.convertToEntityAttribute("studio")).isEqualTo(User.UserPlan.STUDIO);
    }

    @Test
    void nullIsNullBothWays() {
        assertThat(converter.convertToDatabaseColumn(null)).isNull();
        assertThat(converter.convertToEntityAttribute(null)).isNull();
    }
}
