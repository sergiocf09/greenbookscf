import * as Sentry from '@sentry/react';

export function initSentry() {
  Sentry.init({
    dsn: 'https://e4753e5722cc2eed7cba2c693d3e850a@o4511174903005184.ingest.us.sentry.io/4511174927253504',
    environment: import.meta.env.MODE ?? 'production',
    tracesSampleRate: 0.2,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    beforeSend(event) {
      if (import.meta.env.DEV) return null;
      return event;
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
    Sentry.captureException(error, { extra: context });
  }
}
