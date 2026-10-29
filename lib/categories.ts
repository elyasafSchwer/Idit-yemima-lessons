// Catalogue categories. Summaries are items of their own, not a second
// recording on a lesson, because one summary does not map to one lesson.
export type Category = 'lesson' | 'summary';

export const CATEGORIES: Category[] = ['lesson', 'summary'];

// Section / tab names.
export const CATEGORY_LABEL: Record<Category, string> = {
  lesson: 'שיעורים',
  summary: 'סיכומי שיעורים',
};

// A single item, as in "שיעור 3" or "סיכום 2".
export const CATEGORY_ITEM: Record<Category, string> = {
  lesson: 'שיעור',
  summary: 'סיכום',
};
