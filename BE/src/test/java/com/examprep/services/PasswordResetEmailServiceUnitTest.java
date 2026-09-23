package com.examprep.services;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

@ExtendWith(MockitoExtension.class)
class PasswordResetEmailServiceUnitTest {

    @Mock
    private JavaMailSender mailSender;

    @InjectMocks
    private PasswordResetEmailService passwordResetEmailService;

    @Test
    void send_HidesMailDeliveryFailure() {
        doThrow(new MailSendException("SMTP unavailable")).when(mailSender).send(any(SimpleMailMessage.class));

        assertDoesNotThrow(() -> passwordResetEmailService.send(101L, "student@gmail.com", "reset-token"));
    }
}
