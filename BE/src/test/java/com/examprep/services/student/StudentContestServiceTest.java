package com.examprep.services.student;

import com.examprep.entities.Contest;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import com.examprep.services.AttemptPaperFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StudentContestServiceTest {

    @Mock
    private ContestRepository contestRepository;
    @Mock
    private ContestParticipantRepository participantRepository;
    @Mock
    private ContestRewardRepository rewardRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private ExamAttemptRepository examAttemptRepository;
    @Mock
    private ExamQuestionRepository examQuestionRepository;
    @Mock
    private AttemptPaperFactory attemptPaperFactory;

    @InjectMocks
    private StudentContestServiceImpl contestService;

    @Test
    void registerContest_notFound() {
        when(contestRepository.findById(1L)).thenReturn(Optional.empty());
        assertThrows(ResourceNotFoundException.class, () -> contestService.registerContest(1L, 10L));
    }

    @Test
    void registerContest_alreadyStarted() {
        Contest contest = Contest.builder()
                .contestId(1L)
                .startTime(Instant.now().minusSeconds(100))
                .build();
        when(contestRepository.findById(1L)).thenReturn(Optional.of(contest));
        assertThrows(BaseException.class, () -> contestService.registerContest(1L, 10L));
    }
}
