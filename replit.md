# Initiatives Timeline - Project Management Application

## Overview
This project is a web-based application designed to visualize and track team initiatives across sprint timelines. It enables users to upload team data, displaying initiatives with story points, sprint allocations, and status. The application supports multiple teams via separate tabs and aims to provide a clear, scannable overview of project progress and team allocation, streamlining project management and enhancing team visibility for efficient, data-driven tracking.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with React 18+ and TypeScript, utilizing Vite for tooling, Wouter for routing, and React Query for server state management.

**UI/UX Decisions:**
- **Layout:** Responsive, centered layout with horizontal scrolling for timeline tables.
- **Component System:** Shadcn/ui components (Radix UI base) styled with Tailwind CSS, custom design tokens, and CSS variables for theming (dark mode primary).
- **Design System:** Inter font for UI, JetBrains Mono for code. Custom border radius, status color system (Active, Planned, Completed, At Risk), and elevation system for hover/active states.

**Key Features:**
- **Multi-Team Support:** Departments and teams are managed via Shadcn Tabs, with independent data fetching.
- **Year Selection:** Filter data by year (2025, 2026) using a header dropdown.
- **Team Selection Menu:** Multi-select teams within a department, with an option to download Excel reports.
- **URL-Based Filter State:** Complete bidirectional synchronization between URL parameters and filter state, enabling shareable links and browser history navigation. URL parameters include dept (department ID), year (2025/2026), teams (comma-separated IDs), active (boolean flag), and tab (active team tab ID). State automatically restores from URL on page load and updates during browser back/forward navigation via popstate events.
- **Excel Report Download:** Generates client-side Excel files with "Cost Structure" and "Initiatives" sheets. The "Initiatives" sheet groups initiatives by `cardId`, sums costs for shared initiatives, and applies specific value calculations for Compliance and Enabler initiatives.
- **AI-Powered Sprint PDF Reports:** Generates downloadable PDF reports for sprints with AI-processed task summaries. Tasks are grouped by initiatives, shortened via configurable AI model (5-7 words), and labeled with (back)/(front) tags for backend/frontend work. "Поддержка бизнеса" tasks appear under "Другие задачи". Optimized with batched AI requests (20 tasks per batch), max_tokens limit, and graceful fallback to original text on API errors. AI configuration is flexible via .env file, supporting OpenAI, Azure OpenAI, and compatible APIs.
- **Metrics Card:** Displays Innovation Rate and Value/Cost metrics with smooth loading transitions.
- **Initiatives Timeline:** Core visualization with sticky columns and scrollable sprint columns.
    - **Status Icons:** Material Design icons indicate initiative status.
    - **Completion Indicator:** A small green checkmark icon indicates when all required data is complete for an initiative.
    - **Forecasted Color Blocks & Planned Duration Borders:** Visualizes sprint duration and planned duration range.
    - **Editable Planned Involvement:** Inline editing for "Фокус(план)" column.
    - **Business Support Handling:** Special display for "Поддержка бизнеса" initiatives.
    - **Initiative Details Modal:** Displays initiative details, four progress bars (Size, Costs, Effect, Value/Cost), and allows inline editing for "Epic" type initiatives (Planned Size, Planned Value, Actual Value). Value calculations are automated for Compliance and Enabler types.
    - **Sprint Tasks Modal:** Shows tasks for a given sprint with clickable links to Kaiten cards. Modal is max-height 60vh with footer containing "Скачать отчет спринта" button for PDF generation.
    - **Timeline Block Tooltips:** Displays start, planned end, and actual end dates on hover.
- **Team Header:** Displays team name, board ID, Velocity, Innovation Rate, and a Kaiten sync button.
- **Team Management:** Full CRUD operations for teams and departments with Kaiten board validation.
    - **Team Deletion:** Delete teams via trash icon in settings panel with AlertDialog confirmation. Uses ref-based state management to prevent race conditions during async deletion. Atomically removes all related data (tasks → sprints → initiatives → team) in a database transaction. Automatically clears UI state (editingTeam, selectedTeams, activeTab) and invalidates all dependent queries.
- **Initiative Filtering:** Displays Epic, Compliance, Enabler, and "Поддержка бизнеса" (Business Support) initiatives. Filters based on status, year, and completion. Tasks from other initiative types are automatically redirected to Business Support.
- **Calculations:** Dynamically calculates Innovation Rate, Value/Cost, Cost Structure, Involvement, Forecasted Sprint Count, and automatically generates sprints.

### Backend Architecture
The backend is an Express.js application with TypeScript and ESM, providing a RESTful API under `/api`.

**API Endpoints:**
- Standard CRUD endpoints for departments, teams, initiatives, and tasks.
- Metrics endpoints for Innovation Rate, Cost Structure, and Value/Cost:
  - Innovation Rate: Calculates percentage of story points from tasks linked to Epic, Compliance, or Enabler initiatives, filtered by selected teams and year
  - Cost Structure: Breaks down story points by initiative/task types, filtered by selected teams and year
  - Value/Cost: Calculates planned and actual value-to-cost ratios, filtered by selected teams' sprints
- Kaiten synchronization endpoints, including `PATCH /api/kaiten/update-initiative/:cardId` for updating initiative fields in both Kaiten and the local database.
- Sprint PDF report generation endpoint `POST /api/sprints/:sprintId/generate-report` that creates AI-processed PDF reports with task summaries.

