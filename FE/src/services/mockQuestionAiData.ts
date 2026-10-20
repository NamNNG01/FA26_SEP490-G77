import type {
  AnswerOption,
  QuestionAiDraft,
  QuestionAiDraftResponse,
  QuestionAiGenerateRequest,
  QuestionAiPreview,
  QuestionDifficulty,
  QuestionType,
} from './question.service';

/**
 * Demo data for AI-01 (POST /manager/exams/ai/generate), used when
 * VITE_AI_MOCK=true so trying the UI spends no AI quota. Questions are built from
 * per-type templates and mention the requested topic, so a demo reads
 * naturally for any topic the manager types.
 */

type Lang = 'vi' | 'en';

const t = (lang: Lang, vi: string, en: string) => (lang === 'vi' ? vi : en);

const opts = (texts: string[], correct: number[]): AnswerOption[] =>
  texts.map((optionText, i) => ({ optionText, isCorrect: correct.includes(i), orderIndex: i }));

/**
 * `n` options (default 4) keeping every correct one, rotated by `shift` so
 * the key isn't always A. Correct answers that don't fit are dropped last.
 */
function fitOptions(all: { text: string; correct: boolean }[], n = 4, shift = 0): AnswerOption[] {
  const correct = all.filter(o => o.correct).slice(0, Math.max(1, n - 1));
  const wrong = all.filter(o => !o.correct).slice(0, n - correct.length);
  const list = [...correct, ...wrong];
  const s = shift % list.length;
  const rotated = [...list.slice(s), ...list.slice(0, s)];
  return opts(rotated.map(o => o.text), rotated.flatMap((o, i) => (o.correct ? [i] : [])));
}

type Builder = (topic: string, lang: Lang, i: number, optionsCount?: number) => Omit<QuestionAiDraft, 'questionType' | 'difficulty'>;

const SINGLE: Builder[] = [
  (topic, lang, i, n) => ({
    content: t(lang, `Phát biểu nào mô tả đúng nhất mục đích chính của "${topic}"?`, `Which statement best describes the main purpose of "${topic}"?`),
    options: fitOptions([
      { text: t(lang, 'Tái sử dụng và tổ chức mã nguồn rõ ràng hơn', 'Reuse and organise code more clearly'), correct: true },
      { text: t(lang, 'Tăng tốc độ biên dịch chương trình', 'Make the program compile faster'), correct: false },
      { text: t(lang, 'Giảm dung lượng bộ nhớ của hệ điều hành', 'Reduce the operating system’s memory use'), correct: false },
      { text: t(lang, 'Thay thế hoàn toàn việc kiểm thử', 'Replace testing entirely'), correct: false },
      { text: t(lang, 'Mã hoá dữ liệu khi truyền qua mạng', 'Encrypt data sent over the network'), correct: false },
      { text: t(lang, 'Tự động sinh giao diện người dùng', 'Generate the user interface automatically'), correct: false },
    ], n, i + 1),
    explanation: t(lang, `Mục tiêu cốt lõi của ${topic} là giúp mã dễ tái sử dụng và dễ bảo trì.`, `The core goal of ${topic} is code that is easier to reuse and maintain.`),
  }),
  (topic, lang, i, n) => ({
    content: t(lang, `Khi áp dụng "${topic}", lỗi nào sau đây thường gặp nhất?`, `When applying "${topic}", which mistake is the most common?`),
    options: fitOptions([
      { text: t(lang, 'Lạm dụng khiến thiết kế phức tạp không cần thiết', 'Overusing it, making the design needlessly complex'), correct: true },
      { text: t(lang, 'Đặt tên biến quá ngắn', 'Using variable names that are too short'), correct: false },
      { text: t(lang, 'Viết quá nhiều chú thích', 'Writing too many comments'), correct: false },
      { text: t(lang, 'Dùng sai kiểu dữ liệu số nguyên', 'Using the wrong integer type'), correct: false },
      { text: t(lang, 'Không dùng hệ quản trị phiên bản', 'Not using version control'), correct: false },
      { text: t(lang, 'Thụt lề không nhất quán', 'Inconsistent indentation'), correct: false },
    ], n, i + 1),
    explanation: t(lang, 'Áp dụng quá mức làm tăng độ phức tạp mà không mang lại lợi ích tương xứng.', 'Overuse adds complexity without a matching benefit.'),
  }),
  (topic, lang, i, n) => ({
    content: t(lang, `Trong ngữ cảnh "${topic}", khái niệm nào là nền tảng cần nắm đầu tiên?`, `In the context of "${topic}", which concept should be understood first?`),
    options: fitOptions([
      { text: t(lang, 'Định nghĩa và phạm vi áp dụng', 'Its definition and scope'), correct: true },
      { text: t(lang, 'Lịch sử ra đời của ngôn ngữ', 'The history of the language'), correct: false },
      { text: t(lang, 'Cấu hình phần cứng tối thiểu', 'Minimum hardware requirements'), correct: false },
      { text: t(lang, 'Cách cài đặt IDE', 'How to install the IDE'), correct: false },
      { text: t(lang, 'Giấy phép mã nguồn mở', 'Open-source licensing'), correct: false },
      { text: t(lang, 'Quy trình triển khai lên cloud', 'Cloud deployment pipeline'), correct: false },
    ], n, i + 1),
    explanation: t(lang, 'Hiểu định nghĩa và phạm vi giúp vận dụng đúng các khái niệm phía sau.', 'Knowing the definition and scope makes the later concepts easier to apply.'),
  }),
];

