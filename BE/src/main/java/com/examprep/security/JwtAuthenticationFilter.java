package com.examprep.security;

import com.examprep.entities.User;
import com.examprep.repositories.UserRepository;
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
            if (StringUtils.hasText(jwt) && tokenProvider.validateToken(jwt)) {
                UserPrincipal userPrincipal = tokenProvider.getUserPrincipalFromToken(jwt);
                if (isTokenStillValid(userPrincipal.getId(), jwt)) {
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

    private boolean isTokenStillValid(Long userId, String jwt) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null || !User.STATUS_ACTIVE.equalsIgnoreCase(user.getStatus())) {
            return false;
        }
        if (user.getPasswordChangedAt() != null) {
            try {
                java.util.Date issuedAt = tokenProvider.getIssuedAtFromToken(jwt);
                if (issuedAt != null && issuedAt.toInstant().isBefore(user.getPasswordChangedAt())) {
                    return false;
                }
            } catch (JwtException | IllegalArgumentException ex) {
                return false;
            }
        }
        return true;
    }

    private String getJwtFromRequest(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");
        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }
        return null;
    }
}
