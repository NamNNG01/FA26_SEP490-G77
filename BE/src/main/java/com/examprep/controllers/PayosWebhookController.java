package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.ResponseCode;
import com.examprep.exceptions.BaseException;
import com.examprep.services.PaymentService;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/webhooks/payos")
@RequiredArgsConstructor
@Tag(name = "Payment Webhooks")
public class PayosWebhookController {
    private final PaymentService payments;

    @PostMapping
    @Operation(summary = "PY-03: PayOS payment webhook")
    public ResponseEntity<ApiResponse<Void>> webhook(@RequestBody JsonNode payload) {
        if (!payments.webhook(payload)) throw new BaseException(ResponseCode.UNAUTHORIZED, "Invalid PayOS signature or payment payload");
        return ResponseEntity.ok(ApiResponse.success(null, "OK"));
    }
}