const MULTIPLE: Builder[] = [
  (topic, lang, i, n) => ({
    content: t(lang, `Chọn TẤT CẢ các lợi ích của "${topic}".`, `Select ALL the benefits of "${topic}".`),
    options: fitOptions([
      { text: t(lang, 'Giảm trùng lặp mã', 'Less duplicated code'), correct: true },
      { text: t(lang, 'Dễ mở rộng tính năng', 'Easier to extend'), correct: true },
      { text: t(lang, 'Luôn chạy nhanh hơn', 'Always runs faster'), correct: false },
      { text: t(lang, 'Không cần kiểm thử', 'No testing needed'), correct: false },
      { text: t(lang, 'Dễ bảo trì hơn', 'Easier to maintain'), correct: true },
      { text: t(lang, 'Loại bỏ mọi lỗi runtime', 'Removes every runtime error'), correct: false },
    ], n, i + 1),
    explanation: t(lang, 'Lợi ích chính là giảm trùng lặp, dễ mở rộng và dễ bảo trì; hiệu năng không được đảm bảo.', 'The benefits are less duplication, extensibility and maintainability; speed is not guaranteed.'),
  }),
  (topic, lang, i, n) => ({
    content: t(lang, `Những phát biểu nào về "${topic}" là ĐÚNG?`, `Which statements about "${topic}" are TRUE?`),
    options: fitOptions([
      { text: t(lang, 'Có thể kết hợp với các nguyên lý thiết kế khác', 'It can be combined with other design principles'), correct: true },
      { text: t(lang, 'Chỉ dùng được trong Java', 'It only works in Java'), correct: false },
      { text: t(lang, 'Cần cân nhắc đánh đổi khi áp dụng', 'Applying it involves trade-offs'), correct: true },
      { text: t(lang, 'Bắt buộc với mọi dự án', 'It is mandatory in every project'), correct: false },
      { text: t(lang, 'Không liên quan đến kiểm thử', 'It has nothing to do with testing'), correct: false },
      { text: t(lang, 'Làm tăng dung lượng file thực thi gấp đôi', 'It doubles the executable size'), correct: false },
    ], n, i + 1),
    explanation: t(lang, 'Không có kỹ thuật nào là bắt buộc hay giới hạn trong một ngôn ngữ; luôn có đánh đổi.', 'No technique is mandatory or tied to one language; there are always trade-offs.'),
  }),
];

