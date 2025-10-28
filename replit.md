# Initiatives Timeline - Project Management Application

## Overview
This project is a web-based application designed to visualize and track team initiatives across sprint timelines. It enables users to upload team data, displaying initiatives with their associated story points, sprint allocations, and status information. The application supports multiple teams, each accessible via a separate tab, and features a clean, data-focused interface inspired by Linear's minimalist aesthetics and Carbon Design's data visualization principles. The core purpose is to provide a clear, scannable overview of project progress and team allocation. The application's business vision is to streamline project management and enhance team visibility, offering market potential in organizations seeking efficient, data-driven project tracking.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with React 18+ and TypeScript, utilizing Vite for development and bundling. Wouter handles client-side routing, and React Query manages server state with infinite stale time and disabled refetching.

**UI/UX Decisions:**
- **Layout:** Responsive design with a main content container, max-width 1200px on smaller viewports, expanding to 80% of viewport width on larger screens, centered with `mx-auto`. Timeline tables allow horizontal scrolling.
- **Component System:** Shadcn/ui components (built on Radix UI) are styled with Tailwind CSS, custom design tokens, and CSS variables for theming (dark mode primary, light mode supported).
- **Design System:** Inter font for UI, JetBrains Mono for monospace data. Custom border radius scales and a status color system (Active, Planned, Completed, At Risk) are implemented. Hover and active states use an elevation system.

