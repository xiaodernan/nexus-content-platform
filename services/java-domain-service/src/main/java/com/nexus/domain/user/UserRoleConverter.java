package com.nexus.domain.user;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Maps the Java role to the database's {@code user_role} ENUM labels.
 *
 * <p>Spring Data binds an {@code @Enumerated(STRING)} value as the enum's NAME — {@code "CREATOR"} — while
 * the database's labels are lowercase ({@code creator}, {@code admin}). PostgreSQL rejects the uppercase form
 * with {@code invalid input value for enum user_role: "CREATOR"} — measured, not assumed.
 *
 * <p>Converting instead of renaming the constants keeps Java naming conventions and the schema's spelling
 * both intact. The conversion applies to entity writes and to derived-query parameters alike, which matters
 * because {@code UserRepository.findByRole} is reachable over HTTP.
 */
@Converter(autoApply = true)
public class UserRoleConverter implements AttributeConverter<User.UserRole, String> {

    @Override
    public String convertToDatabaseColumn(User.UserRole role) {
        return role == null ? null : role.name().toLowerCase(java.util.Locale.ROOT);
    }

    @Override
    public User.UserRole convertToEntityAttribute(String label) {
        return label == null ? null : User.UserRole.valueOf(label.toUpperCase(java.util.Locale.ROOT));
    }
}
