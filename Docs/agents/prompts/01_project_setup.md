# Prompt 01 — Project Setup & Foundation

## Context

You are setting up the CARLA Web project — a web-based interface for the CARLA autonomous driving simulator. Read the following documents before starting:
- `Docs/agents/carla_web_implementation_prompt.md` — Full architecture and requirements
- `Docs/agents/shadcn_component_mapping.md` — Component mapping reference
- `Docs/agents/carla_web_feasibility_study.md` — Technical feasibility analysis
- `Docs/agents/web_development_principles.md` — Engineering principles
- `Docs/agents/agentic_coding_guidelines.md` — Coding workflow rules

The shadcn/ui v4 source repository is at `ui/` in the project root. Reference it for component source code, examples, themes, and block templates.

---

## Task

Set up the CARLA Web frontend project with the following specifications:

### 1. Initialize Vite + React Project

Create a new Vite + React + TypeScript project at `carla-web/` in the project root:

```bash
npm create vite@latest carla-web -- --template react-ts
cd carla-web
npm install react-router-dom
```

- TypeScript strict mode
- Vite as build tool (NOT Next.js — this is a pure client-side SPA)
- Tailwind CSS v4
- ESLint
- `src/` directory structure

### 2. Configure shadcn/ui

Initialize shadcn/ui with these settings:
- Style: `new-york` (v4)
- Base color: `zinc`
- CSS variables: enabled
- Icon library: `lucide`
- Framework: Vite (NOT Next.js)

Install ALL of the following shadcn components (we will need every one of them):
```
button badge card tabs accordion collapsible dialog sheet
input label select slider switch toggle toggle-group form field
table scroll-area skeleton spinner progress chart
sidebar command dropdown-menu context-menu menubar navigation-menu breadcrumb
alert alert-dialog sonner tooltip hover-card popover
resizable separator aspect-ratio empty-state keyboard
calendar checkbox radio-group input-group
```

### 3. Configure Theme

Set up the dark theme as default using the `zinc` base color and `vega` style variant. Reference `ui/apps/v4/registry/themes.ts` for the exact OKLch color values. Configure:
- Dark mode as default via `class` strategy in Tailwind
- CSS variables for all theme tokens
- Chart colors (`--chart-1` through `--chart-5`)
- Sidebar-specific colors
- Font: Inter (from Google Fonts via `next/font/google`)
- Monospace font for numeric readouts (JetBrains Mono or Geist Mono)

### 4. Create Directory Structure

```
carla-web/src/
├── main.tsx                  # ReactDOM.createRoot + BrowserRouter
├── App.tsx                   # Routes + providers (TooltipProvider, Toaster)
├── index.css                 # Tailwind directives + theme CSS variables
├── routes/
│   ├── SimulationPage.tsx    # Main simulation page (placeholder)
│   └── SettingsPage.tsx      # Connection settings page (placeholder)
├── components/
│   ├── ui/                   # shadcn components (auto-generated)
│   ├── layout/               # (empty, for later)
│   ├── viewport/             # (empty, for later)
│   ├── sensors/              # (empty, for later)
│   ├── controls/             # (empty, for later)
│   ├── actors/               # (empty, for later)
│   ├── map/                  # (empty, for later)
│   ├── scenario/             # (empty, for later)
│   └── shared/               # (empty, for later)
├── hooks/                    # (empty, for later)
├── workers/                  # (empty, for later)
├── stores/                   # (empty, for later)
├── lib/
│   └── utils.ts              # cn() utility (from shadcn)
├── types/                    # (empty, for later)
├── styles/                   # (empty, for later)
└── constants/                # (empty, for later)
```

### 5. Create Entry Points

**`index.html`** (Vite entry):
- `<html lang="en" class="dark">` (dark mode default)
- Google Fonts loaded via `<link>` (Inter + JetBrains Mono)
- `<title>CARLA Web</title>`
- `<div id="root"></div>` + `<script type="module" src="/src/main.tsx"></script>`

**`src/main.tsx`**:
- `createRoot(document.getElementById('root')!)` + `<BrowserRouter>` + `<App />`

**`src/App.tsx`**:
- `<TooltipProvider>` + `<Routes>` (react-router-dom)
- Route `/` → `SimulationPage`
- Route `/settings` → `SettingsPage`
- `<Toaster />` for toast notifications

### 6. Create Placeholder Main Page

The simulation page (`src/routes/SimulationPage.tsx`) should render a basic shell layout showing:
- A top bar with text "CARLA Web" and a placeholder connection badge (disconnected)
- A centered area saying "Main Viewport"
- A bottom area saying "Sensor Panel"
- Use shadcn `Card`, `Badge`, and `Button` components
- Dark background, proper spacing
- This is just a visual skeleton — no functionality yet

### 7. Configure vite.config.ts

- Set dev server port to `42691`
- Configure headers for `SharedArrayBuffer` support (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`)
- Set `worker.format: 'es'` for Web Worker module support
- Configure `@` path alias → `./src`

### 8. Verify Build

Run `npm run build` and ensure it compiles with zero errors and zero warnings.

---

## Performance Notes

- Do NOT install Three.js or chart libraries yet — they will be lazy-loaded later
- Keep the initial bundle minimal — only shadcn base components
- Ensure tree-shaking is working (check bundle size after build)

## Quality Checklist

- [ ] `npm run build` passes with zero errors
- [ ] `npm run lint` passes
- [ ] Dark theme renders correctly
- [ ] All shadcn components are installed and importable
- [ ] Directory structure matches specification
- [ ] TypeScript strict mode enabled
- [ ] `SharedArrayBuffer` headers configured
