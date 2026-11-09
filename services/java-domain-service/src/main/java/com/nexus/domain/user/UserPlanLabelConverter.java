package com.nexus.domain.user;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Stores a plan tier as the LABEL the platform speaks, not as the Java constant's name.
 *
 * <p>{@code users.plan} is a plain {@code text} column, so nothing in the database would have refused
 * {@code "FREE"} — which is exactly why it is worth being careful. The web layer writes and compares
 * these values in LOWERCASE ({@code 'free'}, {@code 'pro'}, {@code 'creator'}, {@code 'studio'},
 * {@code 'enterprise'} — see {@code apps/web/src/server/domain/roles.ts}), so a row this service wrote
 * as {@code "FREE"} would be a row no web-layer comparison ever matches. The database would have
 * accepted it silently, which is the worst kind of wrong.
 */
@Converter
public class UserPlanLabelConverter implements AttributeConverter<User.UserPlan, String> {

    @Override
    public String convertToDatabaseColumn(User.UserPlan attribute) {
        return attribute == null ? null : attribute.label();
    }

    @Override
    public User.UserPlan convertToEntityAttribute(String dbData) {
        return dbData == null ? null : User.UserPlan.fromLabel(dbData);
    }
}
