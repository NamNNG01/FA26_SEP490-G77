package com.examprep.services;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.ActiveProfiles;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

@SpringBootTest(properties = "management.health.mail.enabled=false")
@ActiveProfiles("test")
class PasswordResetEmailServiceTest {

    @Autowired
    private PasswordResetEmailService passwordResetEmailService;

    @MockBean
    private JavaMailSender mailSender;

    @Test
    void send_DoesNotWaitForSlowSmtpDelivery() throws Exception {
        CountDownLatch smtpStarted = new CountDownLatch(1);
        CountDownLatch releaseSmtp = new CountDownLatch(1);
        doAnswer(invocation -> {
            smtpStarted.countDown();
            releaseSmtp.await(5, TimeUnit.SECONDS);
            return null;
        }).when(mailSender).send(any(SimpleMailMessage.class));

        long startedAt = System.nanoTime();
        passwordResetEmailService.send(101L, "student@gmail.com", "reset-token");
        long elapsedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);

        assertTrue(elapsedMillis < 500, "Email submission must not block the caller");
        assertTrue(smtpStarted.await(1, TimeUnit.SECONDS), "SMTP work should start asynchronously");
        releaseSmtp.countDown();
    }
}
