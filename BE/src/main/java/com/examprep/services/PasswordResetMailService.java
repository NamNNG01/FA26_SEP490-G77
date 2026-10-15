package com.examprep.services;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordResetMailService {

    private final JavaMailSender mailSender;

    @Value("${app.mail.enabled:false}")
    private boolean mailEnabled;

    @Value("${app.mail.from:no-reply@examprep.local}")
    private String mailFrom;

    @Value("${app.mail.from-name:ExamPrep}")
    private String mailFromName;

    public boolean sendPasswordResetEmail(String toEmail, String displayName, String resetLink, long expiresMinutes) {
        if (!mailEnabled) {
            log.warn("Password reset email skipped (app.mail.enabled=false). Configure Gmail SMTP to deliver to {}.", toEmail);
            return false;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
            helper.setFrom(mailFrom, mailFromName);
            helper.setTo(toEmail);
            helper.setSubject("[ExamPrep] Password reset request");
            helper.setText(buildTextBody(displayName, resetLink, expiresMinutes), false);
            mailSender.send(message);
            log.info("Password reset email sent.");
            return true;
        } catch (MailException | MessagingException ex) {
            log.warn("Password reset email delivery failed: {}", ex.getMessage());
            return false;
        } catch (Exception ex) {
            log.warn("Password reset email delivery failed unexpectedly: {}", ex.getMessage());
            return false;
        }
    }

    private String buildTextBody(String displayName, String resetLink, long expiresMinutes) {
        String name = displayName == null || displayName.isBlank() ? "there" : displayName.trim();
        return "Hi " + name + ",\n\n"
                + "We received a request to reset your ExamPrep password.\n"
                + "Click the link below to set a new password (valid for " + expiresMinutes + " minutes, single use):\n\n"
                + resetLink + "\n\n"
                + "If you did not request this, you can safely ignore this email.\n\n"
                + "Thanks,\n"
                + "ExamPrep Team";
    }
}
