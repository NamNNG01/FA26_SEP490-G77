package com.examprep;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class ExamPrepBackendApplicationTests {

    @Test
    void contextLoads() {
        // Verifies Spring ApplicationContext starts successfully
    }
}
