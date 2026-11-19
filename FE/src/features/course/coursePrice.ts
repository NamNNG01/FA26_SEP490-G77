/** Same range as CourseRequests.Create.price (@DecimalMax("99999999.99")); VND is entered as whole numbers. */
export const COURSE_PRICE_MAX = 99_999_999;

/** Show the stored amount when managing a course. Checkout quotes round to whole VND. */
export function formatStoredCoursePrice(price: number): string {
  if (price === 0) return 'Free';
  return `${price.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ₫`;
}

/**
 * Validation message for the course price input (plain digits from MoneyInput), or null when it is valid.
 * An empty field is an error rather than "free": the user types 0 for a free course.
 */
export function coursePriceError(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Price is required (enter 0 for a free course).';
  if (value.startsWith('-')) return 'Price must be 0 or greater.';
  if (!/^\d+$/.test(value)) return 'Price must be a whole number of VND.';
  if (Number(value) > COURSE_PRICE_MAX) return 'Price must not exceed 99.999.999 ₫.';
  return null;
}
