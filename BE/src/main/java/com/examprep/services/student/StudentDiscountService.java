package com.examprep.services.student;

import com.examprep.dto.student.StudentDiscountDtos;
import org.springframework.data.domain.Page;

public interface StudentDiscountService {
    Page<StudentDiscountDtos.StudentDiscountItemDto> listStudentDiscounts(Long userId, String status, String sourceType, int page, int size);
    StudentDiscountDtos.StudentDiscountDetailDto getStudentDiscountDetail(Long userId, Long userDiscountId);
}
