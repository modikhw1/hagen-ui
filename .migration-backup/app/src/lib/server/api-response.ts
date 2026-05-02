import { NextResponse } from 'next/server';

export function jsonError(
  error: string,
  status = 500,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      error,
      ...(extra ?? {}),
    },
    { status },
  );
}

export function jsonOk<T extends Record<string, unknown>>(payload: T, status = 200) {
  return NextResponse.json(payload, { status });
}
