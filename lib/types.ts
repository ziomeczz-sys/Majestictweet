export type UserRole = "owner" | "admin" | "user";

export type UserBadge = {
  label: string;
  color: string;
  icon: string;
};

export type User = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  color: string;
  role: UserRole;
  verified: boolean;
  password: string;
  avatarUrl?: string;
  bannerUrl?: string;
  badge?: UserBadge;
  passwordUpdatedAt?: string;
  followingIds?: string[];
  online?: boolean;
};

export type Announcement = {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  linkUrl?: string;
  createdAt: string;
};

export type QuickLink = {
  id: string;
  label: string;
  url: string;
  icon?: string;
  createdAt: string;
};

export type Comment = {
  id: string;
  author: User;
  text: string;
  createdAt: string;
};

export type Post = {
  id: string;
  author: User;
  text: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt?: string;
  hashtags: string[];
  likes: string[];
  bookmarks: string[];
  reposts: string[];
  pinned?: boolean;
  comments: Comment[];
};
