/**
 * CODE question templates in "function mode": the manager's template is a whole program with one
 * region marked off for the student. Students get and edit only that region; the BE keeps the code
 * around it (the driver: imports, reading stdin, calling the function, printing) and runs their
 * code inside it. A template without the markers is a plain starter program the student edits whole.
 */

const START_RE = /^[^\n]*STUDENT CODE START[^\n]*$/m;
const END_RE = /^[^\n]*STUDENT CODE END[^\n]*$/m;

export interface TemplateParts {
  /** Everything up to and including the start marker line, with its line break. */
  prefix: string;
  /** What the student edits. */
  body: string;
  /** The end marker line and everything after it. */
  suffix: string;
}

/** Splits a program on its markers; null when it has none (or they are out of order). */
export function splitTemplate(source: string | null | undefined): TemplateParts | null {
  if (!source) return null;
  const start = START_RE.exec(source);
  if (!start) return null;
  let bodyStart = start.index + start[0].length;
  if (source.startsWith('\r\n', bodyStart)) bodyStart += 2;
  else if (source[bodyStart] === '\n') bodyStart += 1;
  const rest = source.slice(bodyStart);
  const end = END_RE.exec(rest);
  if (!end) return null;
  return { prefix: source.slice(0, bodyStart), body: rest.slice(0, end.index), suffix: rest.slice(end.index) };
}

/** The student's own code in a saved answer: the marked region, or the whole program without markers. */
export function studentCodeOf(source: string): string {
  return splitTemplate(source)?.body ?? source;
}

const MARK = (comment: string) => ({
  start: `${comment} ==== STUDENT CODE START ====`,
  end: `${comment} ==== STUDENT CODE END ====`,
});

/**
 * Sample function-mode template per language: the student writes `solve`, the driver reads two
 * integers from stdin and prints the result. Managers replace the signature and the driver.
 */
export const DEFAULT_CODE_TEMPLATES: Record<string, string> = {
  JAVA: [
    'import java.util.*;',
    '',
    'public class Main {',
    '    public static void main(String[] args) {',
    '        Scanner sc = new Scanner(System.in);',
    '        int a = sc.nextInt();',
    '        int b = sc.nextInt();',
    '        System.out.println(new Solution().solve(a, b));',
    '    }',
    '}',
    '',
    MARK('//').start,
    'class Solution {',
    '    public int solve(int a, int b) {',
    '        // a and b are already read from the input; return the answer',
    '        return 0;',
    '    }',
    '}',
    MARK('//').end,
    '',
  ].join('\n'),
  PYTHON: [
    MARK('#').start,
    'def solve(a: int, b: int) -> int:',
    '    # a and b are already read from the input; return the answer',
    '    return 0',
    MARK('#').end,
    '',
    '',
    'if __name__ == "__main__":',
    '    a, b = map(int, input().split())',
    '    print(solve(a, b))',
    '',
  ].join('\n'),
  C: [
    '#include <stdio.h>',
    '',
    MARK('//').start,
    'int solve(int a, int b) {',
    '    // a and b are already read from the input; return the answer',
    '    return 0;',
    '}',
    MARK('//').end,
    '',
    'int main(void) {',
    '    int a, b;',
    '    if (scanf("%d %d", &a, &b) != 2) return 0;',
    '    printf("%d\\n", solve(a, b));',
    '    return 0;',
    '}',
    '',
  ].join('\n'),
  CPP: [
    '#include <bits/stdc++.h>',
    'using namespace std;',
    '',
    MARK('//').start,
    'class Solution {',
    'public:',
    '    int solve(int a, int b) {',
    '        // a and b are already read from the input; return the answer',
    '        return 0;',
    '    }',
    '};',
    MARK('//').end,
    '',
    'int main() {',
    '    int a, b;',
    '    if (!(cin >> a >> b)) return 0;',
    '    cout << Solution().solve(a, b) << endl;',
    '    return 0;',
    '}',
    '',
  ].join('\n'),
};

export const defaultCodeTemplate = (language: string | undefined): string =>
  (language && DEFAULT_CODE_TEMPLATES[language]) || '';

/** True when the template is empty or still one of the samples, so switching language may replace it. */
export const isDefaultCodeTemplate = (template: string): boolean =>
  template.trim() === '' || Object.values(DEFAULT_CODE_TEMPLATES).some(t => t.trim() === template.trim());
