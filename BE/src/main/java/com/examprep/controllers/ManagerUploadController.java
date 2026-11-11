package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.security.UserPrincipal;
import com.examprep.services.MaterialStorage;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

/** D3: image upload for question/exam content, and for students (flashcard faces, question report attachments).
 *  Returns a public URL the editor embeds; nothing is stored in the DB. SecurityConfig guards each prefix by role. */
@RestController
@RequestMapping({"/api/v1/manager/uploads", "/api/v1/student/uploads"})
@RequiredArgsConstructor
@Tag(name = "Manager Uploads", description = "D3: media upload to Cloudinary")
public class ManagerUploadController {
    private final MaterialStorage storage;

    // ponytail: no DB record, so images dropped from a draft stay on Cloudinary; add a media table if storage cost matters.
    @PostMapping(consumes = "multipart/form-data")
    @Operation(summary = "D3: Upload an image (JPG/PNG/WEBP/GIF, max 5MB) and get its public URL")
    public ResponseEntity<ApiResponse<MaterialStorage.StoredImage>> upload(@AuthenticationPrincipal UserPrincipal user,
            @RequestParam MultipartFile file) {
        String publicId = "media/user" + user.getId() + "/" + UUID.randomUUID();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(storage.storeImage(publicId, UserController.bytes(file), false), "Uploaded"));
    }
}
