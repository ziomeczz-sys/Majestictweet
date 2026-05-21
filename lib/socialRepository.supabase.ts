import { supabase } from "./supabase";
import type { Announcement, Comment, Post, QuickLink, User, UserBadge, UserRole } from "./types";

const SESSION_USER_KEY = "majestic-session-user-id";

export type UsersRow = {
  id: string;
  username: string;
  password: string;
  bio?: string | null;
  avatar?: string | null;
  avatar_url?: string | null;
  banner?: string | null;
  banner_url?: string | null;
  display_name?: string | null;
  color?: string | null;
  role?: UserRole | string | null;
  verified?: boolean | null;
  badge_label?: string | null;
  badge_color?: string | null;
  badge_icon?: string | null;
  online?: boolean | null;
  created_at?: string | null;
};

export type PostsRow = {
  id: string;
  user_id: string;
  content: string;
  image?: string | null;
  created_at: string;
  pinned?: boolean | null;
};

export type CommentsRow = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

export type LikesRow = {
  id?: string;
  post_id: string;
  user_id: string;
};

export type FollowsRow = {
  id?: string;
  follower_id: string;
  following_id: string;
  created_at?: string;
};

export type AnnouncementsRow = {
  id: string;
  title: string;
  description: string;
  image_url?: string | null;
  link_url?: string | null;
  created_at: string;
};

export type QuickLinksRow = {
  id: string;
  label: string;
  url: string;
  icon?: string | null;
  created_at: string;
};

export type FeedBundle = {
  users: User[];
  posts: Post[];
};

