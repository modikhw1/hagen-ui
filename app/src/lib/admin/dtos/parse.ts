import { z } from 'zod';

export async function parseDto<T>(schema: z.ZodType<T>, raw: unknown): Promise<T> {
  return schema.parse(raw);
}
