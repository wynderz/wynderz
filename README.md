# Wynderz website

Premium industrial Next.js frontend for Wynderz, using real catalogue content and photography from [wynderz.in](https://www.wynderz.in/).

Visual direction is aligned with the Google Stitch project **Wynderz Industrial Web Redesign** (Industrial Precision design system).

## Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS 4
- Real Wynderz product images in `public/images`
- File-based content in `/content`, edited from `/admin` via the GitHub API

## Routes

- `/` — homepage (hero, carousel, about, products, applications, gallery, contact)
- `/about` — company profile
- `/products` — full catalogue
- `/products/[slug]` — product detail pages
- `/admin` — secure content dashboard (not indexed)

## Develop

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env` and fill in values. Never commit `.env`.

## Content rules

All products, company facts, GST/IEC, address, and images come from the existing Wynderz website. Nothing invented.

Public pages read editable copy and image paths from JSON files in `/content`. Layout, animations, and routing stay in the React components.

---

## Admin dashboard

Open [https://wynderz.in/admin](https://wynderz.in/admin) (or `http://localhost:3000/admin` locally).

Flow:

1. Admin signs in at `/admin/login`.
2. Dashboard sections map to existing website content only (Home, About, Products, Applications, Contact, Global Settings). There is no Services section because the public site does not have one.
3. Edit text and/or replace images, then **Save Changes**.
4. The browser calls `/api/admin/save` (server-side only).
5. The API validates the session and payload, then commits allowlisted files through the GitHub API.
6. Vercel is already connected to this GitHub repo, so the new commit triggers a deployment.
7. When that deployment goes live, the public site shows the new content.

The GitHub token never ships to the browser. It is read only from server environment variables.

### 1. GitHub repository variables

In Vercel → Project → Settings → Environment Variables (Production, and Preview if you test there), set:

| Variable | Example | Purpose |
|---|---|---|
| `GITHUB_OWNER` | `mybesva` | GitHub user or org that owns the repo |
| `GITHUB_REPO` | `wynderz` | Repository name only, not the URL |
| `GITHUB_BRANCH_DEV` | `dev` | Branch for **Publish to dev** |
| `GITHUB_BRANCH_MAIN` | `main` | Branch for **Publish to main** (production) |
| `GITHUB_TOKEN` | `github_pat_...` | Fine-grained or classic PAT, server-side only |

Do not prefix these with `NEXT_PUBLIC_`.

### 2. GitHub token

Create a token with permission to commit to this repository only.

**Fine-grained (preferred)**

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
2. Resource owner: the owner of `wynderz`.
3. Repository access: only `wynderz`.
4. Permissions: **Contents: Read and write**.
5. Generate and copy the token once.

**Classic**

Use `repo` scope only if fine-grained tokens are not available.

Store the token in Vercel (and local `.env` for testing). Rotate it if it is ever exposed.

### 3. Vercel environment variables

Also set admin auth (server-side only):

| Variable | Notes |
|---|---|
| `ADMIN_EMAIL` or `ADMIN_USERNAME` | Dashboard sign-in identity |
| `ADMIN_PASSWORD_HASH` | scrypt hash from `node scripts/hash-admin-password.mjs 'your-password'` |
| `AUTH_SECRET` or `ADMIN_SESSION_SECRET` | Random string, at least 32 characters (`openssl rand -base64 48`) |
| `ADMIN_PASSWORD` | Optional local-only fallback if a hash is not set yet. Do not use this in production. |

Redeploy after adding variables so serverless functions pick them up.

Existing enquiry SMTP variables stay unchanged (`ENQUIRY_TO`, `SMTP_*`).

### 4. Admin authentication

`/admin` is not “hidden URL” security. Middleware and every mutation API verify a signed, httpOnly, `SameSite=strict` session cookie.

- Login: `POST /api/admin/login` compares the identity with `ADMIN_EMAIL` / `ADMIN_USERNAME` using a timing-safe check, and verifies `ADMIN_PASSWORD_HASH` (scrypt).
- Session: HMAC-SHA256 cookie signed with `ADMIN_SESSION_SECRET`, 12-hour expiry.
- Failed logins are rate-limited per IP.
- Logout: `POST /api/admin/logout` clears the cookie.
- Unauthenticated visits to `/admin/*` redirect to `/admin/login`.
- Unauthenticated `/api/admin/*` (except login) return 401.

### 5. How `/admin` works

- `/admin/login` — sign-in form.
- `/admin` — dashboard links.
- `/admin/home`, `/admin/about`, `/admin/products`, `/admin/applications`, `/admin/videos`, `/admin/contact`, `/admin/global` — structured editors.
- Image fields show a preview, file picker, type/size checks (JPG/PNG/WEBP/GIF/SVG, 5 MB).
- Save on each section (browser only). Preview opens the public page. Open **Publish** to send every saved section to GitHub in one commit. Reset and an unsaved-changes warning are included.

### 6. Content file structure

| File | Used by |
|---|---|
| `content/home.json` | Homepage hero, carousel headings, about teaser, product intro, featured, gallery, enquiry CTA |
| `content/about.json` | About page headings and images |
| `content/products.json` | Product catalogue and category cards |
| `content/applications.json` | Applications + Our Capabilities |
| `content/videos.json` | YouTube videos and thumbnail paths |
| `content/contact.json` | Contact section copy and contact person |
| `content/global.json` | Company facts, logo, hours, nav labels, social URLs |

`src/data/site.ts` loads these files and keeps the existing public component APIs.

IDs for existing products stay stable. Admins can add, reorder, hide (`isActive`), or delete products, applications, gallery images, videos, and navigation items. Git history is the recovery path.

### 7. Image uploads

1. Choose a new file on an existing image field.
2. On Save, the API checks type (magic bytes) and size.
3. The file is written to `public/images/uploads/` with a stable name derived from the section + field.
4. The JSON image path is updated to `/images/uploads/...`.
5. Replacing the same field overwrites that upload path instead of creating a new copy.
6. If the file type changes, the previous **upload** file is deleted. Original catalogue images under `public/images/hero`, `products`, `gallery`, and `brand` are not deleted.

### 8. GitHub commits

`src/lib/admin/github.ts` (server-only) uses the Git Data API to create one commit per Save:

- Allowed paths only: `content/*.json` and `public/images/uploads/*`.
- Arbitrary paths from the browser are rejected.
- Commit messages look like `Admin: update Home content`.

Locally, if GitHub env vars are missing, Save writes files on disk so you can test the dashboard. On Vercel, GitHub config is required.

### 9. Vercel deploys after a commit

This project is already connected to GitHub. **Publish to dev** commits to `GITHUB_BRANCH_DEV` (default `dev`). **Publish to main** commits to `GITHUB_BRANCH_MAIN` (default `main`). Vercel deploys the matching branch (production from `main`, preview from `dev` if that branch is enabled).

The dashboard reports that a deployment **should start**. It does not claim the live deploy has finished, because that requires the Vercel API. Check the Vercel dashboard if the public site has not updated after a few minutes.

### 10. Adding another editable field later

1. Add the key to the relevant file in `/content` with the current public value.
2. Read it from `src/data/site.ts` (or the JSON import already used by that page).
3. Replace the hardcoded string/image in the public component.
4. Save from `/admin` — the editor walks the JSON, so a new string or image key appears automatically.
5. Do not add a generic path-write API. New files must be added to the allowlist in `src/lib/admin/config.ts` if you create a new JSON file.
