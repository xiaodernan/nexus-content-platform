package com.nexus.domain;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * The service's security posture, stated instead of inherited.
 *
 * <p>{@code spring-boot-starter-security} on the classpath without a filter chain does not leave a service
 * open — it locks every path behind HTTP Basic with a generated password printed at startup. That is the
 * right default for a service exposed directly to the internet and the wrong one here: this service sits
 * behind {@code nexus-gateway} (SC-6), which owns the caller-facing door, and authentication is a gateway
 * slice that has not been built yet.
 *
 * <p>So the surface is explicitly permitted, not accidentally. The bound is written down in the README:
 * reachable directly ⇒ every request is anonymous. Deployments must route through the gateway and must not
 * publish this service's port.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain apiSurface(HttpSecurity http) throws Exception {
        http
                // A stateless JSON API with no cookies has no CSRF surface to protect.
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests.anyRequest().permitAll());
        return http.build();
    }
}
