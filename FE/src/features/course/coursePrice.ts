/** Same range as CourseRequests.Create.price (@DecimalMax("99999999.99"), @Digits(integer = 8, fraction = 2)). */
export const COURSE_PRICE_MAX = 99_999_999.99;

/**
 * Validation message for the course price input, or null when it is valid.
 * An empty field is an error rather than "free": the user types 0 for a free course.
 */
export function coursePriceError(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Price is required (enter 0 for a free course).';
  const price = Number(value);
  if (!Number.isFinite(price)) return 'Price must be a number.';
  if (price < 0) return 'Price cannot be negative.';
  if (price > COURSE_PRICE_MAX) return 'Price must not exceed 99,999,999.99.';
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return 'Price must be a plain number with at most 2 decimal places.';
  return null;
}
