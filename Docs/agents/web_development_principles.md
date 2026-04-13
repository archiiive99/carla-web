# CARLA Web Version - Web Development Principles

This document defines the architectural principles, frontend standards, and agentic workflow guidelines for building the CARLA Web version. These principles are derived from production-proven patterns used by frontier AI coding agents and adapted specifically for the CARLA simulator web interface.

---

## 1. Frontend Stack Defaults

### Recommended Technology Stack

| Category | Technology | Rationale |
|----------|-----------|-----------|
| Framework | Vite + React (TypeScript) | Fast HMR, no SSR overhead, pure client-side SPA |
| Styling | Tailwind CSS | Utility-first, rapid prototyping, consistent design tokens |
| UI Components | shadcn/ui + Radix Themes | Accessible, composable, customizable primitives |
| Icons | Lucide / Material Symbols | Lightweight, tree-shakable, consistent style |
| Animation | Motion (Framer Motion) | Declarative, performant animations |
| State Management | Zustand | Minimal boilerplate, scalable for complex state |
| Fonts | Inter, Geist, IBM Plex Sans | Clean sans-serif, optimized for technical UIs |

### Directory Structure

```
/src
  /routes/                        # Page components (SimulationPage, SettingsPage)
  /components/                    # Reusable UI building blocks
    /ui/                          # Base primitives (Button, Input, Card, etc.)
    /layout/                      # Layout components (Sidebar, Header, etc.)
    /simulation/                  # CARLA-specific visualization components
    /sensors/                     # Sensor data display components
    /map/                         # Map rendering components
  /hooks/                         # Reusable React hooks
  /lib/                           # Utilities (fetchers, helpers, formatters)
  /stores/                        # Zustand stores
  /types/                         # Shared TypeScript types
  /styles/                        # Tailwind config and global styles
  /constants/                     # Application-wide constants
```

---

## 2. Guiding Engineering Principles

### 2.1 Clarity and Reuse
- Every component and page must be **modular and reusable**.
- Avoid duplication by factoring repeated UI patterns into shared components.
- Components should have a single responsibility and a well-defined public API via props.

### 2.2 Consistency
- The user interface must adhere to a **consistent design system**: color tokens, typography, spacing, and components must be unified.
- Use a single source of truth for design tokens (Tailwind config).
- All interactive elements must behave predictably across the application.

### 2.3 Simplicity
- Favor small, focused components and avoid unnecessary complexity in styling or logic.
- Three similar lines of code is better than a premature abstraction.
- Don't design for hypothetical future requirements.
- Only add error handling and validation at system boundaries (user input, external APIs, WebSocket connections).

### 2.4 Visual Quality
- Follow a high visual quality bar: spacing, padding, hover states, focus rings, and transitions must be consistent.
- Every interactive element must have visible feedback (hover, active, disabled states).

### 2.5 Performance First
- CARLA's web version handles real-time simulation data. Performance is non-negotiable.
- Use `React.memo`, `useMemo`, `useCallback` where rendering is a bottleneck.
- Prefer streaming and chunked data transfer for sensor outputs (camera, LiDAR, radar).
- Lazy-load heavy visualization components (3D renderers, map viewers).

---

## 3. UI/UX Best Practices

### 3.1 Visual Hierarchy
- Limit typography to **4-5 font sizes and weights** for consistent hierarchy.
- Use `text-xs` for captions and annotations.
- Avoid `text-xl` unless for hero headings or major section titles.
- Maintain clear hierarchy: Page Title > Section Header > Subsection > Body > Caption.

### 3.2 Color Usage
- Use **1 neutral base** (e.g., `zinc` or `slate`) and up to **2 accent colors**.
- Reserve one accent for primary actions, one for status/alerts.
- CARLA-specific: use semantic colors for simulation states:
  - Green: running/connected
  - Yellow: loading/syncing
  - Red: error/disconnected
  - Blue: informational/selected

### 3.3 Spacing and Layout
- Always use **multiples of 4** for padding and margins (`p-1` = 4px, `p-2` = 8px, etc.).
- Use fixed-height containers with internal scrolling for streaming data (sensor feeds, logs).
- Maintain visual rhythm with consistent gap values in flex/grid layouts.

### 3.4 State Handling
- Use **skeleton placeholders** or `animate-pulse` to indicate data fetching.
- Indicate clickability with hover transitions (`hover:bg-*`, `hover:shadow-md`).
- Show connection status prominently (WebSocket to CARLA server).
- Display real-time metrics with smooth transitions, not abrupt value changes.

### 3.5 Accessibility
- Use semantic HTML and ARIA roles where appropriate.
- Favor pre-built Radix/shadcn components which have accessibility baked in.
- Ensure keyboard navigation works for all interactive elements.
- Maintain minimum contrast ratios (WCAG AA).

