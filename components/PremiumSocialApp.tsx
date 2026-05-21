"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ChangeEvent, Dispatch, DragEvent, FormEvent, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { socialRepository } from "@/lib/socialRepository.supabase";
import type { Announcement, Post, QuickLink, User, UserBadge } from "@/lib/types";

type View = "home" | "profile" | "admin";
type AuthMode = "login" | "register";
type ProfileForm = { displayName: string; bio: string; avatarUrl: string; bannerUrl: string; currentPassword: string; newPassword: string };
type BadgeDraft = Record<string, UserBadge>;
type Toast = { id: string; type: "success" | "error" | "info"; message: string };
type AuthForm = { username: string; password: string; displayName: string; remember: boolean };
type AnnouncementDraft = Pick<Announcement, "title" | "description" | "imageUrl" | "linkUrl">;
type QuickLinkDraft = Pick<QuickLink, "label" | "url" | "icon">;
type PasswordDrafts = Record<string, string>;

const USERNAME_PATTERN = /^[a-z0-9_.-]+$/;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const navItems = [
  { id: "home", label: "Glowna", icon: "H" },
  { id: "profile", label: "Profil", icon: "P" },
  { id: "admin", label: "Panel", icon: "A" },
] as const;

const badgePresets: UserBadge[] = [
  { label: "CEO", color: "#38bdf8", icon: "" },
  { label: "ADMIN", color: "#a855f7", icon: "" },
  { label: "VERIFIED", color: "#22c55e", icon: "" },
  { label: "VIP", color: "#f59e0b", icon: "" },
];

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function extractHashtags(text: string) {
  return Array.from(new Set((text.match(/#[a-zA-Z0-9_-]+/g) || []).map((tag) => tag.slice(1))));
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function canModerate(user: User | null) {
  return user?.role === "owner" || user?.role === "admin";
}

function canManageBadges(user: User | null) {
  return user?.role === "owner";
}

function readImage(file: File, callback: (url: string) => void, onError?: (message: string) => void) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    onError?.("Dozwolone formaty zdjec: JPG, PNG, WEBP albo GIF.");
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    onError?.("Zdjecie jest za duze. Maksymalny rozmiar to 5 MB.");
    return;
  }
  try {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        onError?.("Nie udalo sie odczytac zdjecia.");
        return;
      }
      callback(reader.result);
    };
    reader.onerror = () => onError?.("Upload zdjecia nie powiodl sie. Sprobuj ponownie.");
    reader.readAsDataURL(file);
  } catch {
    onError?.("Upload zdjecia nie powiodl sie. Sprobuj ponownie.");
  }
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function validateAuthForm(mode: AuthMode, form: AuthForm, users: User[]) {
  const username = normalizeUsername(form.username);
  if (username.length < 3) return "Username musi miec minimum 3 znaki.";
  if (!USERNAME_PATTERN.test(username)) return "Username moze zawierac tylko litery, cyfry, kropke, myslnik i underscore.";
  if (mode === "register" && form.password.length < 8) return "Haslo musi miec minimum 8 znakow.";
  if (mode === "login" && !form.password) return "Podaj haslo.";
  if (mode === "register" && form.displayName.trim().length < 3) return "Nazwa profilu musi miec minimum 3 znaki.";
  if (mode === "register" && users.some((user) => normalizeUsername(user.username) === username)) return "Ten username jest juz zajety.";
  return "";
}

function normalizeUser(user: User): User {
  return {
    ...user,
    password: user.password || "password123",
    followingIds: user.followingIds || [],
    online: user.online ?? false,
  };
}

function normalizePost(post: Post): Post {
  return {
    ...post,
    hashtags: post.hashtags || extractHashtags(post.text),
    likes: post.likes || [],
    bookmarks: post.bookmarks || [],
    reposts: post.reposts || [],
    comments: (post.comments || []).map((comment) => ({ ...comment, author: normalizeUser(comment.author) })),
    author: normalizeUser(post.author),
  };
}

function Avatar({ user, large = false }: { user: User; large?: boolean }) {
  const size = large ? "h-24 w-24 text-3xl" : "h-12 w-12 text-base";
  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-sky-300 to-violet-500 font-black text-white shadow-glow ${size}`}
      style={{ boxShadow: `0 0 34px ${user.color}44` }}
    >
      {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(user.displayName)}
    </div>
  );
}

function UserBadgePill({ badge, verified }: { badge?: UserBadge; verified?: boolean }) {
  if (!badge && !verified) return null;
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1.5 align-middle">
      {badge && (
        <motion.span
          className="relative inline-flex h-7 max-w-[160px] items-center gap-1.5 overflow-hidden rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-lg transition duration-300 hover:scale-105"
          style={{
            borderColor: `${badge.color}7a`,
            background: `linear-gradient(135deg, ${badge.color}38, rgba(255,255,255,0.08))`,
            boxShadow: `0 0 24px ${badge.color}35, inset 0 1px 0 rgba(255,255,255,0.22)`,
          }}
          whileHover={{ y: -1 }}
        >
          <span className="absolute inset-x-1 top-0 h-px bg-white/60" />
          {badge.icon && <span className="grid h-4 w-4 place-items-center rounded-full bg-white/15 text-[9px]">{badge.icon}</span>}
          <span className="truncate">{badge.label}</span>
        </motion.span>
      )}
      {verified && (
        <span className="inline-flex h-7 items-center rounded-full border border-sky-300/40 bg-sky-300/15 px-2 text-[11px] font-black text-sky-100 shadow-glow">
          VERIFIED
        </span>
      )}
    </span>
  );
}

export default function PremiumSocialApp() {
  const [view, setView] = useState<View>("home");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [session, setSession] = useState<User | null>(null);
  const [visitedProfileId, setVisitedProfileId] = useState<string | null>(null);
  const [authForm, setAuthForm] = useState<AuthForm>({ username: "", password: "", displayName: "", remember: true });
  const [authError, setAuthError] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([]);
  const [draft, setDraft] = useState("");
  const [draftImage, setDraftImage] = useState("");
  const [activeHashtag, setActiveHashtag] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<{ id: string; text: string } | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [profileOpen, setProfileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    displayName: "",
    bio: "",
    avatarUrl: "",
    bannerUrl: "",
    currentPassword: "",
    newPassword: "",
  });
  const [announcementDraft, setAnnouncementDraft] = useState<AnnouncementDraft>({
    title: "",
    description: "",
    imageUrl: "",
    linkUrl: "",
  });
  const [quickLinkDraft, setQuickLinkDraft] = useState<QuickLinkDraft>({ label: "", url: "", icon: "" });
  const [passwordDrafts, setPasswordDrafts] = useState<PasswordDrafts>({});
  const [badgeDrafts, setBadgeDrafts] = useState<BadgeDraft>({});
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const appShellRef = useRef<HTMLElement | null>(null);
  const refreshRef = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refreshPlatformData() {
    const requestId = ++refreshRef.current;
    try {
      const [feed, announcementRows, quickLinkRows] = await Promise.all([
        socialRepository.fetchFeedBundle(),
        socialRepository.listAnnouncements(),
        socialRepository.listQuickLinks(),
      ]);
      if (requestId !== refreshRef.current) return;
      setUsers(feed.users.map(normalizeUser));
      setPosts(feed.posts.map(normalizePost));
      setAnnouncements(announcementRows);
      setQuickLinks(quickLinkRows);
      setBadgeDrafts(
        Object.fromEntries(feed.users.map((user) => [user.id, user.badge || { label: "", color: "#38bdf8", icon: "*" }])),
      );
      setSession((current) => {
        if (!current) return current;
        return feed.users.find((user) => user.id === current.id) || current;
      });
    } catch {
      if (requestId !== refreshRef.current) return;
      setToasts((current) => [
        { id: uid("toast"), type: "error" as const, message: "Nie udalo sie zaladowac danych z Supabase." },
        ...current,
      ].slice(0, 3));
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const restored = await socialRepository.restoreSession();
        if (!cancelled && restored) {
          setSession(normalizeUser(restored));
          setProfileForm(buildProfileForm(restored));
        }
      } catch {
        socialRepository.persistSession(null, false);
      }
      await refreshPlatformData();
    }

    bootstrap();
    const unsubscribe = socialRepository.subscribeFeed(() => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        refreshPlatformData();
      }, 200);
    });

    return () => {
      cancelled = true;
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!visitedProfileId || users.some((user) => user.id === visitedProfileId)) return;
    socialRepository
      .getUserById(visitedProfileId)
      .then((user) => {
        if (!user) return;
        setUsers((current) => (current.some((item) => item.id === user.id) ? current : [...current, normalizeUser(user)]));
      })
      .catch(() => undefined);
  }, [visitedProfileId, users]);

  const visiblePosts = useMemo(
    () => {
      const filtered = activeHashtag ? posts.filter((post) => post.hashtags.includes(activeHashtag)) : posts;
      const searched = searchQuery.trim().toLowerCase()
        ? filtered.filter((post) => `${post.text} ${post.author.displayName} ${post.author.username}`.toLowerCase().includes(searchQuery.trim().toLowerCase()))
        : filtered;
      return [...searched].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
    },
    [activeHashtag, posts, searchQuery],
  );

  const trendingHashtags = useMemo(() => {
    const map = new Map<string, number>();
    posts.forEach((post) => post.hashtags.forEach((tag) => map.set(tag, (map.get(tag) || 0) + 1)));
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [posts]);

  const stats = useMemo(
    () => [
      { label: "Posty", value: posts.length.toString().padStart(2, "0") },
      { label: "Uzytkownicy", value: users.length.toString().padStart(2, "0") },
      { label: "Komentarze", value: posts.reduce((sum, post) => sum + post.comments.length, 0).toString().padStart(2, "0") },
    ],
    [posts, users.length],
  );

  const displayedProfile = useMemo(
    () => (visitedProfileId ? users.find((user) => user.id === visitedProfileId) : session) || session,
    [visitedProfileId, session, users],
  );

  const selectedProfilePosts = useMemo(
    () => posts.filter((post) => post.author.id === displayedProfile?.id),
    [posts, displayedProfile?.id],
  );

  useEffect(() => {
    if (view !== "profile") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    appShellRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [view, visitedProfileId, session?.id]);

  useEffect(() => {
    if (visitedProfileId && !users.some((user) => user.id === visitedProfileId)) {
      setVisitedProfileId(null);
    }
  }, [visitedProfileId, users]);

  useEffect(() => {
    document.body.style.overflow = profileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [profileOpen]);

  function showOwnProfile() {
    setVisitedProfileId(null);
    setView("profile");
  }

  function navigateView(nextView: View) {
    if (nextView !== "profile") setVisitedProfileId(null);
    setView(nextView);
  }

  function openVisitedProfile(userId: string) {
    setVisitedProfileId(userId);
    setView("profile");
  }

  function buildProfileForm(user: User): ProfileForm {
    return {
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarUrl || "",
      bannerUrl: user.bannerUrl || "",
      currentPassword: "",
      newPassword: "",
    };
  }

  function toast(message: string, type: Toast["type"] = "info") {
    const item = { id: uid("toast"), type, message };
    setToasts((current) => [item, ...current].slice(0, 3));
    window.setTimeout(() => setToasts((current) => current.filter((toastItem) => toastItem.id !== item.id)), 3200);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    const validation = validateAuthForm(authMode, authForm, users);
    if (validation) {
      setAuthError(validation);
      toast(validation, "error");
      return;
    }
    setLoading(true);
    try {
      const username = normalizeUsername(authForm.username);
      if (authMode === "login") {
        const loggedIn = await socialRepository.loginUser(username, authForm.password);
        if (!loggedIn) {
          setAuthError("Niepoprawny login albo haslo.");
          toast("Niepoprawny login albo haslo.", "error");
          return;
        }
        const user = normalizeUser(loggedIn);
        setSession(user);
        setVisitedProfileId(null);
        setProfileForm(buildProfileForm(user));
        socialRepository.persistSession(user.id, authForm.remember);
        toast("Zalogowano.", "success");
      } else {
        const taken = await socialRepository.getUserByUsername(username);
        if (taken) {
          setAuthError("Ten username jest juz zajety.");
          toast("Ten username jest juz zajety.", "error");
          return;
        }
        const createdUser = normalizeUser(
          await socialRepository.registerUser({
            username,
            displayName: authForm.displayName.trim(),
            password: authForm.password,
          }),
        );
        setSession(createdUser);
        setVisitedProfileId(null);
        setProfileForm(buildProfileForm(createdUser));
        socialRepository.persistSession(createdUser.id, authForm.remember);
        setView("profile");
        toast("Konto utworzone.", "success");
      }
      await refreshPlatformData();
    } catch {
      setAuthError("Operacja logowania nie powiodla sie.");
      toast("Operacja logowania nie powiodla sie.", "error");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setSession(null);
    setVisitedProfileId(null);
    setAccountOpen(false);
    setView("home");
    setAuthForm({ username: "", password: "", displayName: "", remember: true });
    socialRepository.persistSession(null, false);
    toast("Wylogowano.", "info");
  }

  function syncUser(updated: User) {
    setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
    setPosts((current) =>
      current.map((post) => ({
        ...post,
        author: post.author.id === updated.id ? updated : post.author,
        comments: post.comments.map((comment) => (comment.author.id === updated.id ? { ...comment, author: updated } : comment)),
      })),
    );
    setSession((current) => (current?.id === updated.id ? updated : current));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    if (profileForm.newPassword) {
      if (profileForm.currentPassword !== session.password) {
        toast("Aktualne haslo jest niepoprawne.", "error");
        return;
      }
      if (profileForm.newPassword.length < 8) {
        toast("Nowe haslo musi miec minimum 8 znakow.", "error");
        return;
      }
    }
    try {
      const updated = normalizeUser(
        await socialRepository.updateUserProfile(session.id, {
          displayName: profileForm.displayName.trim() || session.displayName,
          bio: profileForm.bio.trim(),
          avatarUrl: profileForm.avatarUrl || undefined,
          bannerUrl: profileForm.bannerUrl || undefined,
        }),
      );
      if (profileForm.newPassword) {
        await socialRepository.changeUserPassword(session.id, profileForm.newPassword);
        updated.password = profileForm.newPassword;
        updated.passwordUpdatedAt = "teraz";
      }
      syncUser(updated);
      setProfileForm(buildProfileForm(updated));
      setProfileOpen(false);
      toast("Profil zapisany.", "success");
    } catch {
      toast("Nie udalo sie zapisac profilu.", "error");
    }
  }

  async function publishPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || (!draft.trim() && !draftImage)) return;
    const text = draft.trim();
    try {
      await socialRepository.createPost(session.id, text, draftImage || undefined);
      setDraft("");
      setDraftImage("");
      await refreshPlatformData();
    } catch {
      toast("Nie udalo sie opublikowac posta.", "error");
    }
  }

  async function deletePost(postId: string) {
    const target = posts.find((post) => post.id === postId);
    if (!session || !target) return;
    if (target.author.id !== session.id && !canModerate(session)) return;
    try {
      await socialRepository.deletePost(postId);
      await refreshPlatformData();
    } catch {
      toast("Nie udalo sie usunac posta.", "error");
    }
  }

  async function savePostEdit(postId: string) {
    if (!editingPost) return;
    const text = editingPost.text.trim();
    try {
      await socialRepository.updatePost(postId, text);
      setEditingPost(null);
      await refreshPlatformData();
    } catch {
      toast("Nie udalo sie zapisac edycji posta.", "error");
    }
  }

  async function toggleLike(postId: string) {
    if (!session) return;
    try {
      await socialRepository.toggleLike(postId, session.id);
      await refreshPlatformData();
    } catch {
      toast("Nie udalo sie zaktualizowac polubienia.", "error");
    }
  }

  function toggleBookmark(postId: string) {
    if (!session) return;
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              bookmarks: post.bookmarks.includes(session.id)
                ? post.bookmarks.filter((id) => id !== session.id)
                : [...post.bookmarks, session.id],
            }
          : post,
      ),
    );
    toast("Zaktualizowano zapisane posty.", "success");
  }

  function toggleRepost(postId: string) {
    if (!session) return;
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              reposts: post.reposts.includes(session.id)
                ? post.reposts.filter((id) => id !== session.id)
                : [...post.reposts, session.id],
            }
          : post,
      ),
    );
  }

  async function toggleFollow(targetId: string) {
    if (!session || targetId === session.id) return;
    try {
      await socialRepository.toggleFollow(session.id, targetId);
      await refreshPlatformData();
      toast("Zaktualizowano obserwowanych.", "success");
    } catch {
      toast("Nie udalo sie zaktualizowac obserwowanych.", "error");
    }
  }

  async function addComment(postId: string) {
    if (!session) return;
    const text = (commentDrafts[postId] || "").trim();
    if (!text) return;
    try {
      await socialRepository.addComment(postId, session.id, text);
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
      await refreshPlatformData();
    } catch {
      toast("Nie udalo sie dodac komentarza.", "error");
    }
  }

  async function deleteComment(commentId: string) {
    if (!session) return;
    const target = posts.flatMap((post) => post.comments).find((comment) => comment.id === commentId);
    if (!target) return;
    if (target.author.id !== session.id && !canModerate(session)) return;
    try {
      await socialRepository.deleteComment(commentId);
      await refreshPlatformData();
    } catch {
      toast("Nie udalo sie usunac komentarza.", "error");
    }
  }

  async function updateBadge(userId: string) {
    const badge = badgeDrafts[userId];
    const role = badge.label === "CEO" ? "owner" : badge.label === "ADMIN" ? "admin" : "user";
    try {
      const updated = normalizeUser(await socialRepository.updateUserBadge(userId, badge, role));
      syncUser(updated);
      await refreshPlatformData();
      toast("Tag przypisany.", "success");
    } catch {
      toast("Nie udalo sie przypisac tagu.", "error");
    }
  }

  async function toggleVerified(userId: string) {
    if (!canModerate(session)) return;
    const target = users.find((user) => user.id === userId);
    if (!target) return;
    try {
      const updated = normalizeUser(await socialRepository.setUserVerified(userId, !target.verified));
      syncUser(updated);
      await refreshPlatformData();
      toast("Zmieniono status verified.", "success");
    } catch {
      toast("Nie udalo sie zmienic statusu verified.", "error");
    }
  }

  async function changeUserPassword(userId: string) {
    if (!canModerate(session)) return;
    const newPassword = (passwordDrafts[userId] || "").trim();
    if (newPassword.length < 8) {
      toast("Haslo musi miec minimum 8 znakow.", "error");
      return;
    }
    const target = users.find((user) => user.id === userId);
    if (!target || target.role === "owner") return;
    try {
      await socialRepository.changeUserPassword(userId, newPassword);
      syncUser({ ...target, password: newPassword, passwordUpdatedAt: "teraz" });
      setPasswordDrafts((current) => ({ ...current, [userId]: "" }));
      toast("Haslo uzytkownika zostalo zmienione.", "success");
    } catch {
      toast("Nie udalo sie zmienic hasla.", "error");
    }
  }

  async function addAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canModerate(session)) return;
    if (!announcementDraft.title.trim() || !announcementDraft.description.trim()) {
      toast("Uzupelnij tytul i opis ogloszenia.", "error");
      return;
    }
    try {
      await socialRepository.createAnnouncement({
        title: announcementDraft.title.trim(),
        description: announcementDraft.description.trim(),
        imageUrl: announcementDraft.imageUrl || undefined,
        linkUrl: announcementDraft.linkUrl?.trim() || undefined,
      });
      setAnnouncementDraft({ title: "", description: "", imageUrl: "", linkUrl: "" });
      await refreshPlatformData();
      toast("Ogloszenie dodane.", "success");
    } catch {
      toast("Nie udalo sie dodac ogloszenia.", "error");
    }
  }

  async function deleteAnnouncement(id: string) {
    if (!canModerate(session)) return;
    try {
      await socialRepository.deleteAnnouncement(id);
      await refreshPlatformData();
      toast("Ogloszenie usuniete.", "info");
    } catch {
      toast("Nie udalo sie usunac ogloszenia.", "error");
    }
  }

  async function addQuickLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canModerate(session)) return;
    if (!quickLinkDraft.label.trim() || !quickLinkDraft.url.trim()) {
      toast("Podaj nazwe przycisku i URL.", "error");
      return;
    }
    try {
      await socialRepository.createQuickLink({
        label: quickLinkDraft.label.trim(),
        url: quickLinkDraft.url.trim(),
        icon: quickLinkDraft.icon?.trim().slice(0, 2) || undefined,
      });
      setQuickLinkDraft({ label: "", url: "", icon: "" });
      await refreshPlatformData();
      toast("Przycisk dodany.", "success");
    } catch {
      toast("Nie udalo sie dodac przycisku.", "error");
    }
  }

  async function deleteQuickLink(id: string) {
    if (!canModerate(session)) return;
    try {
      await socialRepository.deleteQuickLink(id);
      await refreshPlatformData();
      toast("Przycisk usuniety.", "info");
    } catch {
      toast("Nie udalo sie usunac przycisku.", "error");
    }
  }

  return (
    <main ref={appShellRef} className="relative min-h-screen overflow-hidden px-3 pb-28 pt-4 text-slate-100 sm:px-5 lg:px-7 lg:pb-4">
      <BackgroundFX />
      <AnimatePresence mode="wait">
        {!session ? (
          <AuthScreen
            authMode={authMode}
            setAuthMode={setAuthMode}
            authForm={authForm}
            setAuthForm={setAuthForm}
            authError={authError}
            loading={loading}
            submitAuth={submitAuth}
            stats={stats}
          />
        ) : (
          <motion.section
            key="app"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mx-auto grid max-w-[1540px] gap-4 lg:grid-cols-[270px_minmax(0,730px)_370px]"
          >
            <Sidebar session={session} view={view} setView={navigateView} showOwnProfile={showOwnProfile} logout={logout} />
            <section className="glass min-h-[calc(100vh-2rem)] overflow-hidden rounded-[2rem]">
              <header className="sticky top-4 z-20 border-b border-white/10 bg-black/20 px-5 py-5 backdrop-blur-2xl sm:px-7">
                <p className="text-xs font-black uppercase tracking-[0.3em] text-sky-200">Majestic Network</p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-2xl font-black text-white">{view === "home" ? "CEO ziomeczz" : view === "profile" ? "Profil" : "Panel CEO"}</h2>
                  <div className="relative flex items-center gap-2">
                    {activeHashtag && (
                      <button className="rounded-full border border-sky-300/30 bg-sky-300/10 px-4 py-2 text-sm font-bold text-sky-100" onClick={() => setActiveHashtag(null)} type="button">
                        #{activeHashtag} x
                      </button>
                    )}
                    <button className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-2 py-2 pr-4 text-sm font-bold text-white transition hover:border-sky-300/30 hover:bg-sky-300/10" onClick={() => setAccountOpen((open) => !open)} type="button">
                      <Avatar user={session} />
                      <span className="hidden sm:inline">@{session.username}</span>
                    </button>
                    <AnimatePresence>
                      {accountOpen && (
                        <motion.div initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96 }} className="glass absolute right-0 top-16 z-40 w-72 rounded-3xl p-4">
                          <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                            <Avatar user={session} />
                            <div className="min-w-0">
                              <p className="truncate font-black text-white">{session.displayName}</p>
                              <p className="truncate text-sm text-slate-400">@{session.username}</p>
                            </div>
                          </div>
                          <button className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-left font-bold text-slate-200 transition hover:bg-white/[0.09]" onClick={() => { showOwnProfile(); setAccountOpen(false); }} type="button">Profil i ustawienia</button>
                          <button className="mt-2 w-full rounded-2xl border border-red-300/20 bg-red-400/10 px-4 py-3 text-left font-bold text-red-100 transition hover:bg-red-400/20" onClick={logout} type="button">Wyloguj</button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </header>

              {view === "home" && (
                <>
                  <Composer
                    draft={draft}
                    draftImage={draftImage}
                    setDraft={setDraft}
                    setDraftImage={setDraftImage}
                    publishPost={publishPost}
                    session={session}
                    onUploadError={(message) => toast(message, "error")}
                  />
                  <div className="divide-y divide-white/10">
                    {visiblePosts.map((post, index) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        index={index}
                        session={session}
                        editingPost={editingPost}
                        setEditingPost={setEditingPost}
                        savePostEdit={savePostEdit}
                        deletePost={deletePost}
                        toggleLike={toggleLike}
                        toggleBookmark={toggleBookmark}
                        toggleRepost={toggleRepost}
                        commentDraft={commentDrafts[post.id] || ""}
                        setCommentDraft={(value) => setCommentDrafts((current) => ({ ...current, [post.id]: value }))}
                        addComment={addComment}
                        setActiveHashtag={setActiveHashtag}
                        openProfile={openVisitedProfile}
                      />
                    ))}
                  </div>
                </>
              )}

              {view === "profile" && displayedProfile && (
                <ProfilePanel
                  profile={displayedProfile}
                  session={session}
                  posts={selectedProfilePosts}
                  users={users}
                  openProfileEditor={() => {
                    setProfileForm(buildProfileForm(session));
                    setProfileOpen(true);
                  }}
                  toggleFollow={toggleFollow}
                  openProfile={openVisitedProfile}
                  setActiveHashtag={setActiveHashtag}
                />
              )}
              {view === "admin" && (
                <AdminPanel
                  users={users}
                  announcements={announcements}
                  quickLinks={quickLinks}
                  badgeDrafts={badgeDrafts}
                  passwordDrafts={passwordDrafts}
                  announcementDraft={announcementDraft}
                  quickLinkDraft={quickLinkDraft}
                  setBadgeDrafts={setBadgeDrafts}
                  setPasswordDrafts={setPasswordDrafts}
                  setAnnouncementDraft={setAnnouncementDraft}
                  setQuickLinkDraft={setQuickLinkDraft}
                  updateBadge={updateBadge}
                  toggleVerified={toggleVerified}
                  changeUserPassword={changeUserPassword}
                  addAnnouncement={addAnnouncement}
                  deleteAnnouncement={deleteAnnouncement}
                  addQuickLink={addQuickLink}
                  deleteQuickLink={deleteQuickLink}
                  onUploadError={(message) => toast(message, "error")}
                  canVerify={canModerate(session)}
                  canManage={canManageBadges(session)}
                />
              )}
            </section>
            <RightRail
              stats={stats}
              trendingHashtags={trendingHashtags}
              users={users}
              session={session}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              toggleFollow={toggleFollow}
              setActiveHashtag={setActiveHashtag}
              announcements={announcements}
              quickLinks={quickLinks}
              openProfile={openVisitedProfile}
            />
            <MobileNav session={session} view={view} setView={navigateView} showOwnProfile={showOwnProfile} logout={logout} />
          </motion.section>
        )}
      </AnimatePresence>

      <ProfileModal
        open={profileOpen}
        form={profileForm}
        setForm={setProfileForm}
        onUploadError={(message) => toast(message, "error")}
        onClose={() => setProfileOpen(false)}
        onSubmit={saveProfile}
      />
      <ToastStack toasts={toasts} />
    </main>
  );
}

function AuthScreen({
  authMode,
  setAuthMode,
  authForm,
  setAuthForm,
  authError,
  loading,
  submitAuth,
  stats,
}: {
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  authForm: AuthForm;
  setAuthForm: Dispatch<SetStateAction<AuthForm>>;
  authError: string;
  loading: boolean;
  submitAuth: (event: FormEvent<HTMLFormElement>) => void;
  stats: { label: string; value: string }[];
}) {
  return (
    <motion.section
      key="auth"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]"
    >
      <div className="glass relative overflow-hidden rounded-[2rem] p-7 sm:p-10 lg:p-14">
        <div className="absolute right-8 top-8 h-32 w-32 rounded-full bg-sky-400/20 blur-3xl" />
        <p className="mb-5 inline-flex rounded-full border border-sky-300/25 bg-sky-300/10 px-4 py-2 text-sm font-bold text-sky-100">Majestic Roleplay</p>
        <h1 className="max-w-3xl text-5xl font-black leading-[0.95] tracking-tight text-white sm:text-7xl lg:text-8xl">
          Majestic <span className="bg-gradient-to-r from-sky-200 via-blue-300 to-violet-300 bg-clip-text text-transparent">Roleplay</span>
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
          Witamy na stronie, zarejestruj sie lub zaloguj i daj swojego pierwszego tweeta.
        </p>
        <div className="mt-9 grid gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div className="glass-soft rounded-3xl p-5" key={stat.label}>
              <b className="text-3xl text-white">{stat.value}</b>
              <p className="mt-1 text-sm text-slate-400">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
      <motion.form onSubmit={submitAuth} className="glass rounded-[2rem] p-7 sm:p-9" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
        <p className="text-sm font-black uppercase tracking-[0.28em] text-sky-200">secure access</p>
        <h2 className="mt-3 text-3xl font-black text-white">{authMode === "login" ? "Zaloguj sie" : "Zarejestruj sie"}</h2>
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1">
          {(["login", "register"] as const).map((mode) => (
            <button
              className={`rounded-full px-4 py-3 text-sm font-black transition ${authMode === mode ? "bg-sky-300/20 text-white shadow-glow" : "text-slate-400 hover:text-white"}`}
              key={mode}
              onClick={() => setAuthMode(mode)}
              type="button"
            >
              {mode === "login" ? "Zaloguj sie" : "Zarejestruj sie"}
            </button>
          ))}
        </div>
        {authError && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-2xl border border-red-300/25 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
            {authError}
          </motion.div>
        )}
        <label className="mb-4 mt-7 block">
          <span className="mb-2 block text-sm font-bold text-slate-300">Username</span>
          <input
            value={authForm.username}
            onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 text-white outline-none transition focus:border-sky-300/50 focus:bg-white/[0.09] focus:shadow-glow"
            placeholder="np. majestic_user"
            required
          />
        </label>
        <AnimatePresence>
          {authMode === "register" && (
            <motion.label initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-4 block overflow-hidden">
              <span className="mb-2 block text-sm font-bold text-slate-300">Nazwa profilu</span>
              <input
                value={authForm.displayName}
                onChange={(event) => setAuthForm((current) => ({ ...current, displayName: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 text-white outline-none transition focus:border-sky-300/50 focus:bg-white/[0.09] focus:shadow-glow"
                placeholder="Twoja nazwa"
              />
            </motion.label>
          )}
        </AnimatePresence>
        <label className="mb-6 block">
          <span className="mb-2 block text-sm font-bold text-slate-300">Haslo</span>
          <input
            value={authForm.password}
            onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 text-white outline-none transition focus:border-violet-300/50 focus:bg-white/[0.09] focus:shadow-violet"
            placeholder="minimum 8 znakow"
            type="password"
            required
          />
        </label>
        <label className="mb-6 flex items-center gap-3 text-sm font-bold text-slate-300">
          <input checked={authForm.remember} onChange={(event) => setAuthForm((current) => ({ ...current, remember: event.target.checked }))} className="h-5 w-5 accent-sky-400" type="checkbox" />
          Zapamietaj mnie
        </label>
        <button className="premium-button w-full" disabled={loading} type="submit">{loading ? "Ladowanie..." : authMode === "login" ? "Zaloguj sie" : "Utworz konto"}</button>
        <SkeletonPreview loading={loading} />
      </motion.form>
    </motion.section>
  );
}

function BackgroundFX() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <motion.div className="absolute left-[8%] top-[12%] h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" animate={{ x: [0, 40, -10, 0], y: [0, -30, 20, 0] }} transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="absolute right-[10%] top-[8%] h-80 w-80 rounded-full bg-violet-500/25 blur-3xl" animate={{ x: [0, -35, 25, 0], y: [0, 28, -16, 0] }} transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }} />
      {Array.from({ length: 28 }).map((_, index) => (
        <motion.span className="absolute h-1 w-1 rounded-full bg-sky-200/50" key={index} style={{ left: `${(index * 37) % 100}%`, top: `${(index * 53) % 100}%` }} animate={{ opacity: [0.15, 0.8, 0.15], y: [0, -18, 0] }} transition={{ duration: 4 + (index % 5), repeat: Infinity, delay: index * 0.17 }} />
      ))}
    </div>
  );
}

function SkeletonPreview({ loading }: { loading: boolean }) {
  return (
    <AnimatePresence>
      {loading && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-6 space-y-3 overflow-hidden">
          <div className="skeleton-line h-4 w-3/4" />
          <div className="skeleton-line h-4 w-full" />
          <div className="skeleton-line h-4 w-1/2" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed right-4 top-4 z-[60] grid w-[min(360px,calc(100vw-2rem))] gap-3">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.96 }}
            className={`glass rounded-2xl px-4 py-3 text-sm font-bold ${
              toast.type === "error" ? "text-red-100" : toast.type === "success" ? "text-emerald-100" : "text-sky-100"
            }`}
          >
            {toast.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Sidebar({
  session,
  view,
  setView,
  showOwnProfile,
  logout,
}: {
  session: User;
  view: View;
  setView: (view: View) => void;
  showOwnProfile: () => void;
  logout: () => void;
}) {
  return (
    <aside className="glass sticky top-4 hidden h-[calc(100vh-2rem)] rounded-[2rem] p-5 lg:block">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-300 via-blue-500 to-violet-500 text-2xl font-black shadow-glow">M</div>
        <div><b className="text-lg text-white">Majestic</b><p className="text-sm text-slate-400">CEO ziomeczz</p></div>
      </div>
      <nav className="space-y-2">
        {navItems.map((item) => {
          if (item.id === "admin" && !canModerate(session)) return null;
          const active = view === item.id;
          const onNavigate = item.id === "profile" ? showOwnProfile : () => setView(item.id as View);
          return (
            <button className={`group flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left transition duration-300 ${active ? "bg-sky-300/15 text-white shadow-glow" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"}`} key={item.id} onClick={onNavigate} type="button">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] text-xl transition group-hover:bg-sky-300/15">{item.icon}</span>
              <span className="font-bold">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <button className="premium-button mt-7 w-full" type="button" onClick={() => setView("home")}>Nowy post</button>
      <div className="absolute bottom-5 left-5 right-5 rounded-3xl border border-white/10 bg-white/[0.06] p-4">
        <div className="flex items-center gap-3"><Avatar user={session} /><div className="min-w-0"><p className="truncate font-black text-white">{session.displayName}</p><p className="truncate text-sm text-slate-400">@{session.username}</p></div></div>
        <button className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-bold text-slate-200 transition hover:border-red-300/30 hover:bg-red-400/10 hover:text-red-100" onClick={logout} type="button">Wyloguj</button>
      </div>
    </aside>
  );
}

function MobileNav({
  session,
  view,
  setView,
  showOwnProfile,
  logout,
}: {
  session: User;
  view: View;
  setView: (view: View) => void;
  showOwnProfile: () => void;
  logout: () => void;
}) {
  return (
    <nav className="glass fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 gap-2 rounded-[1.5rem] p-2 lg:hidden">
      {navItems.map((item) => {
        if (item.id === "admin" && !canModerate(session)) return null;
        const active = view === item.id;
        const onNavigate = item.id === "profile" ? showOwnProfile : () => setView(item.id as View);
        return (
          <button key={item.id} className={`rounded-2xl px-2 py-3 text-xs font-black transition ${active ? "bg-sky-300/15 text-white shadow-glow" : "text-slate-400 hover:bg-white/[0.06] hover:text-white"}`} onClick={onNavigate} type="button">
            <span className="block text-base">{item.icon}</span>
            {item.label}
          </button>
        );
      })}
      <button className="rounded-2xl px-2 py-3 text-xs font-black text-red-100 transition hover:bg-red-400/10" onClick={logout} type="button">
        <span className="block text-base">X</span>
        Wyloguj
      </button>
    </nav>
  );
}

function ImageDropzone({
  image,
  setImage,
  onError,
  label = "Przeciagnij zdjecie albo kliknij, aby dodac upload",
  compact = false,
}: {
  image: string;
  setImage: (url: string) => void;
  onError?: (message: string) => void;
  label?: string;
  compact?: boolean;
}) {
  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) readImage(file, setImage, onError);
    event.target.value = "";
  }
  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) readImage(file, setImage, onError);
  }
  return (
    <label
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className={`group grid cursor-pointer place-items-center rounded-3xl border border-dashed border-sky-300/30 bg-sky-300/[0.06] p-4 text-center transition hover:border-sky-200/60 hover:bg-sky-300/[0.1] ${compact ? "min-h-24" : "min-h-28"}`}
    >
      {image ? <img src={image} alt="" className={`${compact ? "max-h-44" : "max-h-64"} w-full rounded-2xl object-cover`} /> : <span className="text-sm font-bold text-slate-300">{label}</span>}
      <input type="file" accept="image/*" className="hidden" onChange={onFile} />
    </label>
  );
}