function extractHashtags(text: string) {
  return Array.from(new Set((text.match(/#[a-zA-Z0-9_-]+/g) || []).map((tag) => tag.slice(1))));
}

function formatRelativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "teraz";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return date.toLocaleDateString("pl-PL");
}

function badgeFromRole(role: UserRole): UserBadge | undefined {
  if (role === "owner") return { label: "CEO", color: "#38bdf8", icon: "" };
  if (role === "admin") return { label: "ADMIN", color: "#a855f7", icon: "" };
  return undefined;
}

function mapUserRow(row: UsersRow, followingIds: string[] = []): User {
  const role = (row.role as UserRole) || "user";
  const badge =
    row.badge_label && row.badge_color
      ? { label: row.badge_label, color: row.badge_color, icon: row.badge_icon || "" }
      : badgeFromRole(role);

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name?.trim() || row.username,
    bio: row.bio || "",
    color: row.color || "#38bdf8",
    role,
    verified: Boolean(row.verified),
    password: row.password,
    avatarUrl: row.avatar || row.avatar_url || undefined,
    bannerUrl: row.banner || row.banner_url || undefined,
    badge,
    followingIds,
    online: Boolean(row.online),
  };
}

function buildFollowingMap(follows: FollowsRow[]) {
  const map = new Map<string, string[]>();
  follows.forEach((row) => {
    const current = map.get(row.follower_id) || [];
    current.push(row.following_id);
    map.set(row.follower_id, current);
  });
  return map;
}

function mapRowsToPosts(
  postRows: PostsRow[],
  usersById: Map<string, User>,
  likes: LikesRow[],
  comments: CommentsRow[],
): Post[] {
  const likesByPost = new Map<string, string[]>();
  likes.forEach((row) => {
    const current = likesByPost.get(row.post_id) || [];
    current.push(row.user_id);
    likesByPost.set(row.post_id, current);
  });

  const commentsByPost = new Map<string, Comment[]>();
  comments.forEach((row) => {
    const author = usersById.get(row.user_id);
    if (!author) return;
    const current = commentsByPost.get(row.post_id) || [];
    current.push({
      id: row.id,
      author,
      text: row.content,
      createdAt: formatRelativeDate(row.created_at),
    });
    commentsByPost.set(row.post_id, current);
  });

  return postRows.map((row) => {
    const author = usersById.get(row.user_id);
    const text = row.content || "";
    return {
      id: row.id,
      author: author || {
        id: row.user_id,
        username: "unknown",
        displayName: "Unknown",
        bio: "",
        color: "#64748b",
        role: "user",
        verified: false,
        password: "",
        followingIds: [],
      },
      text,
      imageUrl: row.image || undefined,
      createdAt: formatRelativeDate(row.created_at),
      hashtags: extractHashtags(text),
      likes: likesByPost.get(row.id) || [],
      bookmarks: [],
      reposts: [],
      comments: commentsByPost.get(row.id) || [],
      pinned: Boolean(row.pinned),
    };
  });
}

async function safeSelect<T>(table: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select("*");
  if (error) {
    if (error.message.includes("Could not find the table")) return [];
    throw error;
  }
  return (data as T[]) || [];
}

export const socialRepository = {
  sessionKey: SESSION_USER_KEY,

  persistSession(userId: string | null, remember: boolean) {
    if (typeof window === "undefined") return;
    if (!remember || !userId) {
      window.sessionStorage.removeItem(SESSION_USER_KEY);
      return;
    }
    window.sessionStorage.setItem(SESSION_USER_KEY, userId);
  },

  async restoreSession(): Promise<User | null> {
    if (typeof window === "undefined") return null;
    const userId = window.sessionStorage.getItem(SESSION_USER_KEY);
    if (!userId) return null;
    return this.getUserById(userId);
  },

  async listUsers(): Promise<User[]> {
    const [userRows, followRows] = await Promise.all([safeSelect<UsersRow>("users"), safeSelect<FollowsRow>("follows")]);
    const followingMap = buildFollowingMap(followRows);
    return userRows.map((row) => mapUserRow(row, followingMap.get(row.id) || []));
  },

  async getUserById(id: string): Promise<User | null> {
    const { data, error } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const followRows = await safeSelect<FollowsRow>("follows");
    const followingMap = buildFollowingMap(followRows);
    return mapUserRow(data as UsersRow, followingMap.get(id) || []);
  },

  async getUserByUsername(username: string): Promise<User | null> {
    const { data, error } = await supabase.from("users").select("*").eq("username", username).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const followRows = await safeSelect<FollowsRow>("follows");
    const followingMap = buildFollowingMap(followRows);
    return mapUserRow(data as UsersRow, followingMap.get(data.id) || []);
  },

  async registerUser(input: { username: string; displayName: string; password: string }): Promise<User> {
    const username = input.username.trim().toLowerCase();
    const { data, error } = await supabase
      .from("users")
      .insert({
        username,
        password: input.password,
        bio: input.displayName.trim(),
        role: "user",
        verified: false,
      })
      .select()
      .single();
    if (error) throw error;
    return mapUserRow(data as UsersRow, []);
  },

  async loginUser(username: string, password: string): Promise<User | null> {
    const user = await this.getUserByUsername(username.trim().toLowerCase());
    if (!user || user.password !== password) return null;
    return user;
  },

  async updateUserProfile(
    userId: string,
    input: Pick<User, "displayName" | "bio" | "avatarUrl" | "bannerUrl">,
  ): Promise<User> {
    const payload: Record<string, string | null> = {
      bio: input.bio,
      avatar: input.avatarUrl || null,
      display_name: input.displayName,
    };
    if (input.bannerUrl !== undefined) payload.banner = input.bannerUrl || null;

    let { data, error } = await supabase.from("users").update(payload).eq("id", userId).select().single();
    if (error?.message?.includes("Could not find the")) {
      const retry = await supabase
        .from("users")
        .update({ bio: input.bio, avatar: input.avatarUrl || null })
        .eq("id", userId)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    const followRows = await safeSelect<FollowsRow>("follows");
    const followingMap = buildFollowingMap(followRows);
    return mapUserRow(data as UsersRow, followingMap.get(userId) || []);
  },

  async changeUserPassword(userId: string, password: string): Promise<void> {
    const { error } = await supabase.from("users").update({ password }).eq("id", userId);
    if (error) throw error;
  },

  async setUserVerified(userId: string, verified: boolean): Promise<User> {
    const { data, error } = await supabase.from("users").update({ verified }).eq("id", userId).select().single();
    if (error) throw error;
    const followRows = await safeSelect<FollowsRow>("follows");
    const followingMap = buildFollowingMap(followRows);
    return mapUserRow(data as UsersRow, followingMap.get(userId) || []);
  },

  async updateUserBadge(userId: string, badge: UserBadge, role?: UserRole): Promise<User> {
    const payload: Record<string, string> = {
      badge_label: badge.label,
      badge_color: badge.color,
      badge_icon: badge.icon,
    };
    if (role) payload.role = role;
    const { data, error } = await supabase.from("users").update(payload).eq("id", userId).select().single();
    if (error) {
      const fallback: Record<string, string> = {};
      if (role) fallback.role = role;
      const retry = await supabase.from("users").update(fallback).eq("id", userId).select().single();
      if (retry.error) throw retry.error;
      const followRows = await safeSelect<FollowsRow>("follows");
      const followingMap = buildFollowingMap(followRows);
      return mapUserRow(retry.data as UsersRow, followingMap.get(userId) || []);
    }
    const followRows = await safeSelect<FollowsRow>("follows");
    const followingMap = buildFollowingMap(followRows);
    return mapUserRow(data as UsersRow, followingMap.get(userId) || []);
  },

  async fetchFeedBundle(): Promise<FeedBundle> {
    const [userRows, postRows, likeRows, commentRows, followRows] = await Promise.all([
      safeSelect<UsersRow>("users"),
      supabase.from("posts").select("*").order("created_at", { ascending: false }).then((result) => {
        if (result.error) throw result.error;
        return (result.data as PostsRow[]) || [];
      }),
      safeSelect<LikesRow>("likes"),
      supabase
        .from("comments")
        .select("*")
        .order("created_at", { ascending: true })
        .then((result) => {
          if (result.error) throw result.error;
          return (result.data as CommentsRow[]) || [];
        }),
      safeSelect<FollowsRow>("follows"),
    ]);

    const followingMap = buildFollowingMap(followRows);
    const users = userRows.map((row) => mapUserRow(row, followingMap.get(row.id) || []));
    const usersById = new Map(users.map((user) => [user.id, user]));
    const posts = mapRowsToPosts(postRows, usersById, likeRows, commentRows);
    return { users, posts };
  },

  async createPost(authorId: string, text: string, imageUrl?: string) {
    const { data, error } = await supabase
      .from("posts")
      .insert({ user_id: authorId, content: text, image: imageUrl || null })
      .select()
      .single();
    if (error) throw error;
    return data as PostsRow;
  },

  async updatePost(postId: string, text: string) {
    const { error } = await supabase.from("posts").update({ content: text }).eq("id", postId);
    if (error) throw error;
  },

  async deletePost(postId: string) {
    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error) throw error;
  },

  async toggleLike(postId: string, userId: string) {
    const { data: existing, error: readError } = await supabase
      .from("likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) throw readError;
    if (existing) {
      const { error } = await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", userId);
      if (error) throw error;
      return false;
    }
    const { error } = await supabase.from("likes").insert({ post_id: postId, user_id: userId });
    if (error) throw error;
    return true;
  },

  async addComment(postId: string, userId: string, text: string) {
    const { data, error } = await supabase
      .from("comments")
      .insert({ post_id: postId, user_id: userId, content: text })
      .select()
      .single();
    if (error) throw error;
    return data as CommentsRow;
  },

  async deleteComment(commentId: string) {
    const { error } = await supabase.from("comments").delete().eq("id", commentId);
    if (error) throw error;
  },

  async listFollows(): Promise<FollowsRow[]> {
    return safeSelect<FollowsRow>("follows");
  },

  async toggleFollow(followerId: string, followingId: string) {
    const { data: existing, error: readError } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", followerId)
      .eq("following_id", followingId)
      .maybeSingle();
    if (readError) {
      if (readError.message.includes("Could not find the table")) return false;
      throw readError;
    }
    if (existing) {
      const { error } = await supabase.from("follows").delete().eq("follower_id", followerId).eq("following_id", followingId);
      if (error) throw error;
      return false;
    }
    const { error } = await supabase.from("follows").insert({ follower_id: followerId, following_id: followingId });
    if (error) throw error;
    return true;
  },

  async listAnnouncements(): Promise<Announcement[]> {
    const rows = await safeSelect<AnnouncementsRow>("announcements");
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      imageUrl: row.image_url || undefined,
      linkUrl: row.link_url || undefined,
      createdAt: formatRelativeDate(row.created_at),
    }));
  },

  async createAnnouncement(input: Omit<Announcement, "id" | "createdAt">) {
    const { data, error } = await supabase
      .from("announcements")
      .insert({
        title: input.title,
        description: input.description,
        image_url: input.imageUrl || null,
        link_url: input.linkUrl || null,
      })
      .select()
      .single();
    if (error) throw error;
    const row = data as AnnouncementsRow;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      imageUrl: row.image_url || undefined,
      linkUrl: row.link_url || undefined,
      createdAt: formatRelativeDate(row.created_at),
    } satisfies Announcement;
  },

  async deleteAnnouncement(id: string) {
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) throw error;
  },

  async listQuickLinks(): Promise<QuickLink[]> {
    const rows = await safeSelect<QuickLinksRow>("quick_links");
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      url: row.url,
      icon: row.icon || undefined,
      createdAt: formatRelativeDate(row.created_at),
    }));
  },

  async createQuickLink(input: Omit<QuickLink, "id" | "createdAt">) {
    const { data, error } = await supabase
      .from("quick_links")
      .insert({ label: input.label, url: input.url, icon: input.icon || null })
      .select()
      .single();
    if (error) throw error;
    const row = data as QuickLinksRow;
    return {
      id: row.id,
      label: row.label,
      url: row.url,
      icon: row.icon || undefined,
      createdAt: formatRelativeDate(row.created_at),
    } satisfies QuickLink;
  },

  async deleteQuickLink(id: string) {
    const { error } = await supabase.from("quick_links").delete().eq("id", id);
    if (error) throw error;
  },

  subscribeFeed(onChange: () => void) {
    const realtimeTables = ["posts", "comments", "likes", "users", "follows", "announcements", "quick_links"] as const;
    const channel = supabase.channel("majestic-feed-realtime");

    realtimeTables.forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => onChange());
    });

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },
};
