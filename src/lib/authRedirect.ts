const CUSTOM_AUTH_ORIGIN = 'https://golfgreenbookscf.com';

const isLocalHost = (hostname: string) => hostname === 'localhost' || hostname === '127.0.0.1';

export const getAuthRedirectOrigin = () => {
  if (typeof window === 'undefined') return CUSTOM_AUTH_ORIGIN;

  const { origin, hostname } = window.location;

  if (isLocalHost(hostname) || hostname === 'golfgreenbookscf.com' || hostname === 'www.golfgreenbookscf.com') {
    return origin;
  }

  return CUSTOM_AUTH_ORIGIN;
};

export const getAuthRedirectUrl = (path = '') => `${getAuthRedirectOrigin()}${path}`;