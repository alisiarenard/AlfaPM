# Initiatives Timeline - Project Management Application

## Overview
This project is a web-based application for visualizing and tracking team initiatives across sprint timelines. It allows users to upload team data, displaying initiatives with story points, sprint allocations, and status. The application supports multiple teams via separate tabs and features a clean, data-focused interface inspired by Linear and Carbon Design. Its core purpose is to provide a clear, scannable overview of project progress and team allocation, aiming to streamline project management and enhance team visibility for efficient, data-driven tracking.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
Built with React 18+ and TypeScript, using Vite, Wouter for routing, and React Query for server state management.

**UI/UX Decisions:**
- **Layout:** Responsive, centered layout with horizontal scrolling for timeline tables.
- **Component System:** Shadcn/ui components (Radix UI base) styled with Tailwind CSS, custom design tokens, and CSS variables for theming (dark mode primary).
- **Design System:** Inter font for UI, JetBrains Mono for code. Custom border radius, status color system (Active, Planned, Completed, At Risk), and elevation system for hover/active states.

**Key Features:**
- **Multi-Team Support:** Departments and teams displayed in Shadcn Tabs, each independently fetching data.
- **Year Selection:** Header dropdown for filtering data by year (2025, 2026).
- **Team Selection Menu:** Dropdown for multi-selecting teams within a department, includes an Excel report download option.
- **Excel Report Download:** Generates a client-side Excel file with cost structure data for selected teams and year using `xlsx`.
- **Metrics Card:** Displays Innovation Rate and Value/Cost metrics. Smoothly transitions opacity during recalculation to indicate loading without content shift.
- **Initiatives Timeline:** Core visualization with sticky columns for initiative details and scrollable sprint columns.
    - **Status Icons:** Material Design icons indicate initiative status (in-progress, completed, queued).
    - **Forecasted Color Blocks:** Visualizes forecasted sprint duration based on `ceil(Size / (Velocity × Involvement%))` with guards for invalid values.
    - **Planned Duration Borders:** 2px borders indicate planned duration range based on `ceil(Size / (Velocity × PlannedInvolvement%))`.
    - **Editable Planned Involvement:** "Фокус(план)" column is inline editable, saving changes to the database and recalculating borders on blur or Enter.
    - **Business Support Handling:** "Поддержка бизнеса" (cardId === 0) displays grey blocks only for sprints with factual SP > 0, without forecasting.
    - **Sprint Tasks Modal:** Clicking sprint headers opens a modal displaying initiatives and their tasks for that sprint. Accordions are expanded by default for all initiatives.
    - **Clickable Task Links:** Task titles in sprint modal are clickable links that open Kaiten cards in new tabs. Task titles use medium font size (text-sm) with ExternalLink icon (lucide-react) positioned to the right. URL structure uses spaceId from team settings and adapts based on archived status: non-archived tasks use `/boards/card/{cardId}`, archived tasks use `/archive/card/{cardId}`.
    - **Timeline Block Tooltips:** Displays start, planned end, and actual end dates on hover.
- **Team Header:** Displays team name, board ID, Velocity, Innovation Rate, and a button to sync initiatives from Kaiten.
- **Team Management:** Full CRUD for teams and departments with Kaiten board validation.
- **Initiative Filtering:** Displays queued initiatives always; "Show Active Only" filter shows in-progress and queued; hides initiatives with 0 completed SP in done/inProgress state. Backend filters ensure relevance.
- **Calculations:**
    - **Innovation Rate (IR):** `(innovationSP / totalSP) * 100` dynamically calculated, displayed with color-coded difference from planned.
    - **Cost Structure:** Dynamically calculated percentage distribution of SP by initiative/task types, categorized by Epic, Compliance, Enabler, and various support types.
    - **Involvement:** Calculated as `(initiative SP / total SP of all initiatives) * 100` for a specific period based on sprint dates.
    - **Sprint Header IR:** Percentage of SP excluding "Business Support."
    - **Forecasted Sprint Count:** `ceil(initiative size / (team velocity × involvement% / 100))`.
    - **Automatic Sprint Generation:** Generates 6 months of sprints forward from the current sprint.

### Backend Architecture
Express.js with TypeScript and ESM provides a RESTful API under `/api`.

**API Endpoints:**
- `/api/departments`: CRUD for departments.
- `/api/teams`: CRUD for teams.
- `/api/initiatives`: CRUD for initiatives.
- `/api/tasks`: CRUD for tasks.
- `/api/metrics/innovation-rate`: Calculates Innovation Rate.
- `/api/metrics/cost-structure`: Calculates cost structure.
- `/api/kaiten/*`: Endpoints for syncing initiatives, tasks, and sprints from Kaiten.

**Kaiten Integration:**
- Syncs initiatives and tasks from Kaiten API, mapping states. Requires `KAITEN_API_KEY` and `KAITEN_DOMAIN`.
- **Type Synchronization:** Persists initiative and task types (`card.type.name`) from Kaiten during sync operations.
- **Archived Status:** Syncs `card.archived` status for tasks from Kaiten.

### Data Storage Solutions
PostgreSQL (via Neon) is the primary data store, with Drizzle ORM for type-safe queries.

**Database Schema:**
- `users`: (For future authentication)
- `departments`: Department names.
- `teams`: Team metadata (name, velocity, sprint duration, board IDs).
- `initiatives`: Initiative details (ID, title, state, size, planned_involvement).
- `tasks`: Task details (ID, title, state, size, type, sprint_id, init_card_id, archived).
- `sprints`: Sprint details (ID, board_id, title, velocity, dates).
- Schema defined in `shared/schema.ts`, migrations managed by Drizzle-kit.

## External Dependencies

**Database:**
- `@neondatabase/serverless`
- `drizzle-orm`

**UI Libraries:**
- Radix UI
- `lucide-react`
- `embla-carousel-react`
- `date-fns`

**Utilities:**
- `class-variance-authority` (CVA)
- `clsx`, `tailwind-merge`
- `cmdk`
- `react-hook-form`
- `xlsx` (SheetJS)

**Build & Development Tools:**
- `vite`
- `esbuild`
- `postcss`, `tailwindcss`, `autoprefixer`
- `typescript`
- `tsx`
- `undici`