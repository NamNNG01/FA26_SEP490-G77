package com.examprep.services;

import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** UTC018 - the password reset e-mail is built and handed to the mail server (SMTP mocked). */
class PasswordResetMailServiceTest {

    private PasswordResetMailService service(JavaMailSender sender, boolean enabled) {
        PasswordResetMailService service = new PasswordResetMailService(sender);
        ReflectionTestUtils.setField(service, "mailEnabled", enabled);
        ReflectionTestUtils.setField(service, "mailFrom", "no-reply@examprep.local");
        ReflectionTestUtils.setField(service, "mailFromName", "ExamPrep");
        return service;
    }

    @Test
    void utc018_resetMailIsSentWithTheResetLink() throws Exception {
        JavaMailSender sender = mock(JavaMailSender.class);
        when(sender.createMimeMessage()).thenReturn(new MimeMessage(Session.getInstance(new Properties())));
        String link = "https://app.examprep.local/reset-password?token=raw-token-123";

        boolean sent = service(sender, true).sendPasswordResetEmail("student1@example.com", "Student One", link, 15);

        assertTrue(sent);
        ArgumentCaptor<MimeMessage> captor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(sender).send(captor.capture());
        MimeMessage message = captor.getValue();
        assertEquals("student1@example.com", message.getRecipients(Message.RecipientType.TO)[0].toString());
        assertEquals("[ExamPrep] Password reset request", message.getSubject());
        String body = message.getContent().toString();
        assertTrue(body.contains(link));
        assertTrue(body.contains("valid for 15 minutes"));
    }

    @Test
    void utc018_disabledMailIsSkipped() {
        JavaMailSender sender = mock(JavaMailSender.class);
        assertFalse(service(sender, false).sendPasswordResetEmail("student1@example.com", "Student One", "link", 15));
        verify(sender, never()).send(any(MimeMessage.class));
    }
}
