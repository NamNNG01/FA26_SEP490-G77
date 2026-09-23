package com.examprep;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
// ponytail: uses Spring's default async executor; configure a bounded TaskExecutor if email volume grows.
@EnableAsync
public class ExamPrepBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(ExamPrepBackendApplication.class, args);
    }
}