---

## 4. Code Editing Rules

### When Modifying Existing Code
- Model-written code must **adhere to existing style and design standards** and blend into the codebase.
- Read `package.json` and existing imports before adding new dependencies.
- Follow the established patterns in neighboring files.
- Keep changes minimal and focused on the task at hand.

### Code Quality Standards
- **Clarity first**: prefer readable, maintainable solutions with clear names and straightforward control flow.
- No code-golf or overly clever one-liners.
- Use descriptive variable names (no single-letter variables except in trivial loops).
- Add comments only where the logic isn't self-evident.
- Don't add docstrings, comments, or type annotations to code you didn't change.

### What to Avoid
- Don't add features, refactor code, or make "improvements" beyond what was asked.
- Don't add error handling for scenarios that can't happen.
- Don't create helpers or abstractions for one-time operations.
- Don't use feature flags or backwards-compatibility shims when you can just change the code.
- Never add copyright or license headers unless specifically requested.

---

## 5. Agentic Workflow Principles

These principles govern how AI-assisted development should behave when working on the CARLA Web project.

### 5.1 Context Gathering Strategy

```
Goal: Get enough context fast. Parallelize discovery and stop as soon as you can act.

Method:
- Start broad, then fan out to focused subqueries.
- In parallel, launch varied queries; read top hits per query.
- Deduplicate paths and cache; don't repeat queries.
- Avoid over-searching for context.

Early stop criteria:
- You can name exact content to change.
- Top hits converge (~70%) on one area/path.

Depth:
- Trace only symbols you'll modify or whose contracts you rely on.
- Avoid transitive expansion unless necessary.

Loop:
- Batch search -> minimal plan -> complete task.
- Search again only if validation fails or new unknowns appear.
- Prefer acting over more searching.
```

### 5.2 Persistence and Autonomy

- Keep going until the task is completely resolved before yielding back to the user.
- Only terminate when you are sure the problem is solved.
- Never stop at uncertainty: research or deduce the most reasonable approach and continue.
- Do not ask the user to confirm assumptions: document them, act on them, and adjust if proven wrong.
- Decompose requests into all required sub-tasks. Confirm each is completed before finishing.

### 5.3 Planning and Execution

- Plan extensively before making changes.
- Reflect on outcomes after each step.
- Break distinct, separable tasks into individual steps with one step per action.
- For complex multi-step tasks, use higher reasoning effort for better outputs.

### 5.4 Verification

- Routinely verify code works as you progress, especially deliverables.
- Don't hand back to the user until you are sure the problem is solved.
- Always check `git status` to sanity-check changes before finishing.
- Run pre-commit hooks if available.
- Remove unnecessary inline comments.

---

## 6. Tool Preambles and Progress Communication

When working on long tasks, provide clear progress updates:

1. **Begin** by rephrasing the goal clearly and concisely.
2. **Outline** a structured plan detailing each logical step.
3. **Narrate** each step succinctly as you execute.
4. **Summarize** completed work distinctly from the upfront plan.

This improves the user's ability to follow along with complex work.

---

## 7. Instruction Following Rules

### Avoid Contradictions
- Prompts and configuration must not contain contradictory instructions.
- If two rules conflict, the more specific rule takes precedence.
- Resolve instruction hierarchy conflicts explicitly rather than leaving ambiguity.

### Hierarchy of Authority
1. Security constraints (never bypassed)
2. User-provided explicit instructions
3. Project-level configuration (CLAUDE.md, .cursorrules, etc.)
4. Framework/library conventions
5. General best practices

---

## 8. CARLA Web-Specific Considerations

### Real-Time Data Pipeline
- The web client will receive real-time simulation data via WebSocket connections.
- Sensor data (camera, LiDAR, radar, IMU) must be streamed efficiently.
- Use Web Workers for heavy computation (point cloud processing, image decoding).
- Implement backpressure mechanisms to handle variable simulation tick rates.

### Simulation Control Interface
- Provide intuitive controls for: play/pause, step, speed adjustment, weather, time of day.
- Vehicle spawning, route planning, and scenario configuration should be accessible via the web UI.
- Map visualization should support panning, zooming, and layer toggling.

### Multi-Client Architecture
- The web version should support multiple simultaneous viewers.
- State synchronization between clients must be handled server-side.
- Each client should be able to subscribe to different sensor feeds independently.

### Performance Budgets
- Target 60fps for the main viewport rendering.
- Sensor data display should not block the main thread.
- Initial page load: < 3 seconds on broadband.
- Time to interactive: < 5 seconds.
