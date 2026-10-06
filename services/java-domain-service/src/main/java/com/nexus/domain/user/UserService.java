package com.nexus.domain.user;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * User domain service - authoritative write path for user operations.
 * This service manages user lifecycle, profile, and authentication state.
 */
@Service
@Transactional(readOnly = true)
public class UserService {

    // TODO: Inject UserRepository and implement user operations
    // - createUser
    // - updateUserProfile
    // - deleteUser
    // - getUserById
    // - getUserByEmail

}
