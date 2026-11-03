import { beforeEach, describe, expect, it, vi } from 'vitest';
const query = vi.hoisted(() => ({ from: vi.fn(), delete: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: query.from } }));
import { removePersistedRoundPlayer } from '@/lib/removeRoundPlayer';

beforeEach(() => {
  vi.clearAllMocks();
  query.from.mockReturnValue(query);
  query.delete.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);
});

describe('persisted player removal', () => {
  it('removes the requested second-group player only from the specified round', async () => {
    query.maybeSingle.mockResolvedValue({ data: { id: 'jorge' }, error: null });
    await expect(removePersistedRoundPlayer('sergio-round', 'jorge')).resolves.toBeUndefined();
    expect(query.from).toHaveBeenCalledWith('round_players');
    expect(query.eq.mock.calls).toEqual([['round_id', 'sergio-round'], ['id', 'jorge']]);
  });
  it('does not report removal when permissions delete zero rows', async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(removePersistedRoundPlayer('sergio-round', 'luis')).rejects.toThrow('not saved');
  });
  it('propagates a failed deletion instead of allowing local-only removal', async () => {
    const error = new Error('delete failed');
    query.maybeSingle.mockResolvedValue({ data: null, error });
    await expect(removePersistedRoundPlayer('sergio-round', 'felipe')).rejects.toBe(error);
  });
});