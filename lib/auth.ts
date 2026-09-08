export const AUTH_STORAGE_KEY = 'mak_tender_authenticated';
export const AUTH_COOKIE_KEY = 'mak_tender_authenticated';
export const AUTH_ROLE_COOKIE_KEY = 'mak_tender_role';
export const AUTH_STATE_EVENT = 'mak-tender-auth-change';
export const AUTH_USER_KEY = 'mak_tender_user';
const LEGACY_AUTH_USER_KEY = 'mak_tender_dummy_user';
const LEGACY_USERS_KEY = 'mak_tender_dummy_users';
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export type AuthUser = {
  role: 'vendor' | 'employee';
  vendorId?: number;
  employeeId?: number;
  userId?: number;
  token?: string;
  username: string;
  vendorName: string;
  email: string;
  contactName: string;
};

export function getStoredAuthState() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(AUTH_STORAGE_KEY) === 'true';
}

export function setStoredAuthState(isAuthenticated: boolean, user?: AuthUser) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(LEGACY_AUTH_USER_KEY);
  window.localStorage.removeItem(LEGACY_USERS_KEY);

  if (isAuthenticated) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, 'true');
    if (user) window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    if (user)
      document.cookie = `${AUTH_ROLE_COOKIE_KEY}=${user.role}; path=/; max-age=${AUTH_COOKIE_MAX_AGE}; SameSite=Lax`;
    document.cookie = `${AUTH_COOKIE_KEY}=true; path=/; max-age=${AUTH_COOKIE_MAX_AGE}; SameSite=Lax`;
  } else {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_USER_KEY);
    document.cookie = `${AUTH_COOKIE_KEY}=; path=/; max-age=0; SameSite=Lax`;
    document.cookie = `${AUTH_ROLE_COOKIE_KEY}=; path=/; max-age=0; SameSite=Lax`;
  }

  window.dispatchEvent(new Event(AUTH_STATE_EVENT));
}

export function clearStoredAuthState() {
  setStoredAuthState(false);
}

export function getLoginRedirectPath(path: string) {
  return `/login?redirect=${encodeURIComponent(path)}`;
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(AUTH_USER_KEY) ?? 'null'
    ) as AuthUser | null;
    if (stored) return stored;

    const legacy = JSON.parse(
      window.localStorage.getItem(LEGACY_AUTH_USER_KEY) ?? 'null'
    ) as AuthUser | null;
    if (!legacy) return null;
    const isRemovedLocalEmployee =
      legacy.role === 'employee' &&
      legacy.employeeId === 2048 &&
      legacy.username.toLowerCase() === 'employee' &&
      !legacy.token;
    if (isRemovedLocalEmployee) {
      setStoredAuthState(false);
      return null;
    }
    setStoredAuthState(true, legacy);
    return legacy;
  } catch {
    return null;
  }
}
