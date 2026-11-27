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
    private final com.examprep.repositories.UserSubscriptionRepository subscriptions;
    private final com.examprep.repositories.SubscriptionPlanRepository plans;
    private final org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;
    private final PasswordResetMailService mail;
    private final AiQuotaService quota;
    private final ManagerAiQuotaService managerAiQuota;

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

        Map<Long, com.examprep.dto.AdminSubscription> latest = new java.util.HashMap<>();
        if (!ids.isEmpty()) for (var sub : subscriptions.findLatestForUsers(ids))
            latest.putIfAbsent(sub.getUser().getUserId(), com.examprep.dto.AdminSubscription.from(sub));
        Page<AdminUserItem> content = result.map(u -> {
            AdminUserItem item = AdminUserItem.from(u, counts.getOrDefault(u.getUserId(), 0L));
            if (User.ROLE_STUDENT.equals(u.getRoleName())) item.setSubscription(latest.get(u.getUserId()));
            return item;
        });

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

        AdminUserDetailResponse detail = AdminUserDetailResponse.from(user, stats, recent);
        if (User.ROLE_STUDENT.equals(user.getRoleName())) subscriptions.findLatestForUsers(List.of(id)).stream().findFirst()
                .ifPresent(sub -> detail.setSubscription(com.examprep.dto.AdminSubscription.from(sub)));
        if (User.ROLE_COURSE_MANAGER.equals(user.getRoleName())) {
            detail.setManagerAiQuota(AdminUserDetailResponse.AdminManagerAiQuota.from(managerAiQuota.snapshotForUser(user)));
        }
        return detail;
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

        String previousRole = user.getRoleName();
        user.setFullName(request.fullName().trim());
        user.setEmail(email);
        user.setRoleName(request.role());
        user.setStatus(request.status());

        if (User.STATUS_INACTIVE.equalsIgnoreCase(request.status())
                || !java.util.Objects.equals(previousRole, request.role()))
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

    @Override
    @Transactional
    public AdminUserResponse create(AdminUserRequests.Create request) {
        requireKnownRole(request.role());
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        if (users.existsByEmailIgnoreCase(email))
            throw new BaseException(ResponseCode.CONFLICT, "Email already exists", Map.of("code", "EMAIL_EXISTS"));
        byte[] bytes = new byte[24];
        new java.security.SecureRandom().nextBytes(bytes);
        String password = "Aa1!" + java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        User user = users.saveAndFlush(User.builder().fullName(request.fullName().trim()).email(email)
                .roleName(request.role()).status(User.STATUS_ACTIVE).passwordHash(passwordEncoder.encode(password)).build());
        if (!mail.sendNewAccountEmail(email, password)) {
            throw new BaseException(ResponseCode.INTERNAL_SERVER_ERROR, "Account email delivery failed");
        }
        return AdminUserResponse.from(user);
    }

    @Override
    @Transactional
    public com.examprep.dto.AdminSubscription setSubscription(Long id, AdminUserRequests.Subscription request) {
        User user = users.findForUpdate(id).orElseThrow(() -> new ResourceNotFoundException("User not found."));
        if (!User.ROLE_STUDENT.equals(user.getRoleName())) throw com.examprep.services.contest.ContestRules.invalid("userId", "Only students can have subscriptions");
        if ((request.planId() == null) != (request.endDate() == null)) throw com.examprep.services.contest.ContestRules.invalid("endDate", "planId and endDate must both be set or null");
        com.examprep.entities.SubscriptionPlan plan = null;
        if (request.planId() != null) {
            plan = plans.findAvailable(request.planId()).orElseThrow(() -> new ResourceNotFoundException("Subscription plan not found"));
            if (plan.getPrice().signum() <= 0 || request.endDate().isBefore(LocalDate.now(AiQuotaService.ZONE)))
                throw com.examprep.services.contest.ContestRules.invalid("planId", "A paid plan and a current or future end date are required");
        }
        quota.lock(id);
        Instant now = Instant.now();
        for (var sub : subscriptions.findByUserUserIdAndStatus(id, "ACTIVE")) {
            sub.setStatus("CANCELLED");
            if (sub.getEndDate() != null && sub.getEndDate().isAfter(now)) {
                sub.setEndDate(now);
            }
        }
        subscriptions.flush();
        if (plan == null) return null;
        Instant end = request.endDate().plusDays(1).atStartOfDay(AiQuotaService.ZONE).toInstant().minusNanos(1000);
        var sub = subscriptions.save(com.examprep.entities.UserSubscription.builder().user(user).plan(plan).startDate(now)
                .endDate(end).status("ACTIVE").paidAmount(BigDecimal.ZERO).build());
        return com.examprep.dto.AdminSubscription.from(sub);
    }

    @Override
    @Transactional
    public AdminUserDetailResponse.AdminManagerAiQuota setManagerAiQuota(Long id, AdminUserRequests.ManagerAiQuota request) {
        User user = users.findForUpdate(id).orElseThrow(() -> new ResourceNotFoundException("User not found."));
        if (!User.ROLE_COURSE_MANAGER.equals(user.getRoleName())) {
            throw com.examprep.services.contest.ContestRules.invalid("userId",
                    "Only content managers can have a monthly AI token quota override");
        }
        Long limit = request == null ? null : request.monthlyTokenLimit();
        if (limit != null && limit < 0) {
            throw com.examprep.services.contest.ContestRules.invalid("monthlyTokenLimit",
                    "Monthly AI token limit must be a non-negative number");
        }
        user.setManagerMonthlyAiTokenLimit(limit);
        users.save(user);
        return AdminUserDetailResponse.AdminManagerAiQuota.from(managerAiQuota.snapshotForUser(user));
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
        return LocalDate.now(AiQuotaService.ZONE).withDayOfMonth(1).atStartOfDay(AiQuotaService.ZONE).toInstant();
    }

    User requireUser(Long id) {
        return users.findById(id).orElseThrow(() -> new ResourceNotFoundException("User not found."));
    }
}
