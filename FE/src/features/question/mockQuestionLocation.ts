export type LocationCourse = {
  id: string;
  title: string;
  modules: { id: string; title: string }[];
};

/** Realistic mock data for the Edit Question Location panel. */
export const LOCATION_COURSES: LocationCourse[] = [
  {
    id: 'loc-ml',
    title: 'Machine Learning Fundamentals',
    modules: [
      { id: 'loc-ml-1', title: 'Introduction to Machine Learning' },
      { id: 'loc-ml-2', title: 'Supervised Learning' },
      { id: 'loc-ml-3', title: 'Unsupervised Learning' },
      { id: 'loc-ml-4', title: 'Model Evaluation' },
    ],
  },
  {
    id: 'loc-ds',
    title: 'Data Structures',
    modules: [
      { id: 'loc-ds-1', title: 'Arrays & Strings' },
      { id: 'loc-ds-2', title: 'Linked Lists & Stacks' },
      { id: 'loc-ds-3', title: 'Trees & Graphs' },
      { id: 'loc-ds-4', title: 'Sorting & Searching' },
    ],
  },
  {
    id: 'loc-db',
    title: 'Database Systems',
    modules: [
      { id: 'loc-db-1', title: 'Relational Model & SQL' },
      { id: 'loc-db-2', title: 'Normalization' },
      { id: 'loc-db-3', title: 'Indexing & Query Optimization' },
      { id: 'loc-db-4', title: 'Transactions & Concurrency' },
    ],
  },
  {
    id: 'loc-wd',
    title: 'Web Development',
    modules: [
      { id: 'loc-wd-1', title: 'HTML & CSS Fundamentals' },
      { id: 'loc-wd-2', title: 'JavaScript Essentials' },
      { id: 'loc-wd-3', title: 'React & Component Design' },
      { id: 'loc-wd-4', title: 'APIs & Backend Integration' },
    ],
  },
];

export const locationCourseById = (id: string) => LOCATION_COURSES.find(c => c.id === id);

export const locationModulesByCourse = (courseId: string) =>
  locationCourseById(courseId)?.modules ?? [];
