package com.examprep.services;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordResetEmailService {

    private final JavaMailSender mailSender;

    @Value("${app.password-reset.url}")
    private String passwordResetUrl;

    @Value("${app.mail.from:}")
    private String mailFrom;

    @Async
    public void send(Long userId, String email, String rawToken) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(email);
        message.setSubject("Password reset request");
        message.setText("Reset your password: " + passwordResetUrl + "?token=" + rawToken);
        if (mailFrom != null && !mailFrom.isBlank()) {
            message.setFrom(mailFrom);
        }
        try {
            mailSender.send(message);
        } catch (MailException ex) {
            log.warn("Password reset email delivery failed for user ID: {}", userId);
        }
    }
}
