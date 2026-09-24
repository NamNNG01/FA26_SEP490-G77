package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/health")
@Tag(name = "Health Check", description = "System status & health check endpoint")
public class HealthController {

    @GetMapping
    @Operation(summary = "Check backend service status", description = "Returns system operational status and timestamp")
    public ResponseEntity<ApiResponse<Map<String, String>>> checkHealth() {
        Map<String, String> status = Map.of(
                "status", "UP",
                "service", "exam-prep-backend",
                "version", "1.0.0"
        );
        return ResponseEntity.ok(ApiResponse.success(status, "Backend service is healthy"));
    }
}
