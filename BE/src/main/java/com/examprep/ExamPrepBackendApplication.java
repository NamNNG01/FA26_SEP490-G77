package com.examprep;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@SpringBootApplication
@EnableJpaAuditing
public class ExamPrepBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(ExamPrepBackendApplication.class, args);
    }
}
