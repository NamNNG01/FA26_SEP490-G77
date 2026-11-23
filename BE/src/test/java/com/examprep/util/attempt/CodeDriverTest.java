package com.examprep.util.attempt;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CodeDriverTest {
    private static final String PY = """
            import sys
            # ==== STUDENT CODE START ====
            def solve(a, b):
                return 0
            # ==== STUDENT CODE END ====

            a, b = map(int, input().split())
            print(solve(a, b))
            """;

    @Test
    void studentSeesOnlyTheMarkedRegion() {
        assertTrue(CodeDriver.hasDriver(PY));
        assertEquals("def solve(a, b):\n    return 0\n", CodeDriver.studentTemplate(PY));
    }

    @Test
    void templateWithoutMarkersIsAWholeProgram() {
        String plain = "print(input())\n";
        assertFalse(CodeDriver.hasDriver(plain));
        assertEquals(plain, CodeDriver.studentTemplate(plain));
        assertEquals(plain, CodeDriver.program(plain, plain).source());
        assertNull(CodeDriver.split("# STUDENT CODE END\n# STUDENT CODE START\n"));
    }

    @Test
    void driverIsJoinedAroundTheStudentsCode() {
        CodeDriver.Program program = CodeDriver.program(PY, "def solve(a, b):\n    return a + b");
        assertEquals("""
                import sys
                # ==== STUDENT CODE START ====
                def solve(a, b):
                    return a + b
                # ==== STUDENT CODE END ====

                a, b = map(int, input().split())
                print(solve(a, b))
                """, program.source());
        assertEquals(2, program.lineOffset());
    }

    @Test
    void codeThatAlreadyHasTheMarkersRunsAsIs() {
        String full = PY.replace("return 0", "return a + b");
        assertEquals(full, CodeDriver.program(PY, full).source());
    }

    @Test
    void errorLinesAreCountedInTheStudentsCode() {
        CodeDriver.Program program = CodeDriver.program(PY, "def solve(a, b):\n    return a +\n");
        assertEquals("File \"/piston/main.py\", line 2\n", CodeDriver.studentLines("File \"/piston/main.py\", line 4\n", program));
        assertEquals("main.c:2:5: error", CodeDriver.studentLines("main.c:4:5: error", program));
        // Line 8 is in the driver: left alone.
        assertEquals("File \"main.py\", line 8", CodeDriver.studentLines("File \"main.py\", line 8", program));
    }
}
