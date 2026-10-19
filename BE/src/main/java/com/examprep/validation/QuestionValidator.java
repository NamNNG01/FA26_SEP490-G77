package com.examprep.validation;

import com.examprep.exceptions.BadRequestException;
import org.owasp.html.HtmlPolicyBuilder;
import org.owasp.html.PolicyFactory;
import org.springframework.stereotype.Component;

@Component
public class QuestionValidator {

    private static final PolicyFactory SANITIZER = new HtmlPolicyBuilder()
            .allowElements("b", "i", "u", "strong", "em", "p", "br", "ul", "ol", "li", "span", "code", "pre", "sub", "sup")
            .allowAttributes("class").onElements("span", "code", "pre")
            .toFactory();

    public String sanitize(String input) {
        if (input == null) return null;
        return SANITIZER.sanitize(input);
    }

    public void validateQuestionType(String questionType) {
        if (questionType == null) {
            throw new BadRequestException("Question type is required");
        }
        if (questionType.equals("CODE") || questionType.equals("DIAGRAM")) {
            throw new BadRequestException("Question type not supported yet");
        }
        if (!questionType.matches("SINGLE_CHOICE|MULTIPLE_CHOICE|TRUE_FALSE|MATCHING|FILL_BLANK|ESSAY")) {
            throw new BadRequestException("Invalid question type: " + questionType);
        }
    }
}
