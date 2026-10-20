package com.examprep.services;

import com.examprep.dto.AdminUserDetailResponse;
import com.examprep.dto.AdminUserItem;
import com.examprep.dto.AdminUserListStats;
import com.examprep.dto.AdminUserPageResponse;
import com.examprep.dto.AdminUserRequests;
import com.examprep.dto.AdminUserResponse;
import com.examprep.dto.IdCount;
import com.examprep.dto.ResponseCode;
import com.examprep.dto.StudentRecentAttempt;
import com.examprep.dto.UserLearningStats;
import com.examprep.entities.User;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.EnrollmentRepository;
import com.examprep.repositories.ExamAttemptRepository;
import com.examprep.repositories.RefreshTokenRepository;
import com.examprep.repositories.UserRepository;
import com.examprep.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserServiceImpl implements AdminUserService {

    private static final Set<String> ROLES = Set.of(User.ROLE_STUDENT, User.ROLE_COURSE_MANAGER, User.ROLE_ADMIN);
    private static final Set<String> STATUSES = Set.of(User.STATUS_ACTIVE, User.STATUS_INACTIVE);

    private final UserRepository users;
    private final EnrollmentRepository enrollments;
    private final ExamAttemptRepository attempts;
    private final RefreshTokenRepository refreshTokens;
    private final AuthService authService;

    @Override
    public AdminUserPageResponse list(String search, String role, String status, int page, int size) {
        if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE)
            throw new BadRequestException(ResponseCode.VALIDATION_ERROR,
                    "Page must be nonnegative, size must be 1-100, and offset must fit a 32-bit integer.");
        requireKnownRole(role);
        requireKnownStatus(status);

        String text = search == null ? "" : search.strip().toLowerCase(Locale.ROOT);
        String pattern = text.isEmpty() ? null
                : "%" + text.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";

        Page<User> result = users.findUsers(pattern, role, status,
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "userId")));

        List<Long> ids = result.getContent().stream().map(User::getUserId).toList();
        Map<Long, Long> counts = ids.isEmpty() ? Map.of()
                : enrollments.countByUserIds(ids).stream().collect(Collectors.toMap(IdCount::id, IdCount::total));

        Page<AdminUserItem> content = result.map(u -> AdminUserItem.from(u, counts.getOrDefault(u.getUserId(), 0L)));

        AdminUserListStats stats = AdminUserListStats.builder()
                .total(users.count())
                .active(users.countByStatus(User.STATUS_ACTIVE))
                .inactive(users.countByStatus(User.STATUS_INACTIVE))
                .newThisMonth(users.countByCreatedAtAfter(startOfCurrentMonth()))
                .build();

        return AdminUserPageResponse.of(content, stats);
    }

    @Override
    public AdminUserDetailResponse detail(Long id) {
        User user = requireUser(id);

        List<StudentRecentAttempt> recent = attempts.findRecentAttemptsByUserId(id, PageRequest.of(0, 5));
        UserLearningStats stats = UserLearningStats.builder()
                .coursesEnrolled(enrollments.countByUserId(id))
                .examsTaken(attempts.countByUserId(id))
                .averageScore(roundedAverage(attempts.averageScoreByUserId(id)))
                .lastActivityAt(recent.isEmpty() ? null : recent.get(0).getSubmittedAt())
                .build();

        return AdminUserDetailResponse.from(user, stats, recent);
    }

    @Override
    @Transactional
    public AdminUserResponse update(UserPrincipal actor, Long id, AdminUserRequests.Update request) {
        requireKnownRole(request.role());
        requireKnownStatus(request.status());
        User user = requireUser(id);

        if (actor.getId().equals(id)
                && (!request.role().equals(user.getRoleName()) || !request.status().equals(user.getStatus())))
            throw new BadRequestException(ResponseCode.VALIDATION_ERROR,
                    "Admins cannot change their own role or status.");

        String email = request.email().trim().toLowerCase(Locale.ROOT);
        if (users.existsByEmailAndUserIdNot(email, id))
            throw new BaseException(ResponseCode.CONFLICT, "Email is already used by another account.");

        user.setFullName(request.fullName().trim());
        user.setEmail(email);
        user.setRoleName(request.role());
        user.setStatus(request.status());

        if (User.STATUS_INACTIVE.equalsIgnoreCase(request.status()))
            refreshTokens.revokeAllByUserId(id, Instant.now());

        return AdminUserResponse.from(user);
    }

    @Override
    @Transactional
    public AdminUserResponse updateStatus(UserPrincipal actor, Long id, AdminUserRequests.StatusUpdate request) {
        requireKnownStatus(request.status());
        User user = requireUser(id);

        if (actor.getId().equals(id) && !request.status().equals(user.getStatus()))
            throw new BadRequestException(ResponseCode.VALIDATION_ERROR,
                    "Admins cannot change their own role or status.");

        user.setStatus(request.status());
        if (User.STATUS_INACTIVE.equalsIgnoreCase(request.status()))
            refreshTokens.revokeAllByUserId(id, Instant.now());

        return AdminUserResponse.from(user);
    }

    @Override
    @Transactional
    public void resetPassword(Long id) {
        authService.sendPasswordResetEmail(requireUser(id));
    }

    private static void requireKnownRole(String role) {
        if (role != null && !ROLES.contains(role))
            throw new BadRequestException(ResponseCode.VALIDATION_ERROR, "Unknown role: " + role);
    }

    private static void requireKnownStatus(String status) {
        if (status != null && !STATUSES.contains(status))
            throw new BadRequestException(ResponseCode.VALIDATION_ERROR, "Unknown status: " + status);
    }

    private static BigDecimal roundedAverage(Number raw) {
        return raw == null ? null : new BigDecimal(raw.toString()).setScale(2, RoundingMode.HALF_UP);
    }

    private static Instant startOfCurrentMonth() {
        return LocalDate.now(ZoneOffset.UTC).withDayOfMonth(1).atStartOfDay(ZoneOffset.UTC).toInstant();
    }

    User requireUser(Long id) {
        return users.findById(id).orElseThrow(() -> new ResourceNotFoundException("User not found."));
    }
}
