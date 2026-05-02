import { z } from 'zod';
import { captureAdminError } from '@/lib/admin/admin-telemetry';
import { ApiError } from '@/lib/admin/api-client';

export class DtoParseError extends Error {
  constructor(
    public readonly schemaName: string,
    public readonly issues: z.ZodIssue[],
  ) {
    super(`DTO parse failed for ${schemaName}`);
    this.name = 'DtoParseError';
  }
}

export async function parseDto<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  ctx: { name: string; path?: string },
): Promise<T> {
  const result = schema.safeParse(raw);
  if (result.success) {
    return result.data;
  }

  const error = new DtoParseError(ctx.name, result.error.issues);
  captureAdminError('admin.dto.parse_failed', error, {
    schema_name: ctx.name,
    path: ctx.path,
    issues: result.error.issues,
  });

  throw new ApiError(
    500,
    `Ogiltigt svarsformat (${ctx.name})`,
    'dto_parse_failed',
    undefined,
    result.error.issues,
  );
}
