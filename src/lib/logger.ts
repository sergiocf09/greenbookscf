type LogArgs = unknown[];

const isDev = import.meta.env.DEV;

export const devLog = (...args: LogArgs) => {
  if (!isDev) return;
  // eslint-disable-next-line no-console
  console.log(...args);
};

export const devWarn = (...args: LogArgs) => {
  if (!isDev) return;
  // eslint-disable-next-line no-console
  console.warn(...args);
};

export const devError = (...args: LogArgs) => {
  if (!isDev) return;
  // eslint-disable-next-line no-console
  console.error(...args);
};
