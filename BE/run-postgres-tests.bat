@echo off
REM PostgreSQL-only cases of Report 5.1 (UTC372, 373, 1264-1269, 1441, 1442, 1505).
REM Runs against a LOCAL PostgreSQL database, not the team Supabase project.
REM Change the 3 values below if your local database uses other settings.
set SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5433/prepexam_test
set SPRING_DATASOURCE_USERNAME=postgres
set SPRING_DATASOURCE_PASSWORD=postgres
cd /d "%~dp0"
echo Using %SPRING_DATASOURCE_URL%
call mvn test -Dmaven.test.failure.ignore=true -Dsurefire.failIfNoSpecifiedTests=false -DpostgresTests=true -Dtest="ManagerCourseConcurrencyPostgresTest,ManagerCoursePostgresIntegrationTest#questionMetadataRoundTripsAsJsonRatherThanVarchar+rawDeletesCannotCascadeAwayLegacyLessonsOrExamHistory+protectedForeignKeysRestrictDeletionIncludingRenamedExamConfigsAndLegacyLessons,ExamPostgresIntegrationTest#rubricAndMetadataRoundTripAsJsonb,StudentAttemptConcurrencyPostgresTest"
echo.
echo Done. Results are in target\surefire-reports
pause
