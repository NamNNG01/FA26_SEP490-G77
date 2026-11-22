package com.examprep.services;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Smoke test against a real self-hosted Piston (BE/piston/). Skipped unless PISTON_LIVE_URL is set:
 * PISTON_LIVE_URL=http://localhost:2000/api/v2 mvn test -Dtest=PistonLiveSmokeTest
 */
@EnabledIfEnvironmentVariable(named = "PISTON_LIVE_URL", matches = ".+")
class PistonLiveSmokeTest {

    private final PistonClient piston = new PistonClient(System.getenv("PISTON_LIVE_URL"), "", 8);

    private static final Map<String, String> REVERSE = Map.of(
            "JAVA", """
                    import java.util.Scanner;
                    public class Solution {
                        public static void main(String[] a) {
                            System.out.println(new StringBuilder(new Scanner(System.in).nextLine()).reverse());
                        }
                    }""",
            "PYTHON", "print(input()[::-1])",
            "C", """
                    #include <stdio.h>
                    #include <string.h>
                    int main(){char s[100];scanf("%s",s);for(int i=strlen(s)-1;i>=0;i--)putchar(s[i]);puts("");}""",
            "CPP", """
                    #include <bits/stdc++.h>
                    int main(){std::string s;std::cin>>s;std::reverse(s.begin(),s.end());std::cout<<s<<"\\n";}""");

    @Test
    void everyLanguageJudgesAllFixtures() {
        List<PistonClient.CaseInput> cases = List.of(
                new PistonClient.CaseInput(1L, "abc", "cba"),
                new PistonClient.CaseInput(2L, "hello", "olleh"),
                new PistonClient.CaseInput(3L, "xy", "wrong"));
        REVERSE.forEach((language, source) -> {
            List<PistonClient.CaseOutcome> outcomes = piston.judge(language, source, cases, 5_000, 262_144);
            assertTrue(outcomes.get(0).passed(), language + ": " + outcomes.get(0));
            assertTrue(outcomes.get(1).passed(), language + ": " + outcomes.get(1));
            assertFalse(outcomes.get(2).passed(), language);
        });
    }

    @Test
    void compileErrorTimeoutRuntimeErrorAndNetworkAllFail() {
        assertEquals("FAILED", piston.run("JAVA", "public class A { int x = ; }", "", 5_000, 0).status());
        PistonClient.RunOutcome loop = piston.run("PYTHON", "while True: pass", "", 2_000, 0);
        assertEquals("FAILED", loop.status());
        assertEquals("FAILED", piston.run("PYTHON", "raise SystemExit(3)", "", 2_000, 0).status());
        PistonClient.RunOutcome net = piston.run("PYTHON", """
                import urllib.request
                urllib.request.urlopen('http://example.com', timeout=3)""", "", 5_000, 0);
        assertEquals("FAILED", net.status(), "network must be blocked: " + net);
    }

    @Test
    void runtimeVersionsComeFromTheEngine() {
        assertEquals(Map.of("JAVA", "15.0.2", "PYTHON", "3.12.0", "C", "10.2.0", "CPP", "10.2.0"),
                piston.runtimeVersions());
    }
}
