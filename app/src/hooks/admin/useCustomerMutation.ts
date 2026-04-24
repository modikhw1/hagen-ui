'use client';

import { useRouter } from 'next/navigation';
import { type QueryClient, type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  addAdminBreadcrumb,
  captureAdminError,
} from '@/lib/admin/admin-telemetry';
import {
  ApiError,
  archiveCustomer,
  callCustomerAction,
  type CustomerActionResult,
} from '@/lib/admin/api-client';
import {
  customerMutationRefreshScopes,
  invalidateAdminScopes,
} from '@/lib/admin/invalidate';
import type { CustomerSubscription } from '@/lib/admin/dtos/billing';
import type {
  CustomerDetail,
  CustomerListPayload,
  CustomerListRow,
} from '@/lib/admin/dtos/customer';
import { qk } from '@/lib/admin/queryKeys';
import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';

type CustomerMutationAction = CustomerAction['action'] | 'archive_customer';

type CustomerMutationInput<TAction extends CustomerMutationAction> =
  TAction extends CustomerAction['action']
    ? Omit<Extract<CustomerAction, { action: TAction }>, 'action'>
    : void;

type UseCustomerMutationOptions<TAction extends CustomerMutationAction> = {
  onSuccess?: (
    result: CustomerActionResult & { ok: true },
    input: CustomerMutationInput<TAction>,
  ) => void | Promise<void>;
  refresh?: boolean;
};

type OptimisticCustomerSnapshot = {
  customerLists: Array<[QueryKey, CustomerListPayload | undefined]>;
  customerDetail: CustomerDetail | undefined;
  customerSubscription: CustomerSubscription | null | undefined;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readPauseUntil(input: unknown): string | null | undefined {
  if (!isObjectRecord(input)) {
    return undefined;
  }

  const value = input.pause_until;
  if (typeof value === 'string' || value === null) {
    return value;
  }

  return undefined;
}

function readMonthlyPrice(input: unknown): number | undefined {
  if (!isObjectRecord(input)) {
    return undefined;
  }

  return typeof input.monthly_price === 'number' ? input.monthly_price : undefined;
}

function patchCustomerListRow(
  row: CustomerListRow,
  customerId: string,
  action: CustomerMutationAction,
  input: unknown,
): CustomerListRow {
  if (row.id !== customerId) {
    return row;
  }

  if (action === 'pause_subscription') {
    return {
      ...row,
      status: 'paused',
      derived_status: 'paused',
      paused_until: readPauseUntil(input) ?? row.paused_until,
    };
  }

  if (action === 'resume_subscription') {
    return {
      ...row,
      status: row.status === 'paused' ? 'active' : row.status,
      derived_status: row.derived_status === 'paused' ? 'live' : row.derived_status,
      paused_until: null,
    };
  }

  if (action === 'change_subscription_price') {
    const monthlyPrice = readMonthlyPrice(input);
    if (monthlyPrice === undefined) {
      return row;
    }

    return {
      ...row,
      monthly_price: monthlyPrice,
    };
  }

  return row;
}

function patchCustomerDetail(
  detail: CustomerDetail,
  action: CustomerMutationAction,
  input: unknown,
): CustomerDetail {
  if (action === 'pause_subscription') {
    return {
      ...detail,
      status: 'paused',
      derived_status: 'paused',
      paused_until: readPauseUntil(input) ?? detail.paused_until,
    };
  }

  if (action === 'resume_subscription') {
    return {
      ...detail,
      status: detail.status === 'paused' ? 'active' : detail.status,
      derived_status: detail.derived_status === 'paused' ? 'live' : detail.derived_status,
      paused_until: null,
    };
  }

  if (action === 'change_subscription_price') {
    const monthlyPrice = readMonthlyPrice(input);
    if (monthlyPrice === undefined) {
      return detail;
    }

    return {
      ...detail,
      monthly_price: monthlyPrice,
    };
  }

  return detail;
}

function patchCustomerSubscription(
  subscription: CustomerSubscription | null,
  action: CustomerMutationAction,
): CustomerSubscription | null {
  if (!subscription) {
    return subscription;
  }

  if (action === 'pause_subscription') {
    return {
      ...subscription,
      status: 'paused',
    };
  }

  if (action === 'resume_subscription') {
    return {
      ...subscription,
      status: 'active',
    };
  }

  return subscription;
}

function shouldApplyOptimisticPatch(action: CustomerMutationAction) {
  return (
    action === 'pause_subscription' ||
    action === 'resume_subscription' ||
    action === 'change_subscription_price'
  );
}

function restoreQueryData<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  previousData: T | undefined,
) {
  if (previousData === undefined) {
    queryClient.removeQueries({ queryKey, exact: true });
    return;
  }

  queryClient.setQueryData(queryKey, previousData);
}

export function useCustomerMutation<TAction extends CustomerMutationAction>(
  customerId: string,
  action: TAction,
  options?: UseCustomerMutationOptions<TAction>,
) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['admin', 'customer-mutation', customerId, action],
    onMutate: async (
      input: CustomerMutationInput<TAction>,
    ): Promise<OptimisticCustomerSnapshot | undefined> => {
      if (!shouldApplyOptimisticPatch(action)) {
        return undefined;
      }

      await queryClient.cancelQueries({ queryKey: qk.customers.all() });

      const snapshot: OptimisticCustomerSnapshot = {
        customerLists: queryClient.getQueriesData<CustomerListPayload>({
          queryKey: qk.customers.all(),
        }),
        customerDetail: queryClient.getQueryData<CustomerDetail>(qk.customers.detail(customerId)),
        customerSubscription: queryClient.getQueryData<CustomerSubscription | null>(
          qk.customers.subscription(customerId),
        ),
      };

      queryClient.setQueriesData<CustomerListPayload>(
        { queryKey: qk.customers.all() },
        (current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            customers: current.customers.map((row) =>
              patchCustomerListRow(row, customerId, action, input),
            ),
          };
        },
      );

      queryClient.setQueryData<CustomerDetail>(
        qk.customers.detail(customerId),
        (current) => {
          if (!current) {
            return current;
          }

          return patchCustomerDetail(current, action, input);
        },
      );

      queryClient.setQueryData<CustomerSubscription | null>(
        qk.customers.subscription(customerId),
        (current) => patchCustomerSubscription(current ?? null, action),
      );

      return snapshot;
    },
    mutationFn: async (
      input: CustomerMutationInput<TAction>,
    ): Promise<CustomerActionResult & { ok: true }> => {
      addAdminBreadcrumb('admin.customer.action', {
        phase: 'start',
        action,
        customer_id: customerId,
      });

      const result =
        action === 'archive_customer'
          ? await archiveCustomer(customerId)
          : await callCustomerAction(customerId, {
              action,
              ...(input as Record<string, unknown>),
            } as Extract<CustomerAction, { action: TAction }>);

      if (!result.ok) {
        captureAdminError('admin.customer.action', result.error, {
          action,
          customer_id: customerId,
        });
        throw new ApiError(result.status, result.error, undefined, undefined, result.details);
      }

      addAdminBreadcrumb('admin.customer.action', {
        phase: 'success',
        action,
        customer_id: customerId,
      });

      return result;
    },
    onSuccess: async (result, input) => {
      await invalidateAdminScopes(
        queryClient,
        customerMutationRefreshScopes(customerId, action),
      );

      if (options?.refresh === true) {
        router.refresh();
      }

      await options?.onSuccess?.(result, input);
    },
    onError: (error, _input, context) => {
      if (context) {
        for (const [queryKey, previousData] of context.customerLists) {
          restoreQueryData(queryClient, queryKey, previousData);
        }

        restoreQueryData(queryClient, qk.customers.detail(customerId), context.customerDetail);
        restoreQueryData(
          queryClient,
          qk.customers.subscription(customerId),
          context.customerSubscription,
        );
      }

      captureAdminError('admin.customer.action', error, {
        action,
        customer_id: customerId,
      });
      toast.error(error instanceof Error ? error.message : 'Kunde inte uppdatera kunden');
    },
  });
}
