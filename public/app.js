"use strict";

const state = {
  user: null,
  posts: [],
  users: [],
  view: "home",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const api = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Wystapil blad.");
  return payload;
};

function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function setAvatar(element, user) {
  element.textContent = initials(user.displayName);
  element.style.background = user.color || "#1d9bf0";
}

function escapeText(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span.innerHTML;
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => {
    toast.hidden = true;
  }, 2800);
}

function setBusy(form, busy) {
  form.querySelectorAll("button, input, textarea").forEach((element) => {
    element.disabled = busy;
  });
}

function render() {
  const isLoggedIn = Boolean(state.user);
  $("#authView").hidden = isLoggedIn;
  $("#appView").hidden = !isLoggedIn;
  $("#rightbar").hidden = !isLoggedIn;

  $$(".owner-only").forEach((element) => {
    element.hidden = !(state.user?.role === "owner");
  });

  if (!isLoggedIn) return;

  renderAccount();
  renderMetrics();
  renderPosts();
  renderProfile();
  if (state.user.role === "owner") loadAdminUsers();
  switchView(state.view);
}

function renderAccount() {
  const mini = $("#miniAccount");
  mini.hidden = false;
  mini.innerHTML = `
    <div class="avatar avatar--small"></div>
    <div>
      <strong>${escapeText(state.user.displayName)}</strong>
      <span>@${escapeText(state.user.username)}</span>
    </div>
  `;
  setAvatar(mini.querySelector(".avatar"), state.user);
  setAvatar($("#composerAvatar"), state.user);
}

function renderMetrics() {
  const authors = new Map();
  let verified = 0;
  for (const post of state.posts) authors.set(post.author.id, post.author);
  for (const user of authors.values()) if (user.verified) verified += 1;
  if (state.user) authors.set(state.user.id, state.user);
  $("#usersCount").textContent = state.users.length || authors.size;
  $("#postsCount").textContent = state.posts.length;
  $("#verifiedCount").textContent = state.users.filter((user) => user.verified).length || verified;
}

function renderPosts() {
  const feed = $("#feed");
  feed.innerHTML = "";
  if (!state.posts.length) {
    feed.innerHTML = '<div class="empty">Jeszcze nie ma postów. Zacznij rozmowę.</div>';
    return;
  }

  for (const post of state.posts) {
    const article = document.createElement("article");
    article.className = "post";
    article.innerHTML = `
      <div class="avatar"></div>
      <div class="post__content">
        <div>
          <span class="post__name">${escapeText(post.author.displayName)}</span>
          <span class="badges"></span>
          <span class="meta">@${escapeText(post.author.username)} · ${formatDate(post.createdAt)}</span>
        </div>
        <p class="post__text">${escapeText(post.text)}</p>
        <span class="meta">Majestic Twitter</span>
      </div>
    `;
    setAvatar(article.querySelector(".avatar"), post.author);
    const badges = article.querySelector(".badges");
    if (post.author.role === "owner") badges.append(createBadge(post.author.title || "CEO"));
    else if (post.author.title) badges.append(createBadge(post.author.title, "badge--custom"));
    if (post.author.verified) badges.append(createBadge("✓", "badge--verified"));
    feed.append(article);
  }
}

function createBadge(text, className = "") {
  const badge = document.createElement("span");
  badge.className = `badge ${className}`.trim();
  badge.textContent = text;
  return badge;
}

function renderProfile() {
  $("#profileDisplayName").value = state.user.displayName;
  $("#profileBio").value = state.user.bio || "";
  $("#profileColor").value = state.user.color || "#1d9bf0";
  $("#profileName").textContent = state.user.displayName;
  $("#profileHandle").textContent = `@${state.user.username}`;
  setAvatar($("#profileAvatar"), state.user);
}

function renderAdminUsers() {
  const list = $("#usersList");
  list.innerHTML = "";
  if (!state.users.length) {
    list.innerHTML = '<div class="empty">Brak użytkowników.</div>';
    return;
  }

  for (const user of state.users) {
    const row = document.createElement("div");
    row.className = "user-row";
    row.innerHTML = `
      <div class="user-row__person">
        <div class="avatar avatar--small"></div>
        <div>
          <strong>${escapeText(user.displayName)}</strong>
          <span class="meta">@${escapeText(user.username)} · ${user.role === "owner" ? "właściciel" : "użytkownik"} · ${user.verified ? "zweryfikowany" : "bez weryfikacji"}${user.suspended ? " · zablokowany" : ""}</span>
        </div>
      </div>
      <div class="user-actions"></div>
    `;
    setAvatar(row.querySelector(".avatar"), user);
    const actions = row.querySelector(".user-actions");

    if (user.role === "owner") {
      actions.innerHTML = '<span class="secure-pill">Pełny dostęp</span>';
    } else {
      const title = document.createElement("input");
      title.className = "title-input";
      title.placeholder = "Etykieta";
      title.maxLength = 16;
      title.value = user.title || "";
      title.addEventListener("change", () => updateUser(user.id, { title: title.value }));

      const verify = document.createElement("button");
      verify.className = "button button--secondary";
      verify.type = "button";
      verify.textContent = user.verified ? "Cofnij ✓" : "Zweryfikuj";
      verify.addEventListener("click", () => updateUser(user.id, { verified: !user.verified }));

      const suspend = document.createElement("button");
      suspend.className = user.suspended ? "button button--secondary" : "button button--danger";
      suspend.type = "button";
      suspend.textContent = user.suspended ? "Odblokuj" : "Zablokuj";
      suspend.addEventListener("click", () => updateUser(user.id, { suspended: !user.suspended }));

      actions.append(title, verify, suspend);
    }

    list.append(row);
  }
}

