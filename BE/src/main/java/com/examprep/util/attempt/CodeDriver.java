package com.examprep.util.attempt;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Function-mode CODE questions: the manager's template is a whole program with one region marked
 * off by a {@code STUDENT CODE START} line and a {@code STUDENT CODE END} line. Students get and
 * write only that region; the code around it (the driver: reading stdin, calling the function,
 * printing the result) stays on the server and is joined back around their code before it runs.
 * A template without the markers is a plain starter program the student writes whole.
 */
public final class CodeDriver {
    private static final Pattern START = Pattern.compile("(?m)^[^\\n]*STUDENT CODE START[^\\n]*$");
    private static final Pattern END = Pattern.compile("(?m)^[^\\n]*STUDENT CODE END[^\\n]*$");
    /** "Main.java:12:", "main.c:12:5:", "main.cpp:12:" — gcc/javac locations. */
    private static final Pattern FILE_LINE = Pattern.compile("(\\b\\w+\\.(?:java|c|cpp|py):)(\\d+)");
    /** Python tracebacks: {@code File "main.py", line 12}. */
    private static final Pattern PY_LINE = Pattern.compile("(File \"[^\"]*\", line )(\\d+)");

    private CodeDriver() {}

    /** Driver code before the student's region (start marker included) and after it (end marker included). */
    public record Parts(String prefix, String body, String suffix) {
        int prefixLines() {
            return countLines(prefix);
        }
    }

    /** The program to run and how many driver lines sit above the student's code. */
    public record Program(String source, int lineOffset, int studentLines) {}

    /** Null when the template has no (well-ordered) markers. */
    public static Parts split(String template) {
        if (template == null) {
            return null;
        }
        Matcher start = START.matcher(template);
        if (!start.find()) {
            return null;
        }
        int bodyStart = start.end();
        if (template.startsWith("\r\n", bodyStart)) {
            bodyStart += 2;
        } else if (bodyStart < template.length() && template.charAt(bodyStart) == '\n') {
            bodyStart += 1;
        }
        Matcher end = END.matcher(template);
        if (!end.find(bodyStart)) {
            return null;
        }
        return new Parts(template.substring(0, bodyStart), template.substring(bodyStart, end.start()),
                template.substring(end.start()));
    }

    public static boolean hasDriver(String template) {
        return split(template) != null;
    }

    /** What a student is shown: the marked region, or the whole template without markers. */
    public static String studentTemplate(String template) {
        Parts parts = split(template);
        return parts == null ? template : parts.body();
    }

    /**
     * The program for the sandbox: the question's driver around the student's code. Code that is
     * already a whole program (no driver on the question, or the student sent the markers) runs as is.
     */
    public static Program program(String template, String studentSource) {
        Parts parts = split(template);
        String source = studentSource == null ? "" : studentSource;
        if (parts == null || split(source) != null) {
            return new Program(source, 0, Integer.MAX_VALUE);
        }
        String sep = source.isEmpty() || source.endsWith("\n") ? "" : "\n";
        return new Program(parts.prefix() + source + sep + parts.suffix(), parts.prefixLines(), countLines(source + sep));
    }

    /**
     * Compiler/runtime messages with line numbers counted in the student's code. Lines inside the
     * driver are left as they are.
     */
    public static String studentLines(String output, Program program) {
        if (output == null || program.lineOffset() == 0) {
            return output;
        }
        return shift(PY_LINE, shift(FILE_LINE, output, program), program);
    }

    private static String shift(Pattern pattern, String text, Program program) {
        Matcher m = pattern.matcher(text);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            int line;
            try {
                line = Integer.parseInt(m.group(2));
            } catch (NumberFormatException ex) {
                continue;
            }
            int own = line - program.lineOffset();
            String replacement = own >= 1 && own <= program.studentLines() ? m.group(1) + own : m.group(0);
            m.appendReplacement(out, Matcher.quoteReplacement(replacement));
        }
        m.appendTail(out);
        return out.toString();
    }

    private static int countLines(String text) {
        int n = 0;
        for (int i = 0; i < text.length(); i++) {
            if (text.charAt(i) == '\n') {
                n++;
            }
        }
        return n;
    }
}
