# Airavata — WhatsApp Business Management Platform

A full-stack WhatsApp Business solution for managing contacts, conversations, chatbot flows, and WhatsApp Cloud API integrations.

## Stack

- **Frontend** (`artifacts/airavata`): React 19 + Vite + Tailwind CSS v4 + shadcn/ui + Wouter (routing) + TanStack Query
- **API Server** (`artifacts/api-server`): Express 5 + MongoDB (Mongoose) + JWT auth
- **Shared libs** (`lib/`): `api-zod` (schemas), `api-spec` (OpenAPI), `api-client-react` (typed React Query hooks), `db` (Drizzle/Postgres scaffold — not used by main app)
- **Package manager**: pnpm workspaces

## How to run

Three workflows are configured:

| Workflow | Command | URL |
|---|---|---|
| `artifacts/airavata: web` | `pnpm --filter @workspace/airavata run dev` | `/` (preview) |
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` | `/api` |
| `artifacts/mockup-sandbox: Component Preview Server` | `pnpm --filter @workspace/mockup-sandbox run dev` | `/__mockup` |

The API server builds with esbuild before starting (`build.mjs`), then runs the compiled `dist/index.mjs`.

## Required Secrets

| Secret | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `SESSION_SECRET` | JWT / session signing |
| `META_ACCESS_TOKEN` | WhatsApp Cloud API token |
| `META_PHONE_NUMBER_ID` | WhatsApp phone number ID |
| `META_WABA_ID` | WhatsApp Business Account ID |

`META_PHONE_NUMBER_ID` and `META_WABA_ID` are only required for WhatsApp-specific routes, not at startup.

## Notes

- In development, the frontend (Vite) and API server run as separate services. In production, the API server serves the built frontend from `artifacts/airavata/dist/public/`.
- The `lib/db` package contains a Drizzle/Postgres scaffold from the workspace template but the app uses MongoDB/Mongoose exclusively.
- Webhook verification uses `WEBHOOK_VERIFY_TOKEN` (with `WHATSAPP_VERIFY_TOKEN` as a fallback).

## User preferences

<!-- Add user preferences here as you learn them -->
