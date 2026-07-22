# Airavata WhatsApp Solution

A full-stack WhatsApp Business Platform solution for managing contacts, campaigns, conversations, and AI-powered agents.

## Stack

- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (`artifacts/airavata/`)
- **Backend**: Node.js + Express + Mongoose (`artifacts/api-server/`)
- **Database**: MongoDB Atlas (via `MONGODB_URI`)
- **Shared libs**: `lib/api-zod` (validation), `lib/api-client-react` (typed fetch hooks), `lib/db` (Drizzle/Postgres scaffold — unused, Mongoose used instead)

## How to Run

Dependencies are managed by pnpm workspaces. Install once from the root:

```bash
pnpm install
```

Three workflows are configured and start automatically:
- **`artifacts/airavata: web`** — React dev server (preview at `/`)
- **`artifacts/api-server: API Server`** — Express API (preview at `/api`)
- **`artifacts/mockup-sandbox: Component Preview Server`** — Canvas mockup sandbox

## Environment Variables / Secrets

| Key | Where set | Notes |
|-----|-----------|-------|
| `MONGODB_URI` | Secret | MongoDB Atlas connection string |
| `SESSION_SECRET` | Secret | JWT signing key |
| `META_ACCESS_TOKEN` | Secret | WhatsApp Cloud API token |
| `META_APP_SECRET` | Secret | Meta app secret |
| `META_PHONE_NUMBER_ID` | Env var | WhatsApp phone number ID |
| `META_WABA_ID` | Env var | WhatsApp Business Account ID |
| `META_APP_ID` | Env var | Meta app ID |
| `WEBHOOK_VERIFY_TOKEN` | Env var | `airavata_wh_2026` |

## Architecture Notes

- In **development**, the frontend Vite dev server and API server run as separate workflows. The API proxies `/api` requests; the frontend uses relative `/api` URLs.
- In **production**, the API server serves the built frontend from `artifacts/airavata/dist/public/` and handles SPA fallback — so only the API server needs to be deployed.
- MongoDB connection is in `artifacts/api-server/src/lib/mongodb.ts` using Mongoose.
- Auth uses JWT (signed with `SESSION_SECRET`) stored in an HTTP-only cookie.

## User Preferences
