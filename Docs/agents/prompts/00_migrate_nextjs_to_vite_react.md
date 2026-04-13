# Prompt 00 — MANDATORY: Migrate from Next.js to Vite + React

## THIS MUST BE EXECUTED BEFORE ANYTHING ELSE

The frontend was incorrectly scaffolded with Next.js. The project requires **plain React + Vite** — no SSR, no RSC, no server components, no Next.js. This is a client-side SPA (Single Page Application) that connects to the Python bridge backend via REST + WebSocket.

---

## Why Not Next.js

- CARLA Web is a **real-time simulation dashboard**, not a content website.
- All data comes from the Python bridge via WebSocket and REST — there is no server-side rendering.
- Next.js adds unnecessary complexity (App Router, RSC, server actions, middleware) for a pure client-side app.
- The stack is: **React 19 + Vite + TypeScript + Tailwind CSS + shadcn/ui + Zustand**.

---

## Migration Steps

### 1. Reinitialize the Project

Delete the Next.js project and create a new Vite + React project in its place:

```bash
cd /home/$USER/carla
rm -rf carla-web

# Create new Vite + React + TypeScript project
npm create vite@latest carla-web -- --template react-ts
cd carla-web
npm install
```

### 2. Install Dependencies

```bash
# Core
npm install react-router-dom zustand

# UI
npm install tailwindcss @tailwindcss/vite
npm install class-variance-authority clsx tailwind-merge tw-animate-css
npm install lucide-react sonner cmdk date-fns react-day-picker
npm install react-resizable-panels

# shadcn/ui (init after tailwind is configured)
npx shadcn@latest init

# Data visualization (lazy-loaded)
npm install recharts
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three

# Dev
npm install -D @types/react @types/react-dom
```

### 3. Configure Tailwind CSS v4

In `vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 42691,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: {
    format: 'es',
  },
})
```

### 4. Configure shadcn/ui

Initialize shadcn with:
- Style: new-york (v4)
- Base color: zinc
- CSS variables: yes
- TypeScript: yes
- Framework: Vite

Reference the local shadcn repo at `ui/apps/v4/registry/new-york-v4/ui/` for component source code.

Install all required shadcn components:
```bash
npx shadcn@latest add button badge card tabs accordion collapsible dialog sheet \
  input label select slider switch toggle toggle-group form field \
  table scroll-area skeleton spinner progress chart \
  sidebar command dropdown-menu context-menu menubar navigation-menu breadcrumb \
  alert alert-dialog sonner tooltip hover-card popover \
  resizable separator aspect-ratio empty-state keyboard \
  calendar checkbox radio-group input-group
```

### 5. Project Structure (Vite + React)

```
carla-web/
├── public/
│   └── favicon.png              # Copy from Docs/carla_ue5_logo.png
├── src/
│   ├── main.tsx                 # ReactDOM.createRoot entry point
│   ├── App.tsx                  # Router + providers
│   ├── index.css                # Tailwind directives + theme CSS vars
│   ├── routes/
│   │   ├── SimulationPage.tsx   # Main simulation page (was app/page.tsx)
│   │   └── SettingsPage.tsx     # Settings page
│   ├── components/
│   │   ├── ui/                  # shadcn components
│   │   ├── layout/              # TopBar, StatusBar, panels, ResizableLayout
│   │   ├── viewport/            # MainViewport, PixelStreamingClient, etc.
│   │   ├── sensors/             # CameraView, LidarView, RadarView, etc.
│   │   ├── controls/            # SimulationControls, WeatherControls, etc.
│   │   ├── actors/              # ActorList, ActorDetails, etc.
│   │   ├── map/                 # MiniMap, RouteEditor, OpenDriveViewer
│   │   ├── scenario/            # RecordingControls, ScenarioRunner
│   │   └── shared/              # CommandPalette, NumericReadout, EventLog
│   ├── hooks/                   # useWebSocket, useSensorData, etc.
│   ├── workers/                 # Web Workers (ws-receiver, image-decoder, etc.)
│   ├── stores/                  # Zustand stores
│   ├── lib/                     # carla-api, ws-protocol, utils, sensor-registry
│   ├── types/                   # TypeScript type definitions
│   └── constants/               # App constants
├── index.html                   # Vite entry HTML
├── vite.config.ts
├── tailwind.config.ts           # (if needed, v4 may use CSS-only config)
├── tsconfig.json
├── tsconfig.app.json
├── components.json              # shadcn config
└── package.json
```

### 6. Key Migration Patterns

