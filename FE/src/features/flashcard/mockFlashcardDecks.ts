import { MOCK_COURSES } from '@/features/module/mockModules';

/**
 * Mock flashcard decks for the Course Manager's Flashcard Management screen.
 * Stands in for the backend until the flashcard API exists — swap the import
 * in FlashcardManagementPage for a service call when it does.
 *
 * MOCK_FLASHCARD_DECKS and the card store are module-level, so edits written
 * through them outlive the page: saving on the detail page and returning to the
 * list shows the change (same pattern as public-exam/examStore).
 */

export type DeckStatus = 'Published' | 'Draft' | 'Archived';

export const DECK_STATUSES: DeckStatus[] = ['Published', 'Draft', 'Archived'];

export interface FlashcardDeck {
  id: string;
  name: string;
  courseId: string;
  /** Number of cards in the deck — kept in sync with the card store. */
  cards: number;
  creator: string;
  status: DeckStatus;
  description: string;
  /** ISO 8601 timestamp of the last modification. */
  updatedAt: string;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export const FLASHCARD_COURSES = MOCK_COURSES.map(c => ({ id: c.id as string, title: c.title }));

type CardSeed = [front: string, back: string];

/** Hand-written seed content per deck; the deck's card count is derived from it. */
const DECK_SEEDS: Record<string, { description: string; cards: CardSeed[] }> = {
  'FD-1024': {
    description: 'Core intuition behind gradient descent: the update rule, learning rate and the batch / mini-batch / stochastic variants.',
    cards: [
      ['What is gradient descent?', 'An iterative optimisation algorithm that moves parameters in the direction of the negative gradient to minimise a loss function.'],
      ['Write the gradient descent update rule.', 'θ ← θ − η · ∇J(θ), where η is the learning rate and ∇J(θ) the gradient of the loss.'],
      ['What happens if the learning rate is too large?', 'Updates overshoot the minimum; the loss oscillates or diverges.'],
      ['Batch vs. stochastic gradient descent?', 'Batch uses the whole dataset per update (stable, slow); stochastic uses one sample per update (noisy, fast).'],
      ['What is mini-batch gradient descent?', 'A compromise that computes each update on a small batch of samples, balancing noise and speed.'],
    ],
  },
  'FD-1023': {
    description: 'Understand under- and over-fitting through the lens of bias, variance and irreducible error.',
    cards: [
      ['What is bias in a model?', 'Error from overly simple assumptions; high bias causes underfitting.'],
      ['What is variance in a model?', 'Error from sensitivity to the training data; high variance causes overfitting.'],
      ['Decompose expected test error.', 'Bias² + Variance + Irreducible error.'],
      ['How does model complexity affect the tradeoff?', 'More complexity lowers bias but raises variance.'],
    ],
  },
  'FD-1022': {
    description: 'Quick reference for common activation functions, their ranges and typical use.',
    cards: [
      ['Formula of ReLU?', 'f(x) = max(0, x).'],
      ['Range of the sigmoid function?', '(0, 1) — useful for binary probabilities.'],
      ['Range of tanh?', '(−1, 1), zero-centred.'],
      ['What is the dying ReLU problem?', 'Neurons stuck outputting 0 for all inputs, so their gradients are always zero.'],
      ['When is softmax used?', 'In the output layer for multi-class classification, to turn logits into a probability distribution.'],
    ],
  },
  'FD-1021': {
    description: 'Walk through backpropagation from the chain rule to weight updates.',
    cards: [
      ['What is backpropagation?', 'An algorithm that computes gradients of the loss w.r.t. every weight by applying the chain rule backwards through the network.'],
      ['Which calculus rule powers backpropagation?', 'The chain rule.'],
      ['What is the vanishing gradient problem?', 'Gradients shrink as they flow backwards, so early layers learn very slowly.'],
      ['Order of a training step?', 'Forward pass → compute loss → backward pass → update weights.'],
    ],
  },
  'FD-1020': {
    description: 'Creating, selecting and filtering pandas DataFrames.',
    cards: [
      ['How do you read a CSV into a DataFrame?', 'pd.read_csv("file.csv")'],
      ['loc vs. iloc?', 'loc selects by label; iloc selects by integer position.'],
      ['How do you filter rows where age > 30?', 'df[df["age"] > 30]'],
      ['How do you count missing values per column?', 'df.isna().sum()'],
      ['What does df.groupby("col").mean() return?', 'The mean of each numeric column for every group in "col".'],
    ],
  },
  'FD-1019': {
    description: 'Key vocabulary for hypothesis testing: null/alternative hypotheses, p-values and significance.',
    cards: [
      ['What is the null hypothesis (H₀)?', 'The default claim of no effect or no difference.'],
      ['Define a p-value.', 'The probability of observing data at least as extreme as the sample, assuming H₀ is true.'],
      ['What is the significance level α?', 'The threshold probability for rejecting H₀, commonly 0.05.'],
      ['One-tailed vs. two-tailed test?', 'One-tailed tests an effect in one direction; two-tailed tests for an effect in either direction.'],
    ],
  },
  'FD-1018': {
    description: 'Compare L1 (Lasso) and L2 (Ridge) regularisation and when to use each.',
    cards: [
      ['What penalty does L1 add?', 'λ · Σ|w| — the sum of absolute weights.'],
      ['What penalty does L2 add?', 'λ · Σw² — the sum of squared weights.'],
      ['Which regularisation produces sparse weights?', 'L1, because it can drive weights exactly to zero.'],
      ['Why regularise at all?', 'To reduce overfitting by penalising large weights.'],
    ],
  },
  'FD-1017': {
    description: 'Convolution, pooling, stride and padding — the building blocks of CNNs.',
    cards: [
      ['What does a convolutional layer learn?', 'A set of filters (kernels) that detect local patterns such as edges and textures.'],
      ['What is stride?', 'How many pixels the filter moves at each step.'],
      ['Purpose of pooling?', 'Downsample feature maps, reducing computation and adding translation invariance.'],
      ['What does "same" padding do?', 'Pads the input so the output has the same spatial size as the input (for stride 1).'],
    ],
  },
  'FD-1016': {
    description: 'Lists, tuples, sets and dictionaries in Python.',
    cards: [
      ['List vs. tuple?', 'Lists are mutable; tuples are immutable.'],
      ['Average lookup time in a dict?', 'O(1).'],
      ['How do you remove duplicates from a list?', 'list(set(items)) — order is not preserved.'],
      ['Can a list be a dict key?', 'No — keys must be hashable, and lists are mutable.'],
    ],
  },
  'FD-1015': {
    description: 'Common discrete and continuous probability distributions and their parameters.',
    cards: [
      ['Parameters of a normal distribution?', 'Mean μ and standard deviation σ.'],
      ['When does a binomial distribution apply?', 'Counting successes in n independent trials with the same success probability p.'],
      ['What does a Poisson distribution model?', 'The number of events in a fixed interval given a constant average rate λ.'],
      ['Mean and variance of Poisson(λ)?', 'Both equal λ.'],
      ['What is the uniform distribution?', 'Every value in an interval is equally likely.'],
    ],
  },
  'FD-1014': {
    description: 'Accuracy, precision, recall, F1 and ROC-AUC — what they measure and when they mislead.',
    cards: [
      ['Define precision.', 'TP / (TP + FP) — how many predicted positives are correct.'],
      ['Define recall.', 'TP / (TP + FN) — how many actual positives are found.'],
      ['What is the F1 score?', 'The harmonic mean of precision and recall.'],
      ['Why can accuracy mislead?', 'On imbalanced data a model predicting only the majority class still scores high.'],
    ],
  },
  'FD-1013': {
    description: 'Two widely used tricks to stabilise and regularise deep networks.',
    cards: [
      ['What does batch normalization do?', 'Normalises layer inputs per mini-batch, then scales and shifts them with learned parameters.'],
      ['What does dropout do during training?', 'Randomly zeroes a fraction of activations to prevent co-adaptation.'],
      ['Is dropout active at inference?', 'No — it is disabled and activations are scaled accordingly.'],
    ],
  },
  'FD-1012': {
    description: 'Vectorised NumPy operations: creation, broadcasting and reshaping.',
    cards: [
      ['What is broadcasting?', 'NumPy’s rule for applying operations to arrays of different but compatible shapes.'],
      ['How do you create a 3×3 array of zeros?', 'np.zeros((3, 3))'],
      ['What does arr.reshape(-1) do?', 'Flattens the array to one dimension.'],
      ['Element-wise vs. matrix product?', 'a * b is element-wise; a @ b is the matrix product.'],
    ],
  },
  'FD-1011': {
    description: 'Interpreting and computing confidence intervals.',
    cards: [
      ['What does a 95% confidence interval mean?', 'If we repeated sampling many times, about 95% of such intervals would contain the true parameter.'],
      ['How does sample size affect CI width?', 'Larger samples give narrower intervals.'],
      ['Formula for a CI of a mean (known σ)?', 'x̄ ± z · σ / √n'],
    ],
  },
  'FD-1010': {
    description: 'Decision trees, bagging, random forests and boosting.',
    cards: [
      ['What criterion can a decision tree split on?', 'Gini impurity or entropy (information gain).'],
      ['What is bagging?', 'Training models on bootstrap samples and averaging their predictions.'],
      ['How does a random forest add randomness?', 'Each split considers only a random subset of features.'],
      ['Boosting in one sentence?', 'Models are trained sequentially, each focusing on the errors of the previous ones.'],
    ],
  },
  'FD-1009': {
    description: 'RNNs, LSTMs and GRUs for sequence data.',
    cards: [
      ['What makes an RNN recurrent?', 'Its hidden state is fed back as input at the next time step.'],
      ['Why were LSTMs introduced?', 'To capture long-range dependencies by mitigating vanishing gradients with gates.'],
      ['Gates in an LSTM?', 'Input, forget and output gates.'],
    ],
  },
  'FD-1008': {
    description: 'Practical recipes for handling missing values, duplicates and inconsistent types.',
    cards: [
      ['How do you drop duplicate rows in pandas?', 'df.drop_duplicates()'],
      ['Two ways to handle missing values?', 'Drop them (dropna) or impute them (fillna, mean/median, model-based).'],
      ['How do you convert a column to datetime?', 'pd.to_datetime(df["col"])'],
    ],
  },
  'FD-1007': {
    description: 'Distinguish false positives from false negatives in hypothesis testing.',
    cards: [
      ['What is a Type I error?', 'Rejecting H₀ when it is true (false positive).'],
      ['What is a Type II error?', 'Failing to reject H₀ when it is false (false negative).'],
      ['What is statistical power?', '1 − β, the probability of correctly rejecting a false H₀.'],
    ],
  },
  'FD-1006': {
    description: 'Encoding, scaling and creating features that help models learn.',
    cards: [
      ['What is one-hot encoding?', 'Representing a categorical variable as binary columns, one per category.'],
      ['Standardisation vs. normalisation?', 'Standardisation → mean 0, std 1; normalisation → rescale to a fixed range such as [0, 1].'],
      ['Why log-transform a skewed feature?', 'To reduce skew and the influence of extreme values.'],
    ],
  },
  'FD-1005': {
    description: 'How common optimisers differ in their update rules.',
    cards: [
      ['What does momentum add to SGD?', 'A running average of past gradients that accelerates updates in consistent directions.'],
      ['What does Adam combine?', 'Momentum (first moment) and RMSProp-style adaptive learning rates (second moment).'],
      ['Default Adam β₁ and β₂?', 'β₁ = 0.9, β₂ = 0.999.'],
    ],
  },
  'FD-1004': {
    description: 'Choosing the right Matplotlib chart for the data.',
    cards: [
      ['Which plot shows a distribution of one variable?', 'A histogram — plt.hist().'],
      ['Which plot shows the relationship between two numeric variables?', 'A scatter plot — plt.scatter().'],
      ['How do you create a grid of subplots?', 'fig, axes = plt.subplots(nrows, ncols)'],
    ],
  },
  'FD-1003': {
    description: 'Applying Bayes’ theorem to update beliefs with evidence.',
    cards: [
      ['State Bayes’ theorem.', 'P(A|B) = P(B|A) · P(A) / P(B).'],
      ['What is the prior?', 'The probability of a hypothesis before seeing the evidence.'],
      ['What is the posterior?', 'The updated probability of the hypothesis after seeing the evidence.'],
    ],
  },
};

const DECK_FIXTURES: Omit<FlashcardDeck, 'cards' | 'description'>[] = [
  { id: 'FD-1024', name: 'Gradient Descent Essentials', courseId: 'ml', creator: 'Priya Nair', status: 'Published', updatedAt: '2026-10-16T08:42:00' },
  { id: 'FD-1023', name: 'Bias-Variance Tradeoff', courseId: 'ml', creator: 'Priya Nair', status: 'Published', updatedAt: '2026-10-15T16:10:00' },
  { id: 'FD-1022', name: 'Activation Functions Cheat Sheet', courseId: 'dl', creator: 'Marcus Reid', status: 'Draft', updatedAt: '2026-10-15T09:25:00' },
  { id: 'FD-1021', name: 'Backpropagation Step by Step', courseId: 'dl', creator: 'Priya Nair', status: 'Published', updatedAt: '2026-10-14T14:03:00' },
  { id: 'FD-1020', name: 'Pandas DataFrame Basics', courseId: 'py', creator: 'Marcus Reid', status: 'Published', updatedAt: '2026-10-13T11:47:00' },
  { id: 'FD-1019', name: 'Hypothesis Testing Terms', courseId: 'stats', creator: 'Linh Tran', status: 'Draft', updatedAt: '2026-10-12T19:30:00' },
  { id: 'FD-1018', name: 'Regularization: L1 vs L2', courseId: 'ml', creator: 'Linh Tran', status: 'Published', updatedAt: '2026-10-11T10:15:00' },
  { id: 'FD-1017', name: 'CNN Building Blocks', courseId: 'dl', creator: 'Marcus Reid', status: 'Archived', updatedAt: '2026-10-10T08:00:00' },
  { id: 'FD-1016', name: 'Python Built-in Data Structures', courseId: 'py', creator: 'Priya Nair', status: 'Published', updatedAt: '2026-10-09T15:22:00' },
  { id: 'FD-1015', name: 'Probability Distributions', courseId: 'stats', creator: 'Linh Tran', status: 'Published', updatedAt: '2026-10-08T13:40:00' },
  { id: 'FD-1014', name: 'Model Evaluation Metrics', courseId: 'ml', creator: 'Priya Nair', status: 'Draft', updatedAt: '2026-10-07T17:05:00' },
  { id: 'FD-1013', name: 'Batch Normalization & Dropout', courseId: 'dl', creator: 'Linh Tran', status: 'Published', updatedAt: '2026-10-06T09:50:00' },
  { id: 'FD-1012', name: 'NumPy Array Operations', courseId: 'py', creator: 'Marcus Reid', status: 'Archived', updatedAt: '2026-10-04T12:12:00' },
  { id: 'FD-1011', name: 'Confidence Intervals', courseId: 'stats', creator: 'Priya Nair', status: 'Published', updatedAt: '2026-10-03T16:33:00' },
  { id: 'FD-1010', name: 'Decision Trees & Ensembles', courseId: 'ml', creator: 'Marcus Reid', status: 'Published', updatedAt: '2026-10-01T10:00:00' },
  { id: 'FD-1009', name: 'Recurrent Networks Overview', courseId: 'dl', creator: 'Priya Nair', status: 'Draft', updatedAt: '2026-09-29T14:45:00' },
  { id: 'FD-1008', name: 'Data Cleaning Patterns', courseId: 'py', creator: 'Linh Tran', status: 'Published', updatedAt: '2026-09-27T08:20:00' },
  { id: 'FD-1007', name: 'Type I & Type II Errors', courseId: 'stats', creator: 'Marcus Reid', status: 'Published', updatedAt: '2026-09-25T11:11:00' },
  { id: 'FD-1006', name: 'Feature Engineering Tricks', courseId: 'ml', creator: 'Linh Tran', status: 'Archived', updatedAt: '2026-09-22T15:58:00' },
  { id: 'FD-1005', name: 'Optimizers: SGD, Momentum, Adam', courseId: 'dl', creator: 'Marcus Reid', status: 'Published', updatedAt: '2026-09-20T09:30:00' },
  { id: 'FD-1004', name: 'Matplotlib Plot Types', courseId: 'py', creator: 'Priya Nair', status: 'Draft', updatedAt: '2026-09-18T13:07:00' },
  { id: 'FD-1003', name: 'Bayes Theorem in Practice', courseId: 'stats', creator: 'Linh Tran', status: 'Published', updatedAt: '2026-09-15T10:40:00' },
];

/** Cards per deck id — the committed card list for each deck. */
const deckCards = new Map<string, Flashcard[]>(
  Object.entries(DECK_SEEDS).map(([deckId, seed]) => [
    deckId,
    seed.cards.map(([front, back], i) => ({ id: `${deckId}-C${i + 1}`, front, back })),
  ]),
);

export const MOCK_FLASHCARD_DECKS: FlashcardDeck[] = DECK_FIXTURES.map(d => ({
  ...d,
  description: DECK_SEEDS[d.id]?.description ?? '',
  cards: deckCards.get(d.id)?.length ?? 0,
}));

/** Replace the shared deck list — the list page writes its edits through here. */
export function setFlashcardDecks(next: FlashcardDeck[]): void {
  MOCK_FLASHCARD_DECKS.splice(0, MOCK_FLASHCARD_DECKS.length, ...next);
}

export function getDeck(id: string): FlashcardDeck | undefined {
  return MOCK_FLASHCARD_DECKS.find(d => d.id === id);
}

/** Committed cards for a deck; empty for a deck that has none yet. */
export function getDeckCards(id: string): Flashcard[] {
  return deckCards.get(id) ?? [];
}

/** Persist the deck's metadata and card list; the card count follows the list. */
export function commitDeck(deck: FlashcardDeck, cards: Flashcard[]): FlashcardDeck {
  const saved: FlashcardDeck = { ...deck, cards: cards.length, updatedAt: new Date().toISOString().slice(0, 19) };
  const index = MOCK_FLASHCARD_DECKS.findIndex(d => d.id === deck.id);
  if (index >= 0) MOCK_FLASHCARD_DECKS[index] = saved;
  deckCards.set(deck.id, cards);
  return saved;
}

let cardCounter = 0;
/** Fresh id for a newly authored card — unique per session, never reused. */
export function nextCardId(deckId: string): string {
  cardCounter += 1;
  return `${deckId}-N${Date.now().toString(36)}${cardCounter}`;
}

export const courseTitle = (id: string) => FLASHCARD_COURSES.find(c => c.id === id)?.title ?? id;

/** "Oct 16, 2026, 08:42" — stable, locale-independent display format. */
export function formatDeckTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const month = d.toLocaleString('en-US', { month: 'short' });
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${month} ${d.getDate()}, ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
