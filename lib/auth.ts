export const AUTH_STORAGE_KEY = "mak_tender_authenticated";
export const AUTH_COOKIE_KEY = "mak_tender_authenticated";
export const AUTH_ROLE_COOKIE_KEY = "mak_tender_role";
export const AUTH_STATE_EVENT = "mak-tender-auth-change";
export const AUTH_USER_KEY = "mak_tender_dummy_user";
const DUMMY_USERS_KEY = "mak_tender_dummy_users";
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export type DummyAuthUser = {
  role: "vendor" | "employee";
  vendorId?: number;
  employeeId?: number;
  username: string;
  vendorName: string;
  email: string;
  contactName: string;
};

export function getStoredAuthState() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(AUTH_STORAGE_KEY) === "true";
}

export function setStoredAuthState(isAuthenticated: boolean, user?: DummyAuthUser) {
  if (typeof window === "undefined") {
    return;
  }

  if (isAuthenticated) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, "true");
    if (user) window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    if (user) document.cookie = `${AUTH_ROLE_COOKIE_KEY}=${user.role}; path=/; max-age=${AUTH_COOKIE_MAX_AGE}; SameSite=Lax`;
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

type StoredDummyUser = DummyAuthUser & { password: string };

function getDummyUsers(): StoredDummyUser[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(DUMMY_USERS_KEY) ?? "[]") as StoredDummyUser[];
  } catch {
    return [];
  }
}

export function registerDummyVendor(input: {
  username: string;
  password: string;
  companyName: string;
  companyEmail: string;
  contactName: string;
}) {
  const users = getDummyUsers();
  if (users.some((user) => user.username.toLowerCase() === input.username.toLowerCase())) {
    return { success: false, message: "Энэ хэрэглэгчийн нэр бүртгэлтэй байна." };
  }

  const user: StoredDummyUser = {
    role: "vendor",
    vendorId: Date.now(),
    username: input.username,
    password: input.password,
    vendorName: input.companyName,
    email: input.companyEmail,
    contactName: input.contactName,
  };
  window.localStorage.setItem(DUMMY_USERS_KEY, JSON.stringify([...users, user]));
  return { success: true, user };
}

export function authenticateDummyUser(username: string, password: string) {
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedPassword = password.trim();

  if (normalizedUsername === "employee" && normalizedPassword === "employee123") {
    return {
      role: "employee",
      employeeId: 2048,
      username: "employee",
      vendorName: "Монголын Алт (МАК) ХХК",
      email: "buyer@mak.mn",
      contactName: "Б. Худалдан авалт",
    } satisfies DummyAuthUser;
  }
  if (normalizedUsername === "test" && normalizedPassword === "test123") {
    return {
      role: "vendor",
      vendorId: 1001,
      username: "test",
      vendorName: "Тест нийлүүлэгч ХХК",
      email: "test@company.mn",
      contactName: "Тест хэрэглэгч",
    } satisfies DummyAuthUser;
  }
  const user = getDummyUsers().find(
    (item) => item.username.trim().toLowerCase() === normalizedUsername && item.password === normalizedPassword,
  );
  if (!user) return null;
  const { password: _password, role: _role, ...profile } = user;
  return { role: "vendor" as const, ...profile };
}

export function getStoredUser(): DummyAuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(AUTH_USER_KEY) ?? "null") as DummyAuthUser | null;
  } catch {
    return null;
  }
}