| Next.js Pattern | Vite + React Replacement |
|----------------|--------------------------|
| `src/app/page.tsx` (App Router) | `src/routes/SimulationPage.tsx` + react-router |
| `src/app/layout.tsx` | `src/App.tsx` with `<Outlet>` |
| `src/app/settings/page.tsx` | `src/routes/SettingsPage.tsx` |
| `next/dynamic` with `ssr: false` | `React.lazy(() => import(...))` + `<Suspense>` |
| `next/font/google` | `<link>` in `index.html` or `@fontsource/inter` package |
| `next/image` | Regular `<img>` tag |
| `next-themes` | Custom theme context or `class="dark"` on `<html>` |
| `Metadata` export | `document.title` or `react-helmet-async` |
| Server Components | Not applicable — everything is a client component |
| `use server` / `use client` | Remove all — everything is client-side |
| API routes (`app/api/`) | Not needed — all API goes to the bridge |
| `next.config.ts` | `vite.config.ts` |
| `npm run dev` (Next) | `npm run dev` (Vite, port 42691) |
| `npm run build` (Next) | `npm run build` (Vite, outputs to `dist/`) |
| `npm run start` (Next) | `npm run preview` (Vite) or serve `dist/` with any static server |

### 7. Entry Point (`src/main.tsx`)

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
```

### 8. App Shell (`src/App.tsx`)

```tsx
import { Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import SimulationPage from '@/routes/SimulationPage'
import SettingsPage from '@/routes/SettingsPage'

export default function App() {
  return (
    <TooltipProvider>
      <Routes>
        <Route path="/" element={<SimulationPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
      <Toaster />
    </TooltipProvider>
  )
}
```

### 9. index.html

```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CARLA Web</title>
    <link rel="icon" href="/favicon.png" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  </head>
  <body class="min-h-screen bg-background font-sans text-foreground antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### 10. Move Existing Source Code

All existing source code in `src/components/`, `src/stores/`, `src/hooks/`, `src/workers/`, `src/lib/`, `src/types/` can be **copied directly** — they have no Next.js dependencies. Only these files need changes:

| File | Change Needed |
|------|--------------|
| `src/app/page.tsx` | Move to `src/routes/SimulationPage.tsx`, remove `Metadata` export |
| `src/app/layout.tsx` | Merge into `src/App.tsx` and `index.html` |
| `src/app/settings/page.tsx` | Move to `src/routes/SettingsPage.tsx` |
| `src/app/globals.css` | Move to `src/index.css` |
| Any `next/dynamic` imports | Replace with `React.lazy` + `Suspense` |
| Any `next/font` imports | Remove — fonts loaded via HTML `<link>` |
| Any `next/image` imports | Replace with `<img>` |
| Any `'use client'` directives | Remove entirely |

### 11. Update run_local.sh

```bash
#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BRIDGE_DIR="$PROJECT_ROOT/carla-web-bridge"
FRONTEND_DIR="$SCRIPT_DIR"

FRONTEND_PORT=42691
BRIDGE_PORT=42692

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BRIDGE_PID $FRONTEND_PID 2>/dev/null
  wait $BRIDGE_PID $FRONTEND_PID 2>/dev/null
  echo "Done."
}
trap cleanup EXIT INT TERM

# Backend
echo "[1/2] Starting backend bridge..."
cd "$BRIDGE_DIR"
[ -d ".venv" ] || python3 -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt
export BRIDGE_PORT CORS_ORIGINS="http://localhost:$FRONTEND_PORT"
uvicorn src.main:app --host 0.0.0.0 --port "$BRIDGE_PORT" --reload --reload-dir src &
BRIDGE_PID=$!
deactivate 2>/dev/null || true

# Frontend
echo "[2/2] Starting frontend..."
cd "$FRONTEND_DIR"
[ -d "node_modules" ] || npm install
npm run dev &
FRONTEND_PID=$!

echo ""
echo "════════════════════════════════════════════"
echo "  CARLA Web running:"
echo "  Frontend:  http://localhost:$FRONTEND_PORT"
echo "  Bridge:    http://localhost:$BRIDGE_PORT"
echo "  API Docs:  http://localhost:$BRIDGE_PORT/docs"
echo "  WebSocket: ws://localhost:$BRIDGE_PORT/ws"
echo "════════════════════════════════════════════"
echo ""
wait
```

### 12. Update run_production.sh

In the production script, change the frontend section:
- Replace `npm run build` (Next) → `npm run build` (Vite, outputs to `dist/`)
- Replace `npm run start` (Next) → `npx serve dist -l $FRONTEND_PORT` or `npm run preview -- --port $FRONTEND_PORT`

### 13. Verification

```bash
cd carla-web
npm run dev    # Should start on http://localhost:42691
npm run build  # Should output to dist/ with zero errors
npm run preview # Should serve the built app
```

---

## CRITICAL

This migration MUST be the **first thing done** before any other prompt (01-09 or FINAL_BUILD_TO_COMPLETION). All subsequent work assumes Vite + React, not Next.js.
