package com.examprep.security;

import com.examprep.entities.User;
import com.examprep.repositories.UserRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider tokenProvider;
    private final UserRepository userRepository;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        try {
            String jwt = getJwtFromRequest(request);
            if (StringUtils.hasText(jwt)) {
                Claims claims = tokenProvider.getClaimsFromToken(jwt);
                Long userId = Long.parseLong(claims.getSubject());
                String role = claims.get("role", String.class);
                if (role == null || role.isBlank()) {
                    throw new JwtException("Token is missing required role claim");
                }
                User liveUser = resolveValidUser(userId, claims);
                if (liveUser != null) {
                    UserPrincipal userPrincipal = UserPrincipal.create(
                            liveUser.getUserId(), liveUser.getEmail(), liveUser.getRoleName());
                    UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                            userPrincipal, null, userPrincipal.getAuthorities());
                    authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

                    SecurityContextHolder.getContext().setAuthentication(authentication);
                } else {
                    log.debug("JWT rejected: user inactive, deleted, or token issued before password change");
                }
            }
        } catch (JwtException | IllegalArgumentException ex) {
            log.debug("JWT authentication skipped: {}", ex.getMessage());
        }

        filterChain.doFilter(request, response);
    }

    private User resolveValidUser(Long userId, Claims claims) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null || !User.STATUS_ACTIVE.equalsIgnoreCase(user.getStatus())) {
            return null;
        }
        Long iatMs = claims.get("iat_ms", Long.class);
        if (iatMs == null && claims.getIssuedAt() != null) {
            iatMs = claims.getIssuedAt().getTime();
        }
        if (iatMs == null) {
            return null;
        }
        if (user.getPasswordChangedAt() != null && iatMs < user.getPasswordChangedAt().toEpochMilli()) {
            return null;
        }
        return user;
    }

    private String getJwtFromRequest(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");
        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }
        return null;
    }
}
