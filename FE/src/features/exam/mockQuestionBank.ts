export type BankQuestion = {
  id: string;
  text: string;
  courseId: string;
  moduleId: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  pts: number;
  type: 'mcq' | 'tf' | 'essay';
  options: { label: string; text: string }[];
  correct: string;
};

export const difficultyLabel = (d: BankQuestion['difficulty']) => d === 'easy' ? 'Easy' : d === 'medium' ? 'Medium' : 'Hard';
export const difficultyVariant = (d: BankQuestion['difficulty']): 'success' | 'warning' | 'danger' => d === 'easy' ? 'success' : d === 'medium' ? 'warning' : 'danger';

export const MOCK_QUESTION_BANK: BankQuestion[] = [
  {
    id: 'Q-1001', text: 'What is gradient descent and how does it work?', courseId: 'ml', moduleId: 'mod-3', topic: 'Optimization', difficulty: 'medium', tags: ['exam', 'fundamentals'], pts: 2, type: 'mcq',
    options: [
      { label: 'A', text: 'It minimizes the cost function by iteratively updating parameters' },
      { label: 'B', text: 'It maximizes the training set size' },
      { label: 'C', text: 'It removes noise from the data' },
      { label: 'D', text: 'It converts supervised learning to unsupervised' },
    ], correct: 'A',
  },
  {
    id: 'Q-1002', text: 'Explain the bias-variance tradeoff in machine learning.', courseId: 'ml', moduleId: 'mod-1', topic: 'ML Theory', difficulty: 'hard', tags: ['exam', 'fundamentals'], pts: 3, type: 'essay',
    options: [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }], correct: 'A',
  },
  {
    id: 'Q-1003', text: 'What is the purpose of the softmax function in classification?', courseId: 'dl', moduleId: 'mod-5', topic: 'Neural Nets', difficulty: 'medium', tags: ['exam'], pts: 2, type: 'mcq',
    options: [
      { label: 'A', text: 'Convert logits into probabilities over classes' },
      { label: 'B', text: 'Squeeze values into the range [-1, 1]' },
      { label: 'C', text: 'Drop out neurons at random' },
      { label: 'D', text: 'Normalize inputs to unit variance' },
    ], correct: 'A',
  },
  {
    id: 'Q-1004', text: 'How does cross-entropy loss differ from mean squared error?', courseId: 'ml', moduleId: 'mod-1', topic: 'Loss Functions', difficulty: 'hard', tags: ['exam', 'fundamentals'], pts: 3, type: 'mcq',
    options: [
      { label: 'A', text: 'Cross-entropy measures divergence between two probability distributions' },
      { label: 'B', text: 'Cross-entropy is only used for regression' },
      { label: 'C', text: 'They are mathematically identical' },
      { label: 'D', text: 'MSE requires softmax activation' },
    ], correct: 'A',
  },
  {
    id: 'Q-1005', text: 'Which activation function is most common in modern hidden layers?', courseId: 'dl', moduleId: 'mod-4', topic: 'Neural Nets', difficulty: 'easy', tags: ['practice', 'fundamentals'], pts: 1, type: 'tf',
    options: [
      { label: 'A', text: 'ReLU and its variants' },
      { label: 'B', text: 'Sigmoid everywhere' },
      { label: 'C', text: 'Linear activation for every layer' },
      { label: 'D', text: 'Step function only' },
    ], correct: 'A',
  },
  {
    id: 'Q-1006', text: 'What does the vanishing gradient problem cause?', courseId: 'dl', moduleId: 'mod-4', topic: 'Optimization', difficulty: 'medium', tags: ['exam', 'practice'], pts: 2, type: 'mcq',
    options: [
      { label: 'A', text: 'Early layers learn very slowly' },
      { label: 'B', text: 'The dataset becomes too large' },
      { label: 'C', text: 'Loss becomes negative' },
      { label: 'D', text: 'Overfitting disappears' },
    ], correct: 'A',
  },
  {
    id: 'Q-1007', text: 'Define the p-value in hypothesis testing.', courseId: 'stats', moduleId: 'mod-8', topic: 'Inference', difficulty: 'medium', tags: ['fundamentals'], pts: 2, type: 'essay',
    options: [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }], correct: 'A',
  },
  {
    id: 'Q-1008', text: 'When do you reject the null hypothesis at the 5% level?', courseId: 'stats', moduleId: 'mod-8', topic: 'Inference', difficulty: 'easy', tags: ['practice'], pts: 1, type: 'tf',
    options: [
      { label: 'A', text: 'When p < 0.05' },
      { label: 'B', text: 'When p > 0.05' },
      { label: 'C', text: 'When p = 0.5' },
      { label: 'D', text: 'Never' },
    ], correct: 'A',
  },
  {
    id: 'Q-1009', text: 'Compute the 95% confidence interval for a sample with mean 10 and standard error 2.', courseId: 'stats', moduleId: 'mod-9', topic: 'Inference', difficulty: 'hard', tags: ['exam'], pts: 3, type: 'mcq',
    options: [
      { label: 'A', text: 'Approximately 6.08 to 13.92' },
      { label: 'B', text: '8 to 12 exactly' },
      { label: 'C', text: '5 to 15' },
      { label: 'D', text: 'Cannot be determined' },
    ], correct: 'A',
  },
  {
    id: 'Q-1010', text: 'What does the central limit theorem state?', courseId: 'stats', moduleId: 'mod-8', topic: 'Distributions', difficulty: 'easy', tags: ['exam', 'fundamentals'], pts: 1, type: 'mcq',
    options: [
      { label: 'A', text: 'Sample means become approximately normal for large n' },
      { label: 'B', text: 'Population variance is always zero' },
      { label: 'C', text: 'All data is normally distributed' },
      { label: 'D', text: 'Medians equal means always' },
    ], correct: 'A',
  },
  {
    id: 'Q-1011', text: 'What is the role of the learning rate in gradient descent?', courseId: 'ml', moduleId: 'mod-3', topic: 'Optimization', difficulty: 'medium', tags: ['practice', 'fundamentals'], pts: 2, type: 'mcq',
    options: [
      { label: 'A', text: 'Controls the step size of each update' },
      { label: 'B', text: 'Replaces the loss function' },
      { label: 'C', text: 'Determines dataset size' },
      { label: 'D', text: 'Only affects the test set' },
    ], correct: 'A',
  },
  {
    id: 'Q-1012', text: 'How does batch normalization help training?', courseId: 'dl', moduleId: 'mod-5', topic: 'Normalization', difficulty: 'hard', tags: ['exam'], pts: 3, type: 'mcq',
    options: [
      { label: 'A', text: 'Stabilizes the distribution of layer inputs' },
      { label: 'B', text: 'Doubles the batch size' },
      { label: 'C', text: 'Removes the need for validation' },
      { label: 'D', text: 'Only works for images' },
    ], correct: 'A',
  },
  { id: 'Q-1013', text: 'What is the difference between supervised and unsupervised learning?', courseId: 'py', moduleId: 'mod-6', topic: 'ML Basics', difficulty: 'easy', tags: ['practice'], pts: 1, type: 'mcq',
    options: [
      { label: 'A', text: 'Supervised uses labeled data; unsupervised does not' },
      { label: 'B', text: 'They are identical approaches' },
      { label: 'C', text: 'Unsupervised always requires labels' },
      { label: 'D', text: 'Supervised cannot make predictions' },
    ], correct: 'A',
  },
  { id: 'Q-1014', text: 'How does pandas group_by differ from SQL GROUP BY?', courseId: 'py', moduleId: 'mod-7', topic: 'Data Wrangling', difficulty: 'medium', tags: ['exam'], pts: 2, type: 'essay',
    options: [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }], correct: 'A',
  },
  { id: 'Q-1015', text: 'What is regularization and why is it used in model training?', courseId: 'ml', moduleId: 'mod-2', topic: 'ML Theory', difficulty: 'medium', tags: ['exam', 'fundamentals'], pts: 2, type: 'mcq',
    options: [
      { label: 'A', text: 'It penalizes model complexity to reduce overfitting' },
      { label: 'B', text: 'It increases the learning rate automatically' },
      { label: 'C', text: 'It removes the test set' },
      { label: 'D', text: 'It only applies to neural networks' },
    ], correct: 'A',
  },
  { id: 'Q-1016', text: 'Which metric is most appropriate for a highly imbalanced binary classifier?', courseId: 'ml', moduleId: 'mod-2', topic: 'Evaluation', difficulty: 'hard', tags: ['exam', 'practice'], pts: 3, type: 'mcq',
    options: [
      { label: 'A', text: 'Precision-recall AUC' },
      { label: 'B', text: 'Plain accuracy' },
      { label: 'C', text: 'R-squared' },
      { label: 'D', text: 'Mean squared error' },
    ], correct: 'A',
  },
  { id: 'Q-1017', text: 'Backpropagation computes gradients using the chain rule.', courseId: 'dl', moduleId: 'mod-4', topic: 'Neural Nets', difficulty: 'easy', tags: ['fundamentals'], pts: 1, type: 'tf',
    options: [
      { label: 'A', text: 'True' },
      { label: 'B', text: 'False' },
    ], correct: 'A',
  },
  { id: 'Q-1018', text: 'What problem does dropout primarily mitigate in deep networks?', courseId: 'dl', moduleId: 'mod-5', topic: 'Regularization', difficulty: 'medium', tags: ['exam'], pts: 2, type: 'mcq',
    options: [
      { label: 'A', text: 'Overfitting' },
      { label: 'B', text: 'Underfitting' },
      { label: 'C', text: 'Vanishing labels' },
      { label: 'D', text: 'Small datasets' },
    ], correct: 'A',
  },
  { id: 'Q-1019', text: 'How does L1 regularization promote sparsity compared to L2?', courseId: 'ml', moduleId: 'mod-3', topic: 'Optimization', difficulty: 'hard', tags: ['exam'], pts: 3, type: 'mcq',
    options: [
      { label: 'A', text: 'Its penalty drives some weights exactly to zero' },
      { label: 'B', text: 'It scales every weight by the same factor' },
      { label: 'C', text: 'It only shrinks the bias terms' },
      { label: 'D', text: 'It has no effect on weights' },
    ], correct: 'A',
  },
  { id: 'Q-1020', text: 'Describe how a decision tree selects the feature to split on at its root.', courseId: 'ml', moduleId: 'mod-2', topic: 'Supervised Learning', difficulty: 'medium', tags: ['exam', 'fundamentals'], pts: 3, type: 'essay',
    options: [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }], correct: 'A',
  },
  { id: 'Q-1021', text: 'What happens to training when the learning rate is set too high?', courseId: 'dl', moduleId: 'mod-4', topic: 'Optimization', difficulty: 'medium', tags: ['practice'], pts: 2, type: 'mcq',
    options: [
      { label: 'A', text: 'The loss oscillates or diverges instead of converging' },
      { label: 'B', text: 'Training always converges faster to a better minimum' },
      { label: 'C', text: 'Gradients become exactly zero' },
      { label: 'D', text: 'The model underfits but never diverges' },
    ], correct: 'A',
  },
  { id: 'Q-1022', text: 'Which pandas method fills missing values with the previous row value?', courseId: 'py', moduleId: 'mod-6', topic: 'Data Wrangling', difficulty: 'easy', tags: ['practice'], pts: 1, type: 'mcq',
    options: [
      { label: 'A', text: 'fillna with method ffill' },
      { label: 'B', text: 'dropna' },
      { label: 'C', text: 'merge' },
      { label: 'D', text: 'pivot' },
    ], correct: 'A',
  },
  { id: 'Q-1023', text: 'Is a Python tuple mutable? True or false.', courseId: 'py', moduleId: 'mod-6', topic: 'Python Basics', difficulty: 'easy', tags: ['fundamentals'], pts: 1, type: 'tf',
    options: [
      { label: 'A', text: 'False — tuples are immutable' },
      { label: 'B', text: 'True' },
    ], correct: 'A',
  },
  { id: 'Q-1024', text: 'Explain Type I and Type II errors with a concrete example.', courseId: 'stats', moduleId: 'mod-9', topic: 'Inference', difficulty: 'hard', tags: ['exam', 'fundamentals'], pts: 3, type: 'essay',
    options: [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }], correct: 'A',
  },
  { id: 'Q-1025', text: 'The standard error of the mean decreases as sample size grows.', courseId: 'stats', moduleId: 'mod-8', topic: 'Distributions', difficulty: 'easy', tags: ['practice'], pts: 1, type: 'tf',
    options: [
      { label: 'A', text: 'True' },
      { label: 'B', text: 'False' },
    ], correct: 'A',
  },
  { id: 'Q-1026', text: 'What does the ROC curve plot?', courseId: 'stats', moduleId: 'mod-8', topic: 'Evaluation', difficulty: 'medium', tags: ['exam'], pts: 2, type: 'mcq',
    options: [
      { label: 'A', text: 'True positive rate versus false positive rate' },
      { label: 'B', text: 'Accuracy versus training time' },
      { label: 'C', text: 'Precision versus number of features' },
      { label: 'D', text: 'Loss versus epochs' },
    ], correct: 'A',
  },
  { id: 'Q-1027', text: 'Compare ResNet skip connections with a plain deep feedforward network.', courseId: 'dl', moduleId: 'mod-5', topic: 'Neural Nets', difficulty: 'hard', tags: ['exam'], pts: 3, type: 'essay',
    options: [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }], correct: 'A',
  },
  { id: 'Q-1028', text: 'What does overfitting look like on training versus validation curves?', courseId: 'ml', moduleId: 'mod-1', topic: 'ML Theory', difficulty: 'easy', tags: ['fundamentals'], pts: 1, type: 'mcq',
    options: [
      { label: 'A', text: 'Training loss keeps dropping while validation loss rises' },
      { label: 'B', text: 'Both losses rise together' },
      { label: 'C', text: 'Both losses fall together forever' },
      { label: 'D', text: 'Validation loss is always zero' },
    ], correct: 'A',
  },
  { id: 'Q-1029', text: 'Which SQL clause filters groups after aggregation?', courseId: 'py', moduleId: 'mod-7', topic: 'Data Wrangling', difficulty: 'medium', tags: ['exam'], pts: 2, type: 'mcq',
    options: [
      { label: 'A', text: 'HAVING' },
      { label: 'B', text: 'WHERE' },
      { label: 'C', text: 'ORDER BY' },
      { label: 'D', text: 'LIMIT' },
    ], correct: 'A',
  },
  { id: 'Q-1030', text: 'How do you pivot a DataFrame from long format to wide format?', courseId: 'py', moduleId: 'mod-7', topic: 'Data Wrangling', difficulty: 'medium', tags: ['practice'], pts: 2, type: 'essay',
    options: [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }], correct: 'A',
  },
  { id: 'Q-1031', text: 'Which activation avoids saturated gradients for deep ReLU networks?', courseId: 'dl', moduleId: 'mod-4', topic: 'Neural Nets', difficulty: 'medium', tags: ['exam', 'practice'], pts: 2, type: 'mcq',
    options: [
      { label: 'A', text: 'Leaky ReLU' },
      { label: 'B', text: 'Sigmoid' },
      { label: 'C', text: 'Tanh' },
      { label: 'D', text: 'Step function' },
    ], correct: 'A',
  },
  { id: 'Q-1032', text: 'What does a 99% confidence interval communicate about an estimate?', courseId: 'stats', moduleId: 'mod-9', topic: 'Inference', difficulty: 'medium', tags: ['exam'], pts: 2, type: 'mcq',
    options: [
      { label: 'A', text: 'The long-run coverage of the interval-building procedure' },
      { label: 'B', text: 'There is a 99% probability this specific interval contains the truth' },
      { label: 'C', text: 'The estimate is off by at most 1%' },
      { label: 'D', text: 'The sample size was at least 99' },
    ], correct: 'A',
  },
  { id: 'Q-1033', text: 'What is the purpose of a validation set?', courseId: 'ml', moduleId: 'mod-1', topic: 'ML Theory', difficulty: 'easy', tags: ['fundamentals'], pts: 1, type: 'mcq',
    options: [
      { label: 'A', text: 'To tune model choices without touching the test set' },
      { label: 'B', text: 'To increase the training data size' },
      { label: 'C', text: 'To replace the loss function' },
      { label: 'D', text: 'To label unlabeled data' },
    ], correct: 'A',
  },
  { id: 'Q-1034', text: 'Explain how dropout is applied differently at train and inference time.', courseId: 'dl', moduleId: 'mod-5', topic: 'Regularization', difficulty: 'medium', tags: ['exam'], pts: 2, type: 'essay',
    options: [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }], correct: 'A',
  },
  { id: 'Q-1035', text: 'Which plot is best for visualizing the distribution of a single variable?', courseId: 'stats', moduleId: 'mod-8', topic: 'Distributions', difficulty: 'easy', tags: ['practice'], pts: 1, type: 'mcq',
    options: [
      { label: 'A', text: 'A histogram' },
      { label: 'B', text: 'A scatter plot of two variables' },
      { label: 'C', text: 'A confusion matrix' },
      { label: 'D', text: 'A ROC curve' },
    ], correct: 'A',
  },
  { id: 'Q-1036', text: 'The variance of a constant random variable is zero.', courseId: 'stats', moduleId: 'mod-8', topic: 'Distributions', difficulty: 'easy', tags: ['fundamentals'], pts: 1, type: 'tf',
    options: [
      { label: 'A', text: 'True' },
      { label: 'B', text: 'False' },
      { label: 'C', text: 'Only for discrete variables' },
      { label: 'D', text: 'Only for continuous variables' },
    ], correct: 'A',
  },
  { id: 'Q-1037', text: 'Which statement about k-fold cross-validation is true?', courseId: 'ml', moduleId: 'mod-1', topic: 'Evaluation', difficulty: 'medium', tags: ['exam', 'fundamentals'], pts: 2, type: 'mcq',
    options: [
      { label: 'A', text: 'Every fold serves once as the validation set' },
      { label: 'B', text: 'Only one fold is ever used for validation' },
      { label: 'C', text: 'It requires a GPU' },
      { label: 'D', text: 'It cannot be used for regression' },
    ], correct: 'A',
  },
  { id: 'Q-1038', text: 'Write a Python list comprehension that squares the even numbers from 1 to 20.', courseId: 'py', moduleId: 'mod-6', topic: 'Python Basics', difficulty: 'easy', tags: ['practice'], pts: 2, type: 'essay',
    options: [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }], correct: 'A',
  },
  { id: 'Q-1039', text: 'Which optimizer combines momentum with adaptive learning rates?', courseId: 'dl', moduleId: 'mod-3', topic: 'Optimization', difficulty: 'medium', tags: ['exam'], pts: 2, type: 'mcq',
    options: [
      { label: 'A', text: 'Adam' },
      { label: 'B', text: 'Plain SGD' },
      { label: 'C', text: 'Newton’s method' },
      { label: 'D', text: 'Grid search' },
    ], correct: 'A',
  },
  { id: 'Q-1040', text: 'Which pandas function converts strings to datetime?', courseId: 'py', moduleId: 'mod-7', topic: 'Data Wrangling', difficulty: 'easy', tags: ['exam'], pts: 1, type: 'mcq',
    options: [
      { label: 'A', text: 'to_datetime' },
      { label: 'B', text: 'astype(str)' },
      { label: 'C', text: 'concat' },
      { label: 'D', text: 'melt' },
    ], correct: 'A',
  },
];

export type PendingQuestion = { id: string; text: string; difficulty: string };