function switchView(view) {
  if (view === "admin" && state.user?.role !== "owner") view = "home";
  state.view = view;
  const titles = {
    home: ["Główna", "Najnowsze posty społeczności"],
    profile: ["Profil", "Ustawienia konta i wyglądu"],
    admin: ["Panel", "Weryfikacja i zarządzanie użytkownikami"],
  };

  $("#homeView").hidden = view !== "home";
  $("#profileView").hidden = view !== "profile";
  $("#adminView").hidden = view !== "admin";
  $("#viewTitle").textContent = titles[view][0];
  $("#viewSubtitle").textContent = titles[view][1];
  $$(".nav__item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
}

async function loadSession() {
  const payload = await api("/api/session");
  state.user = payload.user;
  state.posts = payload.posts || [];
  render();
}

async function loadAdminUsers() {
  if (state.user?.role !== "owner") return;
  try {
    const payload = await api("/api/admin/users");
    state.users = payload.users || [];
    renderAdminUsers();
    renderMetrics();
  } catch (error) {
    showToast(error.message);
  }
}

async function updateUser(userId, patch) {
  try {
    const payload = await api(`/api/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    state.users = payload.users || state.users;
    state.posts = payload.posts || state.posts;
    renderAdminUsers();
    renderPosts();
    renderMetrics();
    showToast("Zapisano zmianę użytkownika.");
  } catch (error) {
    showToast(error.message);
  }
}

function bindEvents() {
  $$(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".auth-tab").forEach((item) => item.classList.remove("is-active"));
      tab.classList.add("is-active");
      $("#loginForm").hidden = tab.dataset.auth !== "login";
      $("#registerForm").hidden = tab.dataset.auth !== "register";
    });
  });

  $$(".nav__item").forEach((item) => {
    item.addEventListener("click", () => switchView(item.dataset.view));
  });

  $("#railCompose").addEventListener("click", () => {
    switchView("home");
    $("#postText").focus();
  });

  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(form, true);
    try {
      const payload = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          username: $("#loginUsername").value,
          password: $("#loginPassword").value,
        }),
      });
      state.user = payload.user;
      state.posts = payload.posts || [];
      state.view = "home";
      render();
      showToast("Zalogowano.");
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(form, false);
    }
  });

  $("#registerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(form, true);
    try {
      const payload = await api("/api/register", {
        method: "POST",
        body: JSON.stringify({
          username: $("#registerUsername").value,
          password: $("#registerPassword").value,
          displayName: $("#registerDisplayName").value,
          bio: $("#registerBio").value,
          color: $("#registerColor").value,
        }),
      });
      state.user = payload.user;
      state.posts = payload.posts || [];
      state.view = "profile";
      form.reset();
      render();
      showToast("Konto utworzone.");
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(form, false);
    }
  });

  $("#postText").addEventListener("input", () => {
    $("#charCount").textContent = `${$("#postText").value.length}/280`;
  });

  $("#postForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = $("#postText").value.trim();
    if (!text) return;
    try {
      const payload = await api("/api/posts", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      state.posts = payload.posts || state.posts;
      $("#postText").value = "";
      $("#charCount").textContent = "0/280";
      renderPosts();
      renderMetrics();
    } catch (error) {
      showToast(error.message);
    }
  });

  $("#profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = await api("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: $("#profileDisplayName").value,
          bio: $("#profileBio").value,
          color: $("#profileColor").value,
        }),
      });
      state.user = payload.user;
      state.posts = payload.posts || state.posts;
      render();
      showToast("Profil zapisany.");
    } catch (error) {
      showToast(error.message);
    }
  });

  $("#passwordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/password", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: $("#currentPassword").value,
          newPassword: $("#newPassword").value,
        }),
      });
      event.currentTarget.reset();
      showToast("Hasło zmienione.");
    } catch (error) {
      showToast(error.message);
    }
  });

  $("#logoutButton").addEventListener("click", async () => {
    try {
      await api("/api/logout", { method: "POST", body: "{}" });
    } finally {
      state.user = null;
      state.posts = [];
      state.users = [];
      render();
      showToast("Wylogowano.");
    }
  });
}

bindEvents();
loadSession().catch((error) => showToast(error.message));
