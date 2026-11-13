package com.nexus.domain.user;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Stores a role as the LABEL the database column holds, not as the Java constant's name.
 *
 * <p>Why this class exists, in one measured sentence: {@code users.role} is a PostgreSQL enum whose
 * labels are {@code 'creator'} and {@code 'admin'}, and writing the constant names fails with
 * {@code ERROR: invalid input value for enum user_role: "CREATOR"}. The write path of this service did
 * exactly that until the label was carried by the constant instead of derived from its name.
 *
 * <p>A converter is the right shape for this because the DATABASE owns the vocabulary here: the enum
 * type lives in the schema that drizzle owns ({@code apps/web/src/server/db/schema.ts}), and a Java
 * constant is this service's private spelling of a value that already exists elsewhere. Keeping the two
 * in step is the converter's job — and the label lives on the constant so there is exactly one place to
 * read it from.
 */
@Converter
public class UserRoleLabelConverter implements AttributeConverter<User.UserRole, String> {

    @Override
    public String convertToDatabaseColumn(User.UserRole attribute) {
        return attribute == null ? null : attribute.label();
    }

    @Override
    public User.UserRole convertToEntityAttribute(String dbData) {
        return dbData == null ? null : User.UserRole.fromLabel(dbData);
    }
}
