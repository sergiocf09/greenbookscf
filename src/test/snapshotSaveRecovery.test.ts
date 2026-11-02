import { describe, expect, it, vi } from 'vitest';
import { saveSnapshotWithRecovery } from '@/lib/snapshotSaveRecovery';

describe('snapshot save response recovery', () => {
  it('continues when the response is lost but this attempt was committed', async () => {
    const write = vi.fn().mockResolvedValue({ error: new TypeError('Failed to fetch') });
    await expect(saveSnapshotWithRecovery(write, async () => true)).resolves.toBeUndefined();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('does not accept an older snapshot as a successful save', async () => {
    const error = new TypeError('Failed to fetch');
    await expect(saveSnapshotWithRecovery(async () => ({ error }), async () => false)).rejects.toBe(error);
  });

  it('does not bypass permission or integrity failures', async () => {
    const error = { message: 'permission denied', code: '42501' };
    const verify = vi.fn();
    await expect(saveSnapshotWithRecovery(async () => ({ error }), verify)).rejects.toBe(error);
    expect(verify).not.toHaveBeenCalled();
  });

  it('recovers thrown transport errors without duplicating writes', async () => {
    await expect(saveSnapshotWithRecovery(async () => { throw new TypeError('Load failed'); }, async () => true)).resolves.toBeUndefined();
  });

  it('keeps the original error if verification is unavailable', async () => {
    const error = new TypeError('Failed to fetch');
    await expect(saveSnapshotWithRecovery(async () => ({ error }), async () => { throw new Error('offline'); })).rejects.toBe(error);
  });
});