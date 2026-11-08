import * as Sentry from '@sentry/react';
import type { ErrorEvent, EventHint } from '@sentry/react';

/**
 * Backend/auth clients reject with plain objects ({ code, message, details, hint, status }),
 * which Sentry can only report as "Object captured as promise rejection with keys: …".
 * Rewrite those events so the code and message become the visible title and the
 * remaining fields are attached as searchable context.
 */
export function describePlainRejection(value: unknown): {
  title: string;
  type: string;
  fields: Record<string, unknown>;
} | null {
  if (!value || typeof value !== 'object' || value instanceof Error) return null;
  const obj = value as Record<string, unknown>;
  const pick = (k: string) => (typeof obj[k] === 'string' || typeof obj[k] === 'number' ? String(obj[k]) : undefined);
  const code = pick('code') ?? pick('error_code') ?? pick('error');
  const message = pick('message') ?? pick('msg') ?? pick('error_description') ?? pick('details');
  if (!code && !message) return null;

  const fields: Record<string, unknown> = {};
  for (const key of ['code', 'message', 'details', 'hint', 'status', 'statusCode', 'name', 'error', 'error_code', 'error_description']) {
    if (obj[key] !== undefined && obj[key] !== null) fields[key] = obj[key];
  }
  const name = pick('name');
  return {
    title: [code, message].filter(Boolean).join(': '),
    type: name && name !== 'Error' ? name : 'BackendError',
    fields,
  };
}

export function normalizeSentryEvent(event: ErrorEvent, hint?: EventHint): ErrorEvent {
  const described = describePlainRejection(hint?.originalException);
  const first = event.exception?.values?.[0];
  if (!described || !first) return event;

  const wasUnhandled = first.type === 'UnhandledRejection' || first.mechanism?.type === 'onunhandledrejection';
  first.type = described.type;
  first.value = wasUnhandled ? `Unhandled rejection · ${described.title}` : described.title;
  event.extra = { ...event.extra, backend_error: described.fields };
  const code = described.fields.code ?? described.fields.error_code;
  if (code !== undefined) {
    event.tags = { ...event.tags, error_code: String(code) };
    event.fingerprint = ['backend-error', described.type, String(code)];
  }
  return event;
}

export function initSentry() {
  Sentry.init({
    dsn: 'https://e4753e5722cc2eed7cba2c693d3e850a@o4511174903005184.ingest.us.sentry.io/4511174927253504',
    environment: import.meta.env.MODE ?? 'production',
    tracesSampleRate: 0.2,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    beforeSend(event, hint) {
      if (import.meta.env.DEV) return null;
      return normalizeSentryEvent(event, hint);
    },
  });
}

export function setSentryUser(userId: string, email?: string) {
  Sentry.setUser({ id: userId, email });
}

export function clearSentryUser() {
  Sentry.setUser(null);
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  console.error('[Error]', error, context);
  if (import.meta.env.PROD) {
    const described = describePlainRejection(error);
    if (described) {
      const wrapped = new Error(described.title);
      wrapped.name = described.type;
      Sentry.captureException(wrapped, { extra: { ...context, backend_error: described.fields } });
      return;
    }
    Sentry.captureException(error, { extra: context });
  }
}
