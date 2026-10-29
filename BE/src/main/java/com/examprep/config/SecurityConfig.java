package com.examprep.config;

import com.examprep.entities.User;
import com.examprep.security.JwtAuthenticationFilter;
import com.examprep.security.RestAccessDeniedHandler;
import com.examprep.security.RestAuthenticationEntryPoint;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final RestAuthenticationEntryPoint authenticationEntryPoint;
    private final RestAccessDeniedHandler accessDeniedHandler;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configure(http))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Public Endpoints
                        .requestMatchers(
                                "/api/v1/health",
                                "/v3/api-docs/**",
                                "/swagger-ui/**",
                                "/swagger-ui.html",
                                "/api/v1/auth/register",
                                "/api/v1/auth/login",
                                "/api/v1/auth/refresh",
                                "/api/v1/auth/password/forgot",
                                "/api/v1/auth/password/reset",
                                "/api/v1/webhooks/payos"
                        ).permitAll()
                        // Public catalog reads (SRS Permission Matrix grants Guests
                        // Full View rights on the course list; unauthenticated
                        // visitors must reach the landing / public-course screens).
                        .requestMatchers(HttpMethod.GET,
                                "/api/v1/categories",
                                "/api/v1/courses",
                                "/api/v1/courses/*",
                                "/api/v1/student/courses",
                                "/api/v1/student/courses/*",
                                "/api/v1/student/subscription/plans"
                        ).permitAll()
                        // Role-restricted Endpoints
                        .requestMatchers("/api/v1/admin/**").hasRole(User.ROLE_ADMIN)
                        .requestMatchers("/api/v1/manager/**").hasAnyRole(User.ROLE_COURSE_MANAGER, User.ROLE_ADMIN)
                        .requestMatchers("/api/v1/student/**").hasAnyRole(User.ROLE_STUDENT, User.ROLE_ADMIN)
                        .requestMatchers("/api/v1/dashboard/student").hasAnyRole(User.ROLE_STUDENT, User.ROLE_ADMIN)
                        .requestMatchers("/api/v1/dashboard/course-manager").hasAnyRole(User.ROLE_COURSE_MANAGER, User.ROLE_ADMIN)
                        .requestMatchers("/api/v1/dashboard/admin").hasRole(User.ROLE_ADMIN)
                        // All other endpoints (including /api/v1/auth/logout, /api/v1/auth/logout-all) require authentication
                        .anyRequest().authenticated()
                )
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
