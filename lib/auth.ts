import type { SessionUser, StoredUser } from "./database";

export type LoginInput = {
  username: string;
  password: string;
};

export type AuthSession = {
  token: string;
  user: SessionUser;
  expiresAt: string;
  rememberMe: boolean;
};

export type RegisterInput = {
  username: string;
  displayName: string;
  password: string;
};

export type AuthTokenPayload = {
  sub: string;
  username: string;
  role: SessionUser["role"];
  iat: number;
  exp: number;
};

export function isOwner(user: SessionUser | null) {
  return user?.role === "owner";
}

export function isAdmin(user: SessionUser | null) {
  return user?.role === "owner" || user?.role === "admin";
}

export function canDeleteResource(actor: SessionUser | null, ownerId: string) {
  return Boolean(actor && (actor.id === ownerId || actor.role === "owner" || actor.role === "admin"));
}

export function canEditResource(actor: SessionUser | null, ownerId: string) {
  return Boolean(actor && actor.id === ownerId);
}

export function requireAuth(actor: SessionUser | null) {
  if (!actor) throw new Error("Authentication required");
  return actor;
}

export function requireAdmin(actor: SessionUser | null) {
  if (!isAdmin(actor)) throw new Error("Admin permission required");
  return actor;
}

export function toSessionUser(user: StoredUser): SessionUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
  };
}
