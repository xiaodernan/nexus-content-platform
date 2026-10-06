# NEXUS Java Domain Service

Java Spring Boot domain services for NEXUS platform, providing authoritative write paths for:

- **User** - User lifecycle, profile, authentication state
- **Project** - Project lifecycle, metadata, ownership
- **Community** - Social operations (likes, comments, follows, remixes, saves)
- **Permission** - Roles, permissions, access control
- **Billing** - Credits, subscriptions, consumption tracking

## Tech Stack

- Java 21
- Spring Boot 3.2.0
- PostgreSQL (shared with main application)
- Redis (shared with main application)
- Flyway for database migrations

## Status

This is a **scaffolding-only** project. The basic structure has been created but implementation is pending:

- [x] Maven POM configuration
- [x] Application entry point
- [x] Basic service stubs
- [ ] Entity models and repositories
- [ ] REST controllers
- [ ] Database migrations
- [ ] Integration tests
- [ ] Connection to shared PostgreSQL/Redis

## Why Java?

Per ROADMAP line 1049, certain domain services are designated to run on Java Spring Boot as the authoritative write path, separate from the TypeScript/Node.js web layer. This separation provides:

1. Clear ownership boundaries between read and write paths
2. Strong typing and transaction management for critical business logic
3. Independent scaling of compute-intensive domain operations

## Next Steps

To continue development:

1. Install Java 21 JDK
2. Configure database connection in `application.yml`
3. Implement entity models matching existing PostgreSQL schema
4. Add repository interfaces with Spring Data JPA
5. Create REST controllers for each domain service
6. Write integration tests
7. Connect to shared Redis for caching/sessions
