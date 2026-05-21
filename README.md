# Majestic Roleplay

Premium futuristic social media platform built with Next.js, TypeScript, TailwindCSS and Framer Motion.

## Features

- Login/register flow with persisted local session.
- Premium dark UI, glassmorphism, smooth motion and responsive layout.
- Feed with posts, media upload, hashtags, likes, reposts, bookmarks and comments.
- Public user profiles with avatar, banner, bio, posts, followers/following, rank tag and verified badge.
- Follow system and clickable profile navigation from posts, comments and sidebar suggestions.
- CEO/Admin panel for ranks, verified status, user password changes, announcements and quick link buttons.
- Right sidebar with search, announcement carousel, custom buttons, trending hashtags, metrics and follow suggestions.
- Production contracts for database/auth migration.

## Local Run

```powershell
cd "C:\Users\jkalo\Desktop\strona x"
copy .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000`.

Useful commands:

```powershell
npm run typecheck
npm run build
npm run start
```

Default demo CEO account:

```text
login: ziomeczz
password: ziomeczz
```

## Deploy Online

Recommended deployment: Vercel.

1. Push this folder to GitHub.
2. Import the repository in Vercel.
3. Add variables from `.env.example`.
4. Set `NEXT_PUBLIC_APP_URL` to your real domain.
5. Run build command `npm run build`.
6. Use start command `npm run start` when deploying outside Vercel.

The app has `output: "standalone"` in `next.config.ts`, so Node hosts can deploy the optimized standalone build from `.next/standalone`.

## Admin Panel

Open the app as a user with role `owner` or `admin`, then choose `Panel`.

Admin tools include:

- assigning verified badges;
- assigning custom rank tags with label, color and optional icon;
- changing user passwords;
- creating and deleting announcements;
- creating and deleting right-sidebar link buttons.

The owner account cannot be edited from the panel. In production, change owner credentials through `.env` and the database seed.

## Announcements

Announcements are managed in the admin panel and displayed in the right sidebar as a premium carousel.

Each announcement supports:

- title;
- description;
- optional banner/image upload;
- optional URL.

When more than one announcement exists, the carousel changes automatically every 10 seconds. Dots show the active slide, and next/previous controls allow manual navigation without stopping autoplay. Announcements without a banner render a futuristic placeholder card so the layout stays stable.

## Quick Link Buttons

Admin/CEO can add buttons from the panel:

- button name;
- target URL;
- optional short icon text.

Buttons are rendered automatically in the right sidebar and open links in a new tab.

## Text, Logo And Brand

Main login copy is in `components/PremiumSocialApp.tsx` inside `AuthScreen`.

Current brand text:

- login badge: `Majestic Roleplay`;
- hero name: `Majestic Roleplay`;
- logged-in top title: `CEO ziomeczz`;
- sidebar label: `CEO ziomeczz`.

Change environment-facing names in `.env.example`:

```text
NEXT_PUBLIC_APP_NAME
NEXT_PUBLIC_BRAND_LABEL
NEXT_PUBLIC_APP_URL
```

The logo mark is the `M` square in `Sidebar`. Replace that element with an image if you add a logo file under `public/`.

## Colors And UI

Global visual style lives in `app/globals.css`.

Important classes:

- `.glass` for primary glass panels;
- `.glass-soft` for secondary panels;
- `.premium-button` for gradient CTA buttons;
- `.icon-chip` for compact icon buttons.

Tailwind theme extensions are in `tailwind.config.ts`. Most one-off component colors are inside `components/PremiumSocialApp.tsx`.

## Components

The current app is intentionally compact and lives mostly in:

```text
components/PremiumSocialApp.tsx
```

Key component sections:

- `AuthScreen` - login/register screen;
- `Sidebar` and `MobileNav` - navigation;
- `Composer` - post creator;
- `PostCard` - post, comments and actions;
- `ProfilePanel` and `ProfileModal` - public profile and edit modal;
- `AdminPanel` - CEO/Admin management;
- `RightRail` - search, announcements, quick links and social widgets.

## Profiles, Posts And Auth

Shared TypeScript models:

```text
lib/types.ts
```

Production database structure:

```text
lib/database.ts
```

Permission and backend contracts:

```text
lib/auth.ts
lib/backend-contracts.ts
```

The demo frontend persists state in `localStorage` under `majestic-twitter-premium-state-v2`. For a real multi-user deployment, implement the `SocialRepository` interface from `lib/database.ts` and move mutations to protected API routes.

## Add CEO/Admin

For demo/local state, users have a `role` field:

```ts
role: "owner" | "admin" | "user"
```

For production:

1. Create a user in the database.
2. Hash the password with argon2/bcrypt or the auth provider you choose.
3. Set `role` to `owner` or `admin`.
4. Add `verified: true` and a badge such as `{ label: "CEO", color: "#38bdf8", icon: "" }`.
5. Keep `OWNER_USERNAME`, `OWNER_PASSWORD`, `AUTH_SECRET` and `DATABASE_URL` configured in `.env`.

## Production Database/Auth

Recommended database: PostgreSQL with Prisma or Drizzle.

Suggested tables:

```text
users
posts
comments
post_likes
post_bookmarks
post_reposts
follows
sessions
announcements
quick_links
uploads
notifications
```

Auth checklist:

- store only password hashes;
- use HttpOnly, Secure cookies;
- hash remember-me tokens in the database;
- add rate limits for login/register;
- validate all admin mutations server-side;
- store uploads in S3/R2 or another object storage provider;
- run migrations before deployment.

## Folder Structure

```text
app/
  globals.css       global Tailwind styles
  layout.tsx        app shell metadata
  page.tsx          renders the social app
components/
  PremiumSocialApp.tsx
lib/
  auth.ts
  backend-contracts.ts
  database.ts
  types.ts
public/
  static assets for logo/images if added
data/
  legacy JSON storage used by server.js
server.js
  legacy standalone JSON API prototype
```

## Notes

Do not ship demo passwords. Before going public, wire the repository contracts to a real database and protected API routes, then replace local image data URLs with managed uploads.
