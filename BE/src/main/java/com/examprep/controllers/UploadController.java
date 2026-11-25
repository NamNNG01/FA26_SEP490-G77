package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.security.UserPrincipal;
import com.examprep.services.MaterialStorage;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Deque;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/v1/uploads")
@PreAuthorize("hasAnyRole('STUDENT', 'COURSE_MANAGER', 'ADMIN')")
@RequiredArgsConstructor
@Tag(name = "Uploads", description = "Shared media image upload to Cloudinary")
public class UploadController {
    private final MaterialStorage storage;
    private final Map<Long, Deque<Long>> uploadWindow = new ConcurrentHashMap<>();

    @PostMapping(consumes = "multipart/form-data")
    @Operation(summary = "Upload an image (JPG/PNG/WEBP/GIF, max 5MB) and get its public URL")
    public ResponseEntity<ApiResponse<MaterialStorage.StoredImage>> upload(@AuthenticationPrincipal UserPrincipal user,
            @RequestParam MultipartFile file) {
        UserController.checkUploadRate(uploadWindow, user.getId());
        byte[] data = UserController.bytes(file);
        String publicId = "media/user" + user.getId() + "/" + UUID.randomUUID();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(storage.storeImage(publicId, data, false), "Uploaded"));
    }
}
