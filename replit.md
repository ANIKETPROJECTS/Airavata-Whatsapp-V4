# Airavata WhatsApp Solution

A WhatsApp business platform built with React (Vite) + Express + MongoDB. Handles chatbot flows, live agent chat, template management, and WhatsApp Cloud API webhooks.

## Stack

- **Frontend**: React + Vite + Tailwind + shadcn/ui (`artifacts/airavata`)
- **Backend**: Express 5 + Mongoose (`artifacts/api-server`)
- **Database**: MongoDB (via `MONGODB_URI`)
- **WhatsApp**: Meta Cloud API

## Running the project

Two workflows run in parallel:

| Workflow | Command |
|---|---|
| `artifacts/airavata: web` | `pnpm --filter @workspace/airavata run dev` |
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` |

Start both from the Workflows panel. The frontend is served by Vite; the API builds with esbuild then starts on `PORT`.

## Required secrets

| Secret | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `META_ACCESS_TOKEN` | Meta Graph API access token |
| `META_PHONE_NUMBER_ID` | WhatsApp sender phone number ID |
| `META_APP_ID` | Meta app ID |
| `META_APP_SECRET` | Meta app secret (webhook signature verification) |
| `META_WABA_ID` | WhatsApp Business Account ID |
| `WEBHOOK_VERIFY_TOKEN` | Token used to verify Meta webhook subscription |
| `SESSION_SECRET` | Express session signing secret |
| `AIRAVATA_INTEGRATION_SECRET` | Optional: external integration auth secret |
| `AIRAVATA_INTEGRATION_URL` | Optional: external integration endpoint |

## User preferences

- Keep MongoDB/Mongoose for data storage (do not migrate to Drizzle/Postgres).