const TRUE_FALSE: Builder[] = [
  (topic, lang) => ({
    content: t(lang, `"${topic}" giúp giảm sự phụ thuộc chặt chẽ giữa các thành phần.`, `"${topic}" helps reduce tight coupling between components.`),
    options: opts([t(lang, 'True', 'True'), t(lang, 'False', 'False')], [0]),
    explanation: t(lang, 'Áp dụng đúng giúp các thành phần ít phụ thuộc trực tiếp vào nhau.', 'Applied well, components depend on each other less directly.'),
  }),
  (topic, lang) => ({
    content: t(lang, `Áp dụng "${topic}" luôn làm chương trình chạy nhanh hơn.`, `Applying "${topic}" always makes a program run faster.`),
    options: opts(['True', 'False'], [1]),
    explanation: t(lang, 'Tính đúng đắn và khả năng bảo trì mới là mục tiêu, không phải tốc độ.', 'Correctness and maintainability are the goal, not speed.'),
  }),
];

const MATCHING: Builder[] = [
  (topic, lang) => ({
    content: t(lang, `Ghép mỗi thuật ngữ trong "${topic}" với mô tả phù hợp.`, `Match each "${topic}" term with its description.`),
    options: [],
    answerKey: {
      pairs: lang === 'vi'
        ? [
          { left: 'Encapsulation', right: 'Che giấu dữ liệu bên trong đối tượng' },
          { left: 'Inheritance', right: 'Lớp con kế thừa thuộc tính lớp cha' },
          { left: 'Polymorphism', right: 'Cùng lời gọi, nhiều cách thực thi' },
          { left: 'Abstraction', right: 'Chỉ lộ ra những gì cần thiết' },
        ]
        : [
          { left: 'Encapsulation', right: 'Hiding data inside an object' },
          { left: 'Inheritance', right: 'A subclass reuses its parent’s members' },
          { left: 'Polymorphism', right: 'One call, many implementations' },
          { left: 'Abstraction', right: 'Expose only what is needed' },
        ],
    },
    explanation: t(lang, 'Bốn trụ cột cơ bản và ý nghĩa của từng trụ cột.', 'The four core pillars and what each one means.'),
  }),
  (topic, lang) => ({
    content: t(lang, `Ghép mỗi nguyên lý SOLID liên quan tới "${topic}" với ý nghĩa của nó.`, `Match each SOLID principle related to "${topic}" with its meaning.`),
    options: [],
    answerKey: {
      pairs: lang === 'vi'
        ? [
          { left: 'Single Responsibility', right: 'Mỗi lớp chỉ có một lý do để thay đổi' },
          { left: 'Open/Closed', right: 'Mở để mở rộng, đóng để sửa đổi' },
          { left: 'Liskov Substitution', right: 'Lớp con thay thế được lớp cha' },
          { left: 'Dependency Inversion', right: 'Phụ thuộc vào abstraction, không vào cài đặt cụ thể' },
        ]
        : [
          { left: 'Single Responsibility', right: 'A class has one reason to change' },
          { left: 'Open/Closed', right: 'Open for extension, closed for modification' },
          { left: 'Liskov Substitution', right: 'Subclasses can stand in for their parent' },
          { left: 'Dependency Inversion', right: 'Depend on abstractions, not concretions' },
        ],
    },
    explanation: t(lang, 'Các nguyên lý SOLID giúp thiết kế hướng đối tượng dễ bảo trì.', 'SOLID keeps object-oriented designs maintainable.'),
  }),
];

