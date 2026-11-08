import { describe, it, expect } from 'vitest';
import type { ErrorEvent } from '@sentry/react';
import { describePlainRejection, normalizeSentryEvent } from '@/lib/sentry';

describe('Sentry plain-object rejection normalization', () => {
  it('turns a backend error object into a readable title with its code', () => {
    const event = {
      exception: { values: [{ type: 'UnhandledRejection', value: 'Object captured as promise rejection with keys: code, details, hint, message', mechanism: { type: 'onunhandledrejection', handled: false } }] },
    } as ErrorEvent;
    const out = normalizeSentryEvent(event, {
      originalException: { code: '42501', message: 'new row violates row-level security policy', details: null, hint: null },
    });
    expect(out.exception?.values?.[0].value).toBe('Unhandled rejection · 42501: new row violates row-level security policy');
    expect(out.tags?.error_code).toBe('42501');
    expect(out.fingerprint).toEqual(['backend-error', 'BackendError', '42501']);
  });

  it('leaves real Error instances untouched', () => {
    expect(describePlainRejection(new Error('boom'))).toBeNull();
    const event = { exception: { values: [{ type: 'Error', value: 'boom' }] } } as ErrorEvent;
    expect(normalizeSentryEvent(event, { originalException: new Error('boom') }).exception?.values?.[0].value).toBe('boom');
  });
});
