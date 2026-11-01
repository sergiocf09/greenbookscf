import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';

function Harness() {
  const [v, setV] = useState(0);
  return <Input type="number" data-testid="n" value={v} onChange={(e) => setV(parseInt(e.target.value) || 0)} />;
}

describe('number input', () => {
  it('lets the user delete a 0 and type a new value', () => {
    const { getByTestId } = render(<Harness />);
    const el = getByTestId('n') as HTMLInputElement;
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value: '' } });
    expect(el.value).toBe('');
    fireEvent.change(el, { target: { value: '12' } });
    expect(el.value).toBe('12');
  });
});