const FILL_BLANK: Builder[] = [
  (topic, lang) => ({
    content: t(lang, `Trong "${topic}", từ khoá {{1}} được dùng để một lớp kế thừa lớp khác trong Java.`, `In "${topic}", the {{1}} keyword lets one Java class inherit from another.`),
    options: [],
    answerKey: { blanks: [{ index: 1, accepted: ['extends'], caseSensitive: true }] },
    explanation: t(lang, 'Java dùng `extends` cho kế thừa lớp và `implements` cho interface.', 'Java uses `extends` for classes and `implements` for interfaces.'),
  }),
  (topic, lang) => ({
    content: t(lang, `Phương thức ở lớp con có cùng chữ ký với lớp cha gọi là {{1}}, còn cùng tên khác tham số gọi là {{2}}.`, `A subclass method with the parent’s exact signature is called {{1}}; same name with different parameters is {{2}}.`),
    options: [],
    answerKey: {
      blanks: [
        { index: 1, accepted: ['overriding', 'override', 'ghi đè'], caseSensitive: false },
        { index: 2, accepted: ['overloading', 'overload', 'nạp chồng'], caseSensitive: false },
      ],
    },
    explanation: t(lang, `Hai khái niệm thường bị nhầm khi học ${topic}.`, `Two concepts often confused when learning ${topic}.`),
  }),
];

const ESSAY: Builder[] = [
  (topic, lang) => ({
    content: t(lang, `Trình bày ưu và nhược điểm của "${topic}". Cho một ví dụ thực tế minh hoạ.`, `Discuss the advantages and drawbacks of "${topic}". Give a real-world example.`),
    options: [],
    explanation: t(lang, 'Bài tốt nêu ít nhất 2 ưu điểm, 2 nhược điểm và một ví dụ cụ thể.', 'A good answer gives at least two pros, two cons and a concrete example.'),
    essayGradingRubric: {
      criteria: [
        { name: t(lang, 'Ưu điểm', 'Advantages'), maxScore: 3, description: t(lang, 'Nêu và giải thích ít nhất 2 ưu điểm', 'States and explains at least two advantages') },
        { name: t(lang, 'Nhược điểm', 'Drawbacks'), maxScore: 3, description: t(lang, 'Nêu và giải thích ít nhất 2 nhược điểm', 'States and explains at least two drawbacks') },
        { name: t(lang, 'Ví dụ', 'Example'), maxScore: 3, description: t(lang, 'Ví dụ thực tế, đúng ngữ cảnh', 'A relevant real-world example') },
        { name: t(lang, 'Trình bày', 'Clarity'), maxScore: 1, description: t(lang, 'Mạch lạc, đúng thuật ngữ', 'Clear and uses correct terms') },
      ],
    },
  }),
  (topic, lang) => ({
    content: t(lang, `So sánh "${topic}" với một cách tiếp cận thay thế. Khi nào nên chọn cách nào?`, `Compare "${topic}" with an alternative approach. When would you choose each?`),
    options: [],
    explanation: t(lang, 'Cần nêu tiêu chí so sánh và tình huống áp dụng cụ thể.', 'The answer should name comparison criteria and concrete situations.'),
    essayGradingRubric: {
      criteria: [
        { name: t(lang, 'Tiêu chí so sánh', 'Comparison criteria'), maxScore: 4, description: t(lang, 'Ít nhất 3 tiêu chí rõ ràng', 'At least three clear criteria') },
        { name: t(lang, 'Tình huống áp dụng', 'When to use'), maxScore: 4, description: t(lang, 'Tình huống hợp lý cho mỗi cách', 'A sensible situation for each approach') },
        { name: t(lang, 'Lập luận', 'Reasoning'), maxScore: 2, description: t(lang, 'Lập luận chặt chẽ', 'Sound reasoning') },
      ],
    },
  }),
];

