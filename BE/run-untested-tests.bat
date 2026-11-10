@echo off
REM Runs the new unit tests written for the 32 untested cases of Report 5.1 (H2, safe).
cd /d "%~dp0"
call mvn test -Dmaven.test.failure.ignore=true -Dsurefire.failIfNoSpecifiedTests=false -Dtest=UnitTestGapApiIntegrationTest,AttemptGraderFillBlankTest,PasswordResetMailServiceTest
REM Template generator case (UTC1225): regenerates src/main/resources/templates/import from docs/import/template-v2.txt
call mvn test -Dmaven.test.failure.ignore=true -Dsurefire.failIfNoSpecifiedTests=false -Dtest=TemplateGeneratorTest -DgenerateTemplates=true
echo.
echo Done. Results are in target\surefire-reports
pause
