import { z } from 'zod';
export const readerSettingsSchema = z.object({
  fontSize: z.number().int().min(14).max(40),
  theme: z.enum(['paper', 'light', 'dark', 'original', 'quiet', 'bold', 'calm', 'focus']),
  font: z.enum(['serif', 'sans', 'mono']).optional(),
  bold: z.boolean().optional(), customize: z.boolean().optional(), justify: z.boolean().optional(),
  lineSpacing: z.number().min(1).max(2.5).optional(),
  characterSpacing: z.number().min(0).max(3).optional(),
  wordSpacing: z.number().min(0).max(12).optional(),
  margins: z.number().min(0).max(48).optional(),
  brightness: z.number().min(0.1).max(1).optional(),
  appearance: z.enum(['light', 'dark', 'device', 'surroundings']).optional(),
  scroll: z.boolean().optional(),
}).strict();
export const positionSchema = z.object({ chapter: z.number().int().min(0), offset: z.number().int().min(0) }).strict();
export const libraryUpdateSchema = z.object({
  page: z.number().int().min(0).optional(), finished: z.boolean().optional(),
  bookmarked: z.boolean().optional(), reader_offset: z.number().int().min(0).optional(),
  bookmarks: z.array(positionSchema).max(500).optional(),
}).strict();
export function validPosition(chapters, position) {
  const chapter = chapters[position.chapter];
  return !!chapter && position.offset <= (chapter.text || '').length;
}
