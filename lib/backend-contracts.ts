import type { Announcement, Post, QuickLink, User, UserBadge } from "./types";

export type SessionUser = Pick<User, "id" | "role" | "username">;

export type CreatePostInput = {
  text: string;
  imageUrl?: string;
  authorId: string;
};

export type UpdatePostInput = {
  postId: string;
  text: string;
  actorId: string;
};

export type UpdateProfileInput = {
  userId: string;
  displayName: string;
  bio: string;
  avatarUrl?: string;
  bannerUrl?: string;
  currentPassword?: string;
  newPassword?: string;
};

export type ChangeUserPasswordInput = {
  targetUserId: string;
  newPassword: string;
  actorId: string;
};

export type UpdateBadgeInput = {
  targetUserId: string;
  badge: UserBadge;
  actorId: string;
};

export type SetVerifiedInput = {
  targetUserId: string;
  verified: boolean;
  actorId: string;
};

export type CreateAnnouncementInput = Omit<Announcement, "id" | "createdAt"> & {
  actorId: string;
};

export type CreateQuickLinkInput = Omit<QuickLink, "id" | "createdAt"> & {
  actorId: string;
};

export type AuthRoutePolicy = {
  protected: boolean;
  roles?: Array<SessionUser["role"]>;
};

export function canDeletePost(actor: SessionUser, post: Pick<Post, "author">) {
  return actor.id === post.author.id || actor.role === "owner" || actor.role === "admin";
}

export function canEditPost(actor: SessionUser, post: Pick<Post, "author">) {
  return actor.id === post.author.id;
}

export function canManageBadges(actor: SessionUser) {
  return actor.role === "owner";
}

export function canManageAdminContent(actor: SessionUser) {
  return actor.role === "owner" || actor.role === "admin";
}
