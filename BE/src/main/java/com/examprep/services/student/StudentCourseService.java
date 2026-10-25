package com.examprep.services.student;

import com.examprep.dto.student.*;
import org.springframework.data.domain.Page;

import java.util.List;

public interface StudentCourseService {
    Page<CourseCardDto> listCourses(Long categoryId, String keyword, String sort, int page, int size, Long userId);
    CourseDetailDto getCourseDetail(Long courseId, Long userId);
    Page<MyCourseDto> listMyCourses(String status, int page, int size, Long userId);
    Page<CourseExamDto> listCourseExams(Long courseId, String sort, int page, int size, Long userId);
    List<DeckDto> listCourseDecks(Long courseId, Long userId);
    Page<CardDto> listDeckCards(Long deckId, int page, int size, Long userId);
}