**Kaiten Integration:**
- **Smart Sync Endpoint:** `POST /api/kaiten/smart-sync/:teamId` provides intelligent all-in-one synchronization:
  - Step 1: Syncs initiatives from initiative board with filtering: non-archived initiatives (any status) and archived initiatives with status "done" or "in-progress" only. Archived initiatives with status "queued" are skipped.
  - Step 2: Detects current sprint by checking first card's `sprint_id` in sprint board (for teams with sprint boards)
  - Step 3: **ALWAYS** syncs tasks for current sprint (whether new or existing) with parent chain validation
  - If sprint is new: saves to database with `newSprintSynced = true`
  - If sprint exists: uses existing sprint data with `newSprintSynced = false`
  - Returns: `{ success, initiativesSynced, newSprintSynced, sprint: { ...sprintData, tasksSynced } | null }`
  - Preserves `doneDate` via `card.last_moved_to_done_at` for accurate year-based filtering
  - For teams without sprint boards: only syncs initiatives, frontend calls separate endpoint for tasks
- **Initiative Type Validation:** `findInitiativeInParentChain` recursively searches parent chain and validates initiative types (Epic/Compliance/Enabler only), preventing incorrect task-initiative associations
- **New Sprint API:** Uses Kaiten's `/api/latest/sprints` endpoint to fetch all company sprints in a single request, filtering by team `board_id` for efficiency.
- **Synchronization Sequence:** 
  1. Initiatives: Fetches cards from initiative boards
  2. Sprints: Retrieves all sprints via new API, filters by board_id, saves to database (for teams with sprint boards)
  3. Tasks: For teams with sprints, fetches task cards from each sprint. For teams without sprints, uses Kaiten `/cards` API with `last_moved_to_done_at_after` filter (current year start).
- **Sprintless Teams:** Uses Kaiten GET `/cards` endpoint with date filter `last_moved_to_done_at_after` set to start of current year. Checks `parents_ids[0]` against initiatives table, sets `initCardId` to parent card ID if found, or 0 if not found.
- **API Response Handling:** Properly handles Kaiten's response envelope structure `{ data: [...], meta: {...} }` with fallback to direct array parsing.
- Synchronizes initiatives and tasks from Kaiten, including type, archived status, and custom field values (e.g., `planned_value_id`, `fact_value_id`).
- Automatically calculates and sets `planned_value` and `fact_value` for "Compliance" and "Enabler" initiative types based on costs.
- Synchronizes `due_date` and `done_date` from Kaiten.
- Automatic synchronization on team creation: creates team and immediately syncs all data (initiatives → sprints → tasks).

### Data Storage Solutions
PostgreSQL (via Neon) is the primary data store, managed with Drizzle ORM.

**Database Schema:**
- `users`: (For future authentication)
- `departments`: Department names.
- `teams`: Team metadata (name, velocity, sprint duration, board IDs).
- `initiatives`: Initiative details (ID, title, state, size, planned_involvement, planned_value_id, planned_value, fact_value_id, fact_value, due_date, done_date).
- `tasks`: Task details (ID, title, state, size, type, sprint_id, init_card_id, archived).
- `sprints`: Sprint details (ID, board_id, title, velocity, dates).
- Schema defined in `shared/schema.ts`, migrations managed by Drizzle-kit.

## Configuration

**Kaiten Configuration:**
Kaiten domain and custom field IDs are configured via environment variables:

- `KAITEN_DOMAIN`: Your Kaiten domain (e.g., `feature.kaiten.ru`)
- `VITE_KAITEN_DOMAIN`: Same as KAITEN_DOMAIN, used for frontend card links (Vite requires VITE_ prefix)
- `KAITEN_API_KEY`: API key for Kaiten integration
- **Custom Field IDs:** Hardcoded in `server/routes.ts`:
  - `plannedValueId = "id_237"` - Kaiten custom field for planned value
  - `factValueId = "id_510"` - Kaiten custom field for actual value

**Kaiten Card Links:**
The application generates clickable links to Kaiten cards in:
- Initiative details modal (initiative title)
- Sprint tasks modal (task titles)

Links are generated via `getKaitenCardUrl()` function in `shared/kaiten.config.ts`, which reads the domain from `VITE_KAITEN_DOMAIN` environment variable. The function automatically handles archived vs. active cards by using different URL paths.

**AI Configuration (.env file):**
The application uses AI to generate sprint reports with shortened task summaries. Configuration is managed via environment variables in `.env` file:

- `OPENAI_API_KEY`: API key for OpenAI or compatible service (required)
- `AI_MODEL`: Model to use for task summarization (default: `gpt-4o-mini`)
  - Examples: `gpt-4o-mini`, `gpt-4o`, `gpt-3.5-turbo`, `gpt-4-turbo`
- `AI_BASE_URL`: Custom API endpoint URL (optional)
  - Default: `https://api.openai.com/v1`
  - Azure OpenAI: `https://your-resource.openai.azure.com/openai/deployments/your-deployment`
  - Local models: `http://localhost:1234/v1`

**Setup Instructions:**
1. Copy `.env.example` to `.env`
2. Configure your AI credentials and preferences
3. Restart the application to apply changes

The flexible configuration allows using any OpenAI-compatible API, including Azure OpenAI, local models (LM Studio, Ollama), or other providers.

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
- `openai` (for AI task summarization - configurable via .env)
- `pdfkit` (PDF generation)

**Build & Development Tools:**
- `vite`
- `esbuild`
- `postcss`, `tailwindcss`, `autoprefixer`
- `typescript`
- `tsx`
- `undici`