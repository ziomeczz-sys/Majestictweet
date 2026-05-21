import type { Announcement, Comment, Post, QuickLink, User, UserRole } from "./types";

export type SessionUser = {
  id: string;
  username: string;
  role: UserRole;
};

export type StoredUser = User & {
  email?: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredPost = Omit<Post, "author" | "comments"> & {
  authorId: string;
};

export type StoredComment = Omit<Comment, "author"> & {
  postId: string;
  authorId: string;
};

export type DatabaseSchema = {
  users: StoredUser[];
  posts: StoredPost[];
  comments: StoredComment[];
  postLikes: Array<{ postId: string; userId: string; createdAt: string }>;
  postBookmarks: Array<{ postId: string; userId: string; createdAt: string }>;
  postReposts: Array<{ postId: string; userId: string; createdAt: string }>;
  follows: Array<{ followerId: string; followingId: string; createdAt: string }>;
  notifications: Array<{ id: string; userId: string; type: string; message: string; readAt?: string; createdAt: string }>;
  sessions: Array<{ tokenHash: string; userId: string; expiresAt: string; createdAt: string }>;
  announcements: Announcement[];
  quickLinks: QuickLink[];
};

export interface SocialRepository {
  getUserByUsername(username: string): Promise<StoredUser | null>;
  getUserById(id: string): Promise<StoredUser | null>;
  updateUserProfile(userId: string, data: Partial<Pick<User, "displayName" | "bio" | "avatarUrl" | "badge">>): Promise<StoredUser>;
  listFeed(): Promise<Post[]>;
  createPost(data: { authorId: string; text: string; imageUrl?: string; hashtags: string[] }): Promise<Post>;
  updatePost(postId: string, text: string, hashtags: string[]): Promise<Post>;
  deletePost(postId: string): Promise<void>;
  toggleLike(postId: string, userId: string): Promise<void>;
  toggleBookmark(postId: string, userId: string): Promise<void>;
  toggleRepost(postId: string, userId: string): Promise<void>;
  toggleFollow(followerId: string, followingId: string): Promise<void>;
  addComment(postId: string, authorId: string, text: string): Promise<Comment>;
  setVerified(userId: string, verified: boolean): Promise<StoredUser>;
  changeUserPassword(actorId: string, targetUserId: string, newPassword: string): Promise<void>;
  listAnnouncements(): Promise<Announcement[]>;
  createAnnouncement(actorId: string, data: Omit<Announcement, "id" | "createdAt">): Promise<Announcement>;
  deleteAnnouncement(actorId: string, announcementId: string): Promise<void>;
  listQuickLinks(): Promise<QuickLink[]>;
  createQuickLink(actorId: string, data: Omit<QuickLink, "id" | "createdAt">): Promise<QuickLink>;
  deleteQuickLink(actorId: string, quickLinkId: string): Promise<void>;
}
