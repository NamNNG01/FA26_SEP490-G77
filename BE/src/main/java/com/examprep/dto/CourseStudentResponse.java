package com.examprep.dto;

import java.time.Instant;

public record CourseStudentResponse(Long userId, String fullName, String email, String avatarUrl,
                                    Instant enrolledAt, String status, Integer progress) {}
