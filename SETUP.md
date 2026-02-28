# Getting Started

## Prerequisites

- Node.js (v18+)
- npm

## Install

```bash
npm install
```

## Environment variables

### Client (Vite)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Server (Netlify Functions)

- `ANTHROPIC_API_KEY` (for `/api/claude` + OCR)
- `GEMINI_API_KEY` (for `/api/gemini`)
- `ALLOWED_ORIGINS` (comma-separated) to prevent other sites from abusing your proxy, e.g.

```text
ALLOWED_ORIGINS=https://toranot.netlify.app,http://localhost:5173
```

## Run locally

```bash
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173/Toranot/`).

## Build for production

```bash
npm run build
```

Output goes to the `dist/` directory.

## Run tests

```bash
npm run test
```

## Type check

```bash
npm run typecheck
```