const DIAGRAM: Builder[] = [
  (topic, lang) => ({
    content: t(lang, `Vẽ class diagram cho hệ thống quản lý thư viện gồm Book và Library (chủ đề: ${topic}).`, `Draw a class diagram for a library system with Book and Library (topic: ${topic}).`),
    options: [],
    explanation: t(lang, 'Book có title, author; Library chứa danh sách Book (quan hệ aggregation).', 'Book has title and author; Library holds a list of Books (aggregation).'),
    questionMetadata: {
      diagramType: 'CLASS',
      plantUmlSource: '@startuml\nclass Book {\n  +title: String\n  +author: String\n}\nclass Library {\n  +books: List<Book>\n  +addBook(b: Book)\n}\nLibrary o-- "0..*" Book\n@enduml',
    },
  }),
  (topic, lang) => ({
    content: t(lang, `Vẽ class diagram thể hiện kế thừa: Animal là lớp cha của Dog và Cat (chủ đề: ${topic}).`, `Draw a class diagram showing inheritance: Animal is the parent of Dog and Cat (topic: ${topic}).`),
    options: [],
    explanation: t(lang, 'Dog và Cat kế thừa Animal và ghi đè makeSound().', 'Dog and Cat extend Animal and override makeSound().'),
    questionMetadata: {
      diagramType: 'CLASS',
      plantUmlSource: '@startuml\nabstract class Animal {\n  #name: String\n  +{abstract} makeSound(): void\n}\nclass Dog {\n  +makeSound(): void\n}\nclass Cat {\n  +makeSound(): void\n}\nAnimal <|-- Dog\nAnimal <|-- Cat\n@enduml',
    },
  }),
  (topic, lang) => ({
    content: t(lang, `Vẽ sequence diagram cho luồng đăng nhập: User → LoginController → AuthService (chủ đề: ${topic}).`, `Draw a sequence diagram for login: User → LoginController → AuthService (topic: ${topic}).`),
    options: [],
    explanation: t(lang, 'Controller nhận yêu cầu, gọi AuthService xác thực rồi trả token.', 'The controller takes the request, asks AuthService to verify, then returns a token.'),
    questionMetadata: {
      diagramType: 'SEQUENCE',
      plantUmlSource: '@startuml\nactor User\nUser -> LoginController: login(email, password)\nLoginController -> AuthService: authenticate()\nAuthService --> LoginController: token\nLoginController --> User: 200 OK + token\n@enduml',
    },
  }),
];

const BUILDERS: Partial<Record<QuestionType, Builder[]>> = {
  SINGLE_CHOICE: SINGLE,
  MULTIPLE_CHOICE: MULTIPLE,
  TRUE_FALSE: TRUE_FALSE,
  MATCHING,
  FILL_BLANK,
  ESSAY,
  DIAGRAM,
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' }));
    });
  });

/** Mock AI generation: same request/response shape as the backend, with a short "thinking" delay. */
export async function mockGenerateAiQuestions(req: QuestionAiGenerateRequest, signal?: AbortSignal): Promise<QuestionAiDraftResponse> {
  await sleep(800 + Math.random() * 1200, signal);

  const lang: Lang = req.language === 'Vietnamese' ? 'vi' : 'en';
  const topic = req.topic?.trim() || t(lang, 'chủ đề', 'the topic');
  // Hand out the requested difficulties in order, one per question.
  const difficulties = (Object.entries(req.difficultyCounts) as [QuestionDifficulty, number][]).flatMap(([d, n]) => Array<QuestionDifficulty>(n).fill(d));

  const questions: QuestionAiPreview[] = [];
  (Object.entries(req.questionTypeCounts) as [QuestionType, number][]).forEach(([questionType, count]) => {
    const builders = BUILDERS[questionType] ?? SINGLE;
    // Random starting template and answer position, so "Regenerate" (count 1) gives something new.
    const start = Math.floor(Math.random() * builders.length * 4);
    for (let i = 0; i < count; i++) {
      const built = builders[(start + i) % builders.length](topic, lang, start + i);
      // Repeat templates get a numbered variant so the list doesn't look duplicated.
      const round = Math.floor(i / builders.length);
      const content = round > 0 ? `${built.content} (${t(lang, 'biến thể', 'variant')} ${round + 1})` : built.content;
      const difficulty = difficulties[questions.length] ?? 'MEDIUM';
      questions.push({ question: { ...built, content, questionType, difficulty }, hasHashConflict: false, validationError: null });
    }
  });

  // Like the real backend, flag a draft that fails validation instead of dropping it.
  const last = questions[questions.length - 1];
  if (questions.length >= 4 && last.question.questionType === 'SINGLE_CHOICE') {
    last.question = { ...last.question, options: last.question.options.map(o => ({ ...o, isCorrect: false })) };
    last.validationError = 'Question validation failed';
  }
  return { questions, warnings: [] };
}
