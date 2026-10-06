package com.nexus.domain.community;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Community domain service - authoritative write path for social operations.
 * This service manages likes, comments, follows, remixes, and saves.
 */
@Service
@Transactional(readOnly = true)
public class CommunityService {

    // TODO: Inject repositories and implement community operations
    // - like/unlike
    // - add/remove comment
    // - follow/unfollow
    // - remix project
    // - save/unsave published work

}