**Key Features:**
- **Multi-Team Support:** Departments and teams are fetched from the database and displayed in separate tabs using Shadcn Tabs. Each tab independently fetches and displays initiatives and team metrics.
- **Team Selection Menu:** Dropdown menu (triggered by three-dot button in top-right corner of metrics card) displays all teams from selected department with checkboxes for multi-selection. All teams are checked by default. Menu has white background (bg-white). Includes "Скачать отчет" (Download Report) option separated by horizontal divider. State automatically resets to all-checked when department changes. Uses DropdownMenuCheckboxItem for full accessibility (keyboard navigation, screen reader support, aria attributes).
- **Metrics Card:** Unified full-width card displays three metric sections: Innovation Rate (20% width), Value/Cost (20% width), and reserved section (60% width), separated by vertical borders with top/bottom margins (my-3) for visual spacing. Contains team selection menu button (three dots) in top-right corner (position: absolute). During metric recalculation, card smoothly transitions to 50% opacity (300ms) while preserving previous metric values (using useRef to store last successful data), providing clear loading feedback without content shift or value disappearance.
- **Initiatives Timeline:** The core visualization, showing initiatives mapped to sprint timelines. It includes sticky columns for initiative details: "Инициатива" (220px, left-0), "Выполнено" (100px, left-220px), "Фокус(план)" (100px, left-320px, editable on click), "Фокус (факт)" (100px, left-420px), and scrollable sprint columns (100px each) with story points and colored status blocks.
  - **Status Icons:** Material Design outline icons indicate initiative status: Play Circle (in-progress, red), Check Circle (completed, green), Pause Circle (queued, light gray). "Поддержка бизнеса" initiatives display gray icons for all statuses.
  - **Forecasted Color Blocks:** Blocks stretch across predicted sprint count using formula `ceil(Size / (Velocity × Involvement%))`, starting from first sprint with SP. Includes guards for zero/undefined velocity, involvement, and size values. Falls back to historical span when forecasting is impossible. Color blocks display without borders with 10% opacity (red for regular initiatives, gray for "Поддержка бизнеса").
  - **Planned Duration Borders:** Color blocks display borders (2px, red #cd253d with 0.3 opacity) on all four sides to indicate planned duration range, calculated using formula `ceil(Size / (Velocity × PlannedInvolvement%))`. Borders span from first sprint with SP to last planned sprint, with left corners rounded (6px radius) only on the first sprint. Not applied to "Поддержка бизнеса" initiatives or queued initiatives without sprints.
  - **Editable Planned Involvement:** The "Фокус(план)" column is editable - clicking on any cell opens an inline input field. Changes are saved to the database on blur (clicking outside) or pressing Enter, and the timeline automatically recalculates planned duration borders with the new value. Press Escape to cancel editing. Input validates values between 0-100.
  - **Business Support Special Handling:** "Поддержка бизнеса" (cardId === 0) displays grey blocks only in sprints with factual SP > 0, without forecasting.
  - **Sprint Tasks Modal:** Sprint headers (with tasks) are implemented as semantic `<button>` elements with full keyboard accessibility. Clicking (or pressing Enter/Space) on a sprint header opens a modal window displaying all initiatives and their tasks for that sprint. Each initiative shows: initiative title, followed by a list of tasks with title, type (if present), and size. Buttons include aria-labels and focus rings for accessibility. Modal uses Shadcn Dialog component with proper data-testid attributes for testing.
  - **Timeline Block Tooltips:** Hovering over timeline color blocks displays a tooltip with three dates on separate lines: "Дата начала" (start date from first sprint), "Дата окончания(план)" (planned end date calculated from planned_involvement), and "Дата окончания(факт)" (forecasted end date based on actual involvement).
- **Team Header:** Displays team name, board ID, Velocity, and Innovation Rate. Includes a button to manually sync initiatives from Kaiten.
- **Team Management:** Full CRUD functionality for teams and departments, including Kaiten board validation during creation and editing.
- **Initiative Filtering:** 
  - Initiatives in queue (state: "1-queued") are **always displayed**, regardless of whether they have tasks in team sprints
  - "Show Active Only" filter displays only in-progress initiatives (plus queued initiatives)
  - Initiatives with 0 completed SP in done/inProgress state are hidden
  - Backend filters initiatives to show only those with tasks in team sprints, plus queued initiatives and "Business Support" category
- **Calculations:** 
  - **Innovation Rate (IR):** Calculated dynamically for selected teams via `/api/metrics/innovation-rate` endpoint. Formula: `(innovationSP / totalSP) * 100` where innovationSP is the sum of story points from tasks with parent initiatives (initCardId !== null && initCardId !== 0), and totalSP is the sum of all task story points from selected teams' sprints. Returns actualIR, plannedIR (from department), and diffFromPlanned (actualIR - plannedIR). Frontend displays actualIR as percentage with color-coded difference (green if positive, red if negative).
  - **Involvement:** Calculated on backend as (initiative SP / total SP of all initiatives) * 100 for a specific period. Period starts from the first sprint with non-zero SP for the initiative and ends at: (a) nearest sprint to current date if initiative is inProgress, or (b) last sprint with SP if initiative is done. Uses sprint dates (not IDs) for correct chronological ordering.
  - **Sprint Header IR (Investment Ratio):** Percentage of SP excluding "Business Support" category
  - **Forecasted Sprint Count:** `ceil(initiative size / (team velocity × involvement% / 100))` with validation for positive, finite values
  - **Automatic Sprint Generation:** Sprints are automatically generated for 6 months forward from the current sprint's start date. If no current sprint exists, generates from today's date. Uses team velocity and sprint duration for calculation.

### Backend Architecture
The backend uses Express.js with TypeScript and an ESM module system, providing a RESTful API under the `/api` prefix.

**API Endpoints:**
- `/api/departments`: Manage departments (GET, POST, PATCH).
- `/api/teams`: Manage teams (GET teams by department, POST create team, PATCH update team).
- `/api/initiatives`: Manage initiatives (GET, POST, PATCH, DELETE, GET by board ID).
- `/api/tasks`: Manage tasks (GET, POST, PATCH, DELETE, GET by board ID).
- `/api/metrics/innovation-rate`: Calculate Innovation Rate for selected teams (GET with teamIds query param). Returns actualIR, plannedIR, diffFromPlanned, totalSP, and innovationSP.
- `/api/kaiten/sync-board/:boardId`: Sync initiatives from Kaiten.
- `/api/kaiten/sync-tasks/:boardId`: Sync tasks (children cards) from Kaiten.
- `/api/kaiten/update-sprint/:sprintId`: Fetch sprint data from Kaiten and update task sprint_ids.
- `/api/kaiten/sync-sprint/:sprintId`: Sync tasks from a specific sprint.
- `/api/kaiten/sync-all-sprints/:boardId`: Sync tasks from all sprints for a board.

**Kaiten Integration:**
- Syncs initiatives and tasks from the Kaiten API (feature.kaiten.ru) to the database, mapping Kaiten card states to initiative states (queued, inProgress, done). Requires `KAITEN_API_KEY` and `KAITEN_DOMAIN` environment variables. Includes sequential validation for `sprintBoardId` and `initBoardId` during team creation/update.
- **Type Synchronization:** Initiative and task type values (`card.type.name` from Kaiten API) are automatically persisted to the database during sync operations:
  - Initiatives: Synced during manual board sync and team creation
  - Tasks: Synced during task board sync (`/api/kaiten/sync-tasks/:boardId`) and sprint sync (`/api/kaiten/update-sprint/:sprintId`)
  - Enables categorization and filtering by initiative/task type

### Data Storage Solutions
PostgreSQL, powered by Neon, is the primary data store. Drizzle ORM with the Neon HTTP driver provides type-safe queries.

**Database Schema:**
- `users`: For future authentication.
- `departments`: Department names.
- `teams`: Team metadata (ID, name, velocity, sprint duration, department ID, board IDs).
- `initiatives`: Initiative details (ID, card ID, title, state, condition, size, board ID, planned_involvement).
- `tasks`: Task details (ID, card ID, title, created, state, size, condition, board ID, sprint_id, type, completed_at, init_card_id).
- `sprints`: Sprint details (sprint_id (PK), board_id, title, velocity, start_date, finish_date, actual_finish_date).
- Schema is defined in `shared/schema.ts` for type safety. Drizzle-kit manages migrations.

## External Dependencies

**Database:**
- `@neondatabase/serverless` (Neon HTTP driver)
- `drizzle-orm`

**UI Libraries:**
- Radix UI (various components)
- `lucide-react` (icons)
- `embla-carousel-react`
- `date-fns`

**Utilities:**
- `class-variance-authority` (CVA)
- `clsx`, `tailwind-merge`
- `cmdk`
- `react-hook-form`

**Build & Development Tools:**
- `vite`
- `esbuild`
- `postcss`, `tailwindcss`, `autoprefixer`
- `typescript`
- `tsx`
- `undici` (for HTTP requests, e.g., Kaiten integration)