import { describe, expect, it, vi } from 'vitest';
import {
  configureSubscriptionSchedule,
  createScheduleFromSubscription,
} from './subscription-schedule';

describe('subscription-schedule wrapper', () => {
  function buildStripeMock() {
    const create = vi.fn().mockResolvedValue({ id: 'sub_sched_123' });
    const update = vi.fn().mockResolvedValue({ id: 'sub_sched_123' });

    return {
      stripe: {
        subscriptionSchedules: { create, update },
      } as unknown as Parameters<typeof createScheduleFromSubscription>[0]['stripe'],
      create,
      update,
    };
  }

  it('sends only from_subscription on create', async () => {
    const { stripe, create } = buildStripeMock();

    await createScheduleFromSubscription({
      stripe,
      subscriptionId: 'sub_abc',
      idempotencyKey: 'req-1',
    });

    expect(create).toHaveBeenCalledTimes(1);
    const [payload, options] = create.mock.calls[0];
    expect(Object.keys(payload)).toEqual(['from_subscription']);
    expect(payload.from_subscription).toBe('sub_abc');
    expect(payload).not.toHaveProperty('end_behavior');
    expect(payload).not.toHaveProperty('phases');
    expect(payload).not.toHaveProperty('default_settings');
    expect(payload).not.toHaveProperty('customer');
    expect(options).toEqual({ idempotencyKey: 'req-1' });
  });

  it('omits idempotency options when absent', async () => {
    const { stripe, create } = buildStripeMock();

    await createScheduleFromSubscription({ stripe, subscriptionId: 'sub_abc' });

    const [, options] = create.mock.calls[0];
    expect(options).toBeUndefined();
  });

  it('sends configuration through update', async () => {
    const { stripe, create, update } = buildStripeMock();

    await configureSubscriptionSchedule({
      stripe,
      scheduleId: 'sub_sched_123',
      idempotencyKey: 'req-2',
      payload: {
        end_behavior: 'release',
        proration_behavior: 'none',
        phases: [],
      },
    });

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    const [scheduleId, payload, options] = update.mock.calls[0];
    expect(scheduleId).toBe('sub_sched_123');
    expect(payload.end_behavior).toBe('release');
    expect(payload.proration_behavior).toBe('none');
    expect(options).toEqual({ idempotencyKey: 'req-2' });
  });
});
