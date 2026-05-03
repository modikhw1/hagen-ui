import type { AdminScope } from '@/lib/admin/admin-roles';

export type AdminActionError = {
  error: {
    code: string;
    message: string;
  };
};

export type AdminActionSuccess<T> = {
  data: T;
};

export type AdminActionResult<T> = AdminActionError | AdminActionSuccess<T>;

export function actionError(code: string, message: string): AdminActionError {
  return { error: { code, message } };
}

export function actionData<T>(data: T): AdminActionSuccess<T> {
  return { data };
}

export async function getAdminActionSession(_scope?: AdminScope) {
  return null;
}

export async function runAdminCustomerAction<T>(_params: {
  id: string;
  scope?: AdminScope;
  revalidate?: boolean;
  work: (ctx: never) => Promise<T>;
}): Promise<AdminActionResult<T>> {
  return actionError('NOT_IMPLEMENTED', 'Server actions are not available in the client app');
}