function Composer({
  session,
  draft,
  draftImage,
  setDraft,
  setDraftImage,
  publishPost,
  onUploadError,
}: {
  session: User;
  draft: string;
  draftImage: string;
  setDraft: (value: string) => void;
  setDraftImage: (value: string) => void;
  publishPost: (event: FormEvent<HTMLFormElement>) => void;
  onUploadError: (message: string) => void;
}) {
  return (
    <form onSubmit={publishPost} className="border-b border-white/10 p-5 sm:p-7">
      <div className="flex gap-4">
        <Avatar user={session} />
        <div className="min-w-0 flex-1 space-y-4">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 280))} className="min-h-28 w-full resize-none rounded-3xl border border-white/10 bg-white/[0.045] p-5 text-lg text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/40 focus:bg-white/[0.07]" placeholder="Co chcesz opublikowac? Dodaj #hashtag" />
          <ImageDropzone image={draftImage} setImage={setDraftImage} onError={onUploadError} />
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-bold text-slate-400">{draft.length}/280</span>
            <button className="premium-button px-7" disabled={!draft.trim() && !draftImage} type="submit">Opublikuj</button>
          </div>
        </div>
      </div>
    </form>
  );
}

function RichText({ text, setActiveHashtag }: { text: string; setActiveHashtag: (tag: string) => void }) {
  const parts = text.split(/(#[a-zA-Z0-9_ąćęłńóśźżĄĆĘŁŃÓŚŹŻ-]+)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("#") ? (
          <button key={`${part}-${index}`} type="button" onClick={() => setActiveHashtag(part.slice(1))} className="font-black text-sky-300 transition hover:text-violet-200">
            {part}
          </button>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}

function PostCard({
  post,
  index,
  session,
  editingPost,
  setEditingPost,
  savePostEdit,
  deletePost,
  toggleLike,
  toggleBookmark,
  toggleRepost,
  commentDraft,
  setCommentDraft,
  addComment,
  setActiveHashtag,
  openProfile,
}: {
  post: Post;
  index: number;
  session: User;
  editingPost: { id: string; text: string } | null;
  setEditingPost: (value: { id: string; text: string } | null) => void;
  savePostEdit: (postId: string) => void;
  deletePost: (postId: string) => void;
  toggleLike: (postId: string) => void;
  toggleBookmark: (postId: string) => void;
  toggleRepost: (postId: string) => void;
  commentDraft: string;
  setCommentDraft: (value: string) => void;
  addComment: (postId: string) => void;
  setActiveHashtag: (tag: string) => void;
  openProfile: (userId: string) => void;
}) {
  const liked = post.likes.includes(session.id);
  const bookmarked = post.bookmarks.includes(session.id);
  const reposted = post.reposts.includes(session.id);
  const canEdit = post.author.id === session.id;
  const canDeletePost = canEdit || canModerate(session);
  return (
    <motion.article initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="group p-5 transition duration-300 hover:bg-white/[0.035] sm:p-7">
      <div className="flex gap-4">
        <button type="button" onClick={() => openProfile(post.author.id)} className="h-fit rounded-2xl outline-none transition hover:scale-105 focus:ring-2 focus:ring-sky-300/60">
          <Avatar user={post.author} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => openProfile(post.author.id)} className="font-black text-white transition hover:text-sky-200">{post.author.displayName}</button>
            <UserBadgePill badge={post.author.badge} verified={post.author.verified} />
            <span className="text-sm text-slate-500">@{post.author.username} · {post.updatedAt || post.createdAt}</span>
          </div>
          {editingPost?.id === post.id ? (
            <div className="mt-3 space-y-3">
              <textarea value={editingPost.text} onChange={(event) => setEditingPost({ id: post.id, text: event.target.value })} className="w-full rounded-3xl border border-white/10 bg-black/20 p-4 text-white outline-none focus:border-sky-300/50" />
              <button className="premium-button px-5 py-2 text-sm" onClick={() => savePostEdit(post.id)} type="button">Zapisz</button>
              <button className="ml-2 rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300" onClick={() => setEditingPost(null)} type="button">Anuluj</button>
            </div>
          ) : (
            <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-slate-200"><RichText text={post.text} setActiveHashtag={setActiveHashtag} /></p>
          )}
          {post.imageUrl && <img src={post.imageUrl} alt="" className="mt-4 max-h-[420px] w-full rounded-[1.5rem] border border-white/10 object-cover shadow-2xl shadow-black/30" />}
          <div className="mt-5 flex flex-wrap gap-2">
            {post.hashtags.map((tag) => (
              <button className="rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1 text-xs font-black text-sky-100 transition hover:bg-sky-300/20" key={tag} onClick={() => setActiveHashtag(tag)} type="button">#{tag}</button>
            ))}
          </div>
          <div className="mt-5 grid gap-3 text-sm text-slate-400 sm:grid-cols-3 xl:grid-cols-6">
            <motion.button whileTap={{ scale: 0.92 }} className={`rounded-2xl border px-3 py-2 text-left transition ${liked ? "border-pink-300/40 bg-pink-400/15 text-pink-100" : "border-white/10 bg-white/[0.035] hover:border-pink-300/30 hover:bg-pink-300/10"}`} onClick={() => toggleLike(post.id)} type="button">
              ♥ <b className="float-right text-white">{post.likes.length}</b>
            </motion.button>
            <motion.button whileTap={{ scale: 0.92 }} className={`rounded-2xl border px-3 py-2 text-left transition ${reposted ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-100" : "border-white/10 bg-white/[0.035] hover:border-emerald-300/30 hover:bg-emerald-300/10"}`} onClick={() => toggleRepost(post.id)} type="button">
              Repost <b className="float-right text-white">{post.reposts.length}</b>
            </motion.button>
            <motion.button whileTap={{ scale: 0.92 }} className={`rounded-2xl border px-3 py-2 text-left transition ${bookmarked ? "border-amber-300/40 bg-amber-400/15 text-amber-100" : "border-white/10 bg-white/[0.035] hover:border-amber-300/30 hover:bg-amber-300/10"}`} onClick={() => toggleBookmark(post.id)} type="button">
              Save
            </motion.button>
            <motion.button whileHover={{ y: -2 }} className="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 text-left transition hover:border-sky-300/30 hover:bg-sky-300/10" type="button">
              Komentarze <b className="float-right text-white">{post.comments.length}</b>
            </motion.button>
            {canEdit && <button className="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 text-left transition hover:border-violet-300/30 hover:bg-violet-300/10" onClick={() => setEditingPost({ id: post.id, text: post.text })} type="button">Edytuj</button>}
            {canDeletePost && <button className="rounded-2xl border border-red-300/20 bg-red-400/10 px-3 py-2 text-left text-red-100 transition hover:bg-red-400/20" onClick={() => deletePost(post.id)} type="button">Usun</button>}
          </div>
          <div className="mt-5 space-y-3">
            <AnimatePresence initial={false}>
              {post.comments.map((comment) => (
                <motion.div key={comment.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-3xl border border-white/10 bg-black/20 p-4">
                  <div className="flex gap-3">
                    <button type="button" onClick={() => openProfile(comment.author.id)} className="h-fit rounded-2xl outline-none transition hover:scale-105 focus:ring-2 focus:ring-sky-300/60">
                      <Avatar user={comment.author} />
                    </button>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => openProfile(comment.author.id)} className="font-black text-white transition hover:text-sky-200">{comment.author.displayName}</button><UserBadgePill badge={comment.author.badge} verified={comment.author.verified} /><span className="text-xs text-slate-500">{comment.createdAt}</span></div>
                      <p className="mt-1 text-sm leading-6 text-slate-300">{comment.text}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div className="flex gap-2">
              <input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none focus:border-sky-300/40" placeholder="Dodaj komentarz..." />
              <motion.button whileTap={{ scale: 0.94 }} className="premium-button px-4 py-2 text-sm" onClick={() => addComment(post.id)} type="button">Wyslij</motion.button>
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function ProfilePanel({
  profile,
  session,
  posts,
  users,
  openProfileEditor,
  toggleFollow,
  openProfile,
  setActiveHashtag,
}: {
  profile: User;
  session: User;
  posts: Post[];
  users: User[];
  openProfileEditor: () => void;
  toggleFollow: (userId: string) => void;
  openProfile: (userId: string) => void;
  setActiveHashtag: (tag: string) => void;
}) {
  const isOwnProfile = profile.id === session.id;
  const followers = users.filter((user) => user.followingIds?.includes(profile.id)).length;
  const following = profile.followingIds?.length || 0;
  const isFollowing = session.followingIds?.includes(profile.id);
  return (
    <div className="space-y-5 p-5 sm:p-7">
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.055] backdrop-blur-xl">
        <div className="h-44 bg-gradient-to-r from-sky-400/40 via-blue-500/25 to-violet-500/40">
          {profile.bannerUrl && <img src={profile.bannerUrl} alt="" className="h-full w-full object-cover opacity-85" />}
        </div>
        <div className="relative p-6 pt-0">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-4">
            <Avatar user={profile} large />
            {isOwnProfile ? (
              <button className="premium-button" onClick={openProfileEditor} type="button">Edytuj profil</button>
            ) : (
              <button className="premium-button" onClick={() => toggleFollow(profile.id)} type="button">{isFollowing ? "Obserwujesz" : "Obserwuj"}</button>
            )}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2"><h3 className="text-3xl font-black text-white">{profile.displayName}</h3><UserBadgePill badge={profile.badge} verified={profile.verified} /></div>
          <p className="mt-1 text-slate-400">@{profile.username}</p>
          <p className="mt-5 max-w-xl leading-7 text-slate-200">{profile.bio}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4"><b className="text-2xl text-white">{followers}</b><p className="text-sm text-slate-400">followers</p></div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4"><b className="text-2xl text-white">{following}</b><p className="text-sm text-slate-400">following</p></div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4"><b className="text-2xl text-white">{posts.length}</b><p className="text-sm text-slate-400">posty</p></div>
          </div>
        </div>
      </div>
      <section className="glass-soft overflow-hidden rounded-[2rem]">
        <div className="border-b border-white/10 p-5">
          <h3 className="text-xl font-black text-white">Posty uzytkownika</h3>
        </div>
        <div className="divide-y divide-white/10">
          {posts.length ? posts.map((post, index) => (
            <motion.article key={post.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.035 }} className="p-5">
              <div className="flex flex-wrap items-center gap-2"><Avatar user={profile} /><b className="text-white">{profile.displayName}</b><UserBadgePill badge={profile.badge} verified={profile.verified} /><span className="text-sm text-slate-500">{post.updatedAt || post.createdAt}</span></div>
              <p className="mt-4 whitespace-pre-wrap leading-7 text-slate-200"><RichText text={post.text} setActiveHashtag={setActiveHashtag} /></p>
              {post.imageUrl && <img src={post.imageUrl} alt="" className="mt-4 max-h-80 w-full rounded-3xl border border-white/10 object-cover" />}
            </motion.article>
          )) : (
            <div className="p-6 text-sm text-slate-400">Ten profil nie ma jeszcze postow.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function ProfileModal({
  open,
  form,
  setForm,
  onUploadError,
  onClose,
  onSubmit,
}: {
  open: boolean;
  form: ProfileForm;
  setForm: Dispatch<SetStateAction<ProfileForm>>;
  onUploadError: (message: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-black/70 p-3 backdrop-blur-xl sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.form
            onSubmit={onSubmit}
            initial={{ scale: 0.94, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 20 }}
            className="glass my-4 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden overscroll-contain rounded-[2rem]"
          >
            <div className="shrink-0 border-b border-white/10 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-black uppercase tracking-[0.25em] text-sky-200">Profile Studio</p><h3 className="text-2xl font-black text-white">Edycja profilu</h3></div><button className="icon-chip shrink-0" onClick={onClose} type="button">x</button></div>
            </div>
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain scroll-smooth p-5 sm:p-6">
              <label className="block"><span className="mb-2 block text-sm font-bold text-slate-300">Nazwa</span><input value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white outline-none focus:border-sky-300/50" /></label>
              <label className="block"><span className="mb-2 block text-sm font-bold text-slate-300">Bio</span><textarea value={form.bio} onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} className="max-h-44 min-h-28 w-full resize-y rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white outline-none focus:border-sky-300/50" /></label>
              <ImageDropzone image={form.avatarUrl} setImage={(avatarUrl) => setForm((current) => ({ ...current, avatarUrl }))} onError={onUploadError} label="Avatar profilu" compact />
              <ImageDropzone image={form.bannerUrl} setImage={(bannerUrl) => setForm((current) => ({ ...current, bannerUrl }))} onError={onUploadError} label="Banner profilu" compact />
              <div className="grid gap-4 sm:grid-cols-2">
                <input value={form.currentPassword} onChange={(event) => setForm((current) => ({ ...current, currentPassword: event.target.value }))} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white outline-none" placeholder="Aktualne haslo" type="password" />
                <input value={form.newPassword} onChange={(event) => setForm((current) => ({ ...current, newPassword: event.target.value }))} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white outline-none" placeholder="Nowe haslo" type="password" />
              </div>
            </div>
            <div className="sticky bottom-0 shrink-0 border-t border-white/10 bg-slate-950/75 p-4 backdrop-blur-2xl sm:p-5">
              <button className="premium-button w-full" type="submit">Zapisz zmiany</button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AdminPanel({
  users,
  announcements,
  quickLinks,
  badgeDrafts,
  passwordDrafts,
  announcementDraft,
  quickLinkDraft,
  setBadgeDrafts,
  setPasswordDrafts,
  setAnnouncementDraft,
  setQuickLinkDraft,
  updateBadge,
  toggleVerified,
  changeUserPassword,
  addAnnouncement,
  deleteAnnouncement,
  addQuickLink,
  deleteQuickLink,
  onUploadError,
  canVerify,
  canManage,
}: {
  users: User[];
  announcements: Announcement[];
  quickLinks: QuickLink[];
  badgeDrafts: BadgeDraft;
  passwordDrafts: PasswordDrafts;
  announcementDraft: AnnouncementDraft;
  quickLinkDraft: QuickLinkDraft;
  setBadgeDrafts: Dispatch<SetStateAction<BadgeDraft>>;
  setPasswordDrafts: Dispatch<SetStateAction<PasswordDrafts>>;
  setAnnouncementDraft: Dispatch<SetStateAction<AnnouncementDraft>>;
  setQuickLinkDraft: Dispatch<SetStateAction<QuickLinkDraft>>;
  updateBadge: (userId: string) => void;
  toggleVerified: (userId: string) => void;
  changeUserPassword: (userId: string) => void;
  addAnnouncement: (event: FormEvent<HTMLFormElement>) => void;
  deleteAnnouncement: (id: string) => void;
  addQuickLink: (event: FormEvent<HTMLFormElement>) => void;
  deleteQuickLink: (id: string) => void;
  onUploadError: (message: string) => void;
  canVerify: boolean;
  canManage: boolean;
}) {
  return (
    <div className="space-y-5 p-4 pb-28 sm:p-7 lg:pb-7">
      <div className="rounded-[2rem] border border-violet-300/20 bg-violet-300/10 p-5">
        <p className="text-sm font-black uppercase tracking-[0.28em] text-violet-100">Owner Console</p>
        <h3 className="mt-2 text-2xl font-black text-white">Panel CEO/Admin</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
          Zarzadzaj rangami, haslami, ogloszeniami oraz przyciskami, ktore automatycznie pojawiaja sie po prawej stronie aplikacji.
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={addAnnouncement} className="glass-soft rounded-3xl p-5">
          <p className="text-sm font-black uppercase tracking-[0.24em] text-sky-200">Ogloszenia</p>
          <h3 className="mt-2 text-xl font-black text-white">Dodaj ogloszenie premium</h3>
          <div className="mt-4 grid gap-3">
            <input disabled={!canVerify} value={announcementDraft.title} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, title: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white outline-none focus:border-sky-300/50" placeholder="Tytul ogloszenia" />
            <textarea disabled={!canVerify} value={announcementDraft.description} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, description: event.target.value }))} className="min-h-24 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white outline-none focus:border-sky-300/50" placeholder="Opis ogloszenia" />
            <ImageDropzone image={announcementDraft.imageUrl || ""} setImage={(imageUrl) => setAnnouncementDraft((current) => ({ ...current, imageUrl }))} onError={onUploadError} label="Banner ogloszenia opcjonalnie" />
            <input disabled={!canVerify} value={announcementDraft.linkUrl || ""} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, linkUrl: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white outline-none focus:border-sky-300/50" placeholder="Opcjonalny link URL" />
            <button disabled={!canVerify} className="premium-button disabled:cursor-not-allowed disabled:opacity-40" type="submit">Dodaj ogloszenie</button>
          </div>
          <div className="mt-5 space-y-2">
            {announcements.map((announcement) => (
              <div key={announcement.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3">
                {announcement.imageUrl ? (
                  <img src={announcement.imageUrl} alt="" className="h-14 w-20 rounded-xl object-cover" />
                ) : (
                  <div className="grid h-14 w-20 shrink-0 place-items-center rounded-xl border border-sky-300/20 bg-[radial-gradient(circle_at_30%_20%,rgba(56,189,248,0.28),transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(88,28,135,0.4))] text-xs font-black text-sky-100">
                    INFO
                  </div>
                )}
                <div className="min-w-0 flex-1"><p className="truncate font-black text-white">{announcement.title}</p><p className="truncate text-xs text-slate-400">{announcement.linkUrl || "bez linku"}</p></div>
                <button disabled={!canVerify} onClick={() => deleteAnnouncement(announcement.id)} className="rounded-full border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs font-black text-red-100 disabled:opacity-40" type="button">Usun</button>
              </div>
            ))}
          </div>
        </form>
        <form onSubmit={addQuickLink} className="glass-soft rounded-3xl p-5">
          <p className="text-sm font-black uppercase tracking-[0.24em] text-emerald-200">Link buttons</p>
          <h3 className="mt-2 text-xl font-black text-white">Dodaj przycisk boczny</h3>
          <div className="mt-4 grid gap-3">
            <input disabled={!canVerify} value={quickLinkDraft.label} onChange={(event) => setQuickLinkDraft((current) => ({ ...current, label: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white outline-none focus:border-sky-300/50" placeholder="Nazwa przycisku" />
            <input disabled={!canVerify} value={quickLinkDraft.url} onChange={(event) => setQuickLinkDraft((current) => ({ ...current, url: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white outline-none focus:border-sky-300/50" placeholder="https://..." />
            <input disabled={!canVerify} value={quickLinkDraft.icon || ""} onChange={(event) => setQuickLinkDraft((current) => ({ ...current, icon: event.target.value.slice(0, 2) }))} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white outline-none focus:border-sky-300/50" placeholder="Ikonka opcjonalna, np. D" />
            <button disabled={!canVerify} className="premium-button disabled:cursor-not-allowed disabled:opacity-40" type="submit">Dodaj przycisk</button>
          </div>
          <div className="mt-5 space-y-2">
            {quickLinks.map((link) => (
              <div key={link.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-300/15 font-black text-sky-100">{link.icon || ">"}</span>
                <div className="min-w-0 flex-1"><p className="truncate font-black text-white">{link.label}</p><p className="truncate text-xs text-slate-400">{link.url}</p></div>
                <button disabled={!canVerify} onClick={() => deleteQuickLink(link.id)} className="rounded-full border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs font-black text-red-100 disabled:opacity-40" type="button">Usun</button>
              </div>
            ))}
          </div>
        </form>
      </div>
      {users.map((user) => (
        <div className="glass-soft overflow-hidden rounded-3xl p-4 sm:p-5" key={user.id}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)] xl:items-center">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <Avatar user={user} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-black text-white">{user.displayName}</p>
                <p className="truncate text-sm text-slate-400">@{user.username} · {user.role}</p>
              </div>
              <UserBadgePill badge={user.badge} verified={user.verified} />
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {badgePresets.map((preset) => (
                  <button
                    className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black text-slate-200 transition hover:border-sky-300/40 hover:bg-sky-300/10 disabled:opacity-40"
                    disabled={!canManage || user.role === "owner"}
                    key={preset.label}
                    onClick={() => setBadgeDrafts((current) => ({ ...current, [user.id]: preset }))}
                    type="button"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_86px_72px]">
                <label className="min-w-0">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Nazwa</span>
                  <input disabled={!canManage || user.role === "owner"} value={badgeDrafts[user.id]?.label || ""} onChange={(event) => setBadgeDrafts((current) => ({ ...current, [user.id]: { ...(current[user.id] || { color: "#38bdf8", icon: "" }), label: event.target.value.toUpperCase() } }))} className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3 text-sm font-bold text-white outline-none transition focus:border-sky-300/50" placeholder="CEO / VIP" />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Kolor</span>
                  <input disabled={!canManage || user.role === "owner"} value={badgeDrafts[user.id]?.color || "#38bdf8"} onChange={(event) => setBadgeDrafts((current) => ({ ...current, [user.id]: { ...(current[user.id] || { label: "VIP", icon: "" }), color: event.target.value } }))} className="h-[46px] w-full rounded-2xl border border-white/10 bg-white/[0.06] px-2" type="color" />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Ikona</span>
                  <input disabled={!canManage || user.role === "owner"} value={badgeDrafts[user.id]?.icon || ""} onChange={(event) => setBadgeDrafts((current) => ({ ...current, [user.id]: { ...(current[user.id] || { label: "VIP", color: "#38bdf8" }), icon: event.target.value.slice(0, 2) } }))} className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3 text-sm font-bold text-white outline-none transition focus:border-sky-300/50" placeholder="*" />
                </label>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <UserBadgePill badge={badgeDrafts[user.id]} verified={false} />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button disabled={!canVerify || user.role === "owner"} className="rounded-full border border-sky-300/30 bg-sky-300/10 px-4 py-2 text-sm font-black text-sky-100 transition hover:bg-sky-300/20 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => toggleVerified(user.id)} type="button">
                    {user.verified ? "Cofnij verified" : "Nadaj verified"}
                  </button>
                  <button disabled={!canManage || user.role === "owner"} className="premium-button min-w-[132px] px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40" onClick={() => updateBadge(user.id)} type="button">Przypisz tag</button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
                <input
                  disabled={!canVerify || user.role === "owner"}
                  value={passwordDrafts[user.id] || ""}
                  onChange={(event) => setPasswordDrafts((current) => ({ ...current, [user.id]: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3 text-sm text-white outline-none transition focus:border-sky-300/50 disabled:opacity-40"
                  placeholder={user.role === "owner" ? "Haslo ownera tylko w .env" : "Nowe haslo uzytkownika"}
                  type="password"
                />
                <button disabled={!canVerify || user.role === "owner"} className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-sm font-black text-emerald-100 transition hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => changeUserPassword(user.id)} type="button">
                  Zmien haslo
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RightRail({
  stats,
  trendingHashtags,
  users,
  session,
  searchQuery,
  setSearchQuery,
  toggleFollow,
  setActiveHashtag,
  announcements,
  quickLinks,
  openProfile,
}: {
  stats: { label: string; value: string }[];
  trendingHashtags: { tag: string; count: number }[];
  users: User[];
  session: User;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  toggleFollow: (userId: string) => void;
  setActiveHashtag: (tag: string) => void;
  announcements: Announcement[];
  quickLinks: QuickLink[];
  openProfile: (userId: string) => void;
}) {
  const suggestedUsers = users.filter((user) => user.id !== session.id).slice(0, 3);
  const [activeAnnouncement, setActiveAnnouncement] = useState(0);
  const announcementCount = announcements.length;
  const normalizedAnnouncementIndex = announcementCount ? activeAnnouncement % announcementCount : 0;
  const announcement = announcements[normalizedAnnouncementIndex];

  useEffect(() => {
    if (announcementCount < 2) return undefined;
    const timer = window.setInterval(() => {
      setActiveAnnouncement((current) => (current + 1) % announcementCount);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [announcementCount]);

  useEffect(() => {
    if (activeAnnouncement >= announcementCount && announcementCount > 0) {
      setActiveAnnouncement(0);
    }
  }, [activeAnnouncement, announcementCount]);

  function showAnnouncement(direction: 1 | -1) {
    if (announcementCount < 2) return;
    setActiveAnnouncement((current) => (current + direction + announcementCount) % announcementCount);
  }

  return (
    <aside className="hidden space-y-4 lg:block">
      <section className="glass rounded-[2rem] p-5">
        <h3 className="text-xl font-black text-white">Explore</h3>
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="mt-4 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition focus:border-sky-300/40"
          placeholder="Szukaj postow i ludzi..."
        />
      </section>
      {announcement && (
        <section className="glass overflow-hidden rounded-[2rem]">
          <div className="flex items-center justify-between px-5 pt-5">
            <h3 className="text-xl font-black text-white">Ogloszenia</h3>
            {announcementCount > 1 && (
              <div className="flex gap-2">
                {announcements.map((item, index) => (
                  <button key={item.id} aria-label={`Ogloszenie ${index + 1}`} onClick={() => setActiveAnnouncement(index)} className={`h-2.5 rounded-full transition ${index === normalizedAnnouncementIndex ? "w-7 bg-sky-300 shadow-glow" : "w-2.5 bg-white/20 hover:bg-white/40"}`} type="button" />
                ))}
              </div>
            )}
          </div>
          <div className="relative p-5">
            {announcementCount > 1 && (
              <div className="absolute right-8 top-8 z-10 flex gap-2">
                <button aria-label="Poprzednie ogloszenie" onClick={() => showAnnouncement(-1)} className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/35 font-black text-white backdrop-blur-xl transition hover:border-sky-300/50 hover:bg-sky-300/20" type="button">
                  ‹
                </button>
                <button aria-label="Nastepne ogloszenie" onClick={() => showAnnouncement(1)} className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/35 font-black text-white backdrop-blur-xl transition hover:border-sky-300/50 hover:bg-sky-300/20" type="button">
                  ›
                </button>
              </div>
            )}
            <AnimatePresence mode="wait">
              <motion.div
                key={announcement.id}
                initial={{ opacity: 0, x: 24, scale: 0.98, filter: "blur(8px)" }}
                animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: -24, scale: 0.98, filter: "blur(8px)" }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045] shadow-2xl shadow-black/30"
              >
                {announcement.imageUrl ? (
                  <img src={announcement.imageUrl} alt="" className="h-40 w-full object-cover" />
                ) : (
                  <div className="relative grid min-h-40 place-items-center overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_22%_18%,rgba(56,189,248,0.34),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(168,85,247,0.28),transparent_32%),linear-gradient(135deg,rgba(2,6,23,0.96),rgba(15,23,42,0.72))]">
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:28px_28px] opacity-40" />
                    <div className="relative rounded-2xl border border-sky-300/25 bg-black/25 px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-sky-100 shadow-glow backdrop-blur-xl">
                      Majestic News
                    </div>
                  </div>
                )}
                <div className="p-4">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-200">{announcement.createdAt}</p>
                  <h4 className="mt-2 text-lg font-black text-white">{announcement.title}</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{announcement.description}</p>
                  {announcement.linkUrl && (
                    <a href={announcement.linkUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-full border border-sky-300/30 bg-sky-300/10 px-4 py-2 text-sm font-black text-sky-100 transition hover:bg-sky-300/20">
                      Otworz link
                    </a>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      )}
      {quickLinks.length > 0 && (
        <section className="glass rounded-[2rem] p-5">
          <h3 className="text-xl font-black text-white">Szybkie linki</h3>
          <div className="mt-4 grid gap-2">
            {quickLinks.map((link) => (
              <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3 transition hover:border-sky-300/35 hover:bg-sky-300/10">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-300/15 font-black text-sky-100 transition group-hover:scale-105">{link.icon || ">"}</span>
                <span className="min-w-0 flex-1 truncate font-black text-white">{link.label}</span>
              </a>
            ))}
          </div>
        </section>
      )}
      <section className="glass sticky top-4 rounded-[2rem] p-5">
        <h3 className="text-xl font-black text-white">Trending hashtags</h3>
        <div className="mt-5 space-y-3">
          {trendingHashtags.map((trend, index) => (
            <motion.button className="w-full rounded-3xl border border-white/10 bg-white/[0.045] p-4 text-left transition hover:border-sky-300/30 hover:bg-white/[0.075]" key={trend.tag} whileHover={{ x: 4 }} onClick={() => setActiveHashtag(trend.tag)} type="button">
              <div className="mb-3 h-1.5 w-16 rounded-full bg-gradient-to-r from-sky-400 to-violet-400" />
              <p className="text-sm text-slate-400">#{index + 1} trend</p>
              <b className="mt-1 block text-white">#{trend.tag}</b>
              <p className="text-sm text-slate-500">{trend.count} postow</p>
            </motion.button>
          ))}
        </div>
      </section>
      <section className="glass rounded-[2rem] p-5">
        <h3 className="text-xl font-black text-white">Live Metrics</h3>
        <div className="mt-4 grid gap-3">
          {stats.map((stat) => <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3" key={stat.label}><span className="text-slate-400">{stat.label}</span><b className="text-white">{stat.value}</b></div>)}
        </div>
      </section>
      <section className="glass rounded-[2rem] p-5">
        <h3 className="text-xl font-black text-white">Who to follow</h3>
        <div className="mt-4 space-y-3">
          {suggestedUsers.map((user) => {
            const following = session.followingIds?.includes(user.id);
            return (
              <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-3" key={user.id}>
                <button type="button" onClick={() => openProfile(user.id)} className="h-fit rounded-2xl transition hover:scale-105">
                  <Avatar user={user} />
                </button>
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => openProfile(user.id)} className="truncate font-black text-white transition hover:text-sky-200">{user.displayName}</button>
                  <p className="truncate text-xs text-slate-400">@{user.username} {user.online ? "· online" : ""}</p>
                </div>
                <button className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-2 text-xs font-black text-white transition hover:bg-sky-300/15" onClick={() => toggleFollow(user.id)} type="button">
                  {following ? "Following" : "Follow"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
