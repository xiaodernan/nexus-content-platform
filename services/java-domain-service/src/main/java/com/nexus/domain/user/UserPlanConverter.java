package com.nexus.domain.user;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Maps the Java plan to the lowercase labels the shared schema stores in {@code users.plan}.
 *
 * <p>Unlike {@code role}, this column is {@code text} — but the data in it is lowercase ({@code free},
 * {@code pro}, …), and {@code @Enumerated(STRING)} reads the label back through {@code valueOf}, which is
 * case-sensitive. Measured: reading a row with {@code plan = 'free'} failed with
 * {@code No enum constant com.nexus.domain.user.User.UserPlan.free}. Converting keeps the Java names and the
 * stored spelling both intact.
 */
@Converter(autoApply = true)
public class UserPlanConverter implements AttributeConverter<User.UserPlan, String> {

    @Override
    public String convertToDatabaseColumn(User.UserPlan plan) {
        return plan == null ? null : plan.name().toLowerCase(java.util.Locale.ROOT);
    }

    @Override
    public User.UserPlan convertToEntityAttribute(String label) {
        return label == null ? null : User.UserPlan.valueOf(label.toUpperCase(java.util.Locale.ROOT));
    }
}
