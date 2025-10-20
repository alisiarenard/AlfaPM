# Initiatives Timeline - Project Management Application

## Overview
This project is a web-based application designed to visualize and track team initiatives across sprint timelines. It enables users to upload team data, displaying initiatives with their associated story points, sprint allocations, and status information. The application supports multiple teams, each accessible via a separate tab, and features a clean, data-focused interface inspired by Linear's minimalist aesthetics and Carbon Design's data visualization principles. The core purpose is to provide a clear, scannable overview of project progress and team allocation. The application's business vision is to streamline project management and enhance team visibility, offering market potential in organizations seeking efficient, data-driven project tracking.

## Recent Changes (October 20, 2025)
- **Team Management Feature**: Added full team creation and editing functionality in settings modal
  - **Team Creation**: 
    - Click "+" button and select "Команда" to open team creation form
    - Form includes department selector and all team fields
    - Required fields: teamName, spaceId, sprintBoardId, initBoardId, velocity, sprintDuration
    - Optional field: spPrice (defaults to 0)
    - "Добавить" button disabled until all required fields filled
    - After creation, form switches to edit mode
    - Backend: POST /api/teams endpoint
    - Storage: createTeam() method in DbStorage
  - **Team Editing**:
    - Clicking on team in left panel opens editing form in right panel
    - Form shows team name and department name in header
    - All team fields editable with localized labels (Russian)
    - "Сохранить" button appears only when changes detected
    - Backend: PATCH /api/teams/:teamId endpoint
    - Storage: updateTeam() method in DbStorage
    - Team items highlight when selected
    - Success toast "Команда обновлена" after save
    - Auto-refreshes team data and invalidates cache

## Previous Changes (October 17, 2025)
- Added `sprints` table to PostgreSQL database
- Sprints table includes fields: sprint_id (PK), board_id, title, velocity, start_date, finish_date, actual_finish_date (nullable)
- Populated sprints table with sprint data: 40895 (Sprint 1), 40896 (Sprint 2), 40897 (Sprint 3), 40909 (sprint 4)
- Added automatic sprint generation in frontend: fills gaps between existing sprints and generates future sprints until end of year
- Tasks with null init_card_id now default to 0 (linked to "Поддержка бизнеса" initiative)
- Updated UI: removed "SP" text from all table cells, showing only numbers
- Updated "Поддержка бизнеса" to always show fixed start date: 01.01.{current_year}
- Backend sorting: "Поддержка бизнеса" (card_id=0) always first, then by state (3-done, 2-inProgress, 1-queued)
- Replaced status badges with colored circles (green=active, blue=planned, gray=completed)

## Previous Changes (October 16, 2025)
- Added `tasks` table to PostgreSQL database with full CRUD API support
- Created task management endpoints: GET/POST/PATCH/DELETE `/api/tasks` and `/api/tasks/board/:boardId`
- Tasks table includes fields: id, card_id, title, created, state, size, condition, board_id, sprint_id (nullable), type (nullable), completed_at (nullable), init_card_id (nullable)
- Tasks reuse initiative_state and initiative_condition ENUMs for consistency
- Implemented storage layer methods for tasks: getAllTasks, getTasksByBoardId, createTask, updateTask, deleteTask, syncTaskFromKaiten
- Added Kaiten tasks synchronization endpoint: POST `/api/kaiten/sync-tasks/:boardId`
- Tasks sync processes ALL children cards from Kaiten board where state=3 (done), regardless of sprint_id value
- Parent card_id is stored in init_card_id field to link tasks to their parent initiatives
- Kaiten API limitation: children data only available via individual card fetch (/cards/{cardId}), not board fetch (/boards/{boardId})
- Sync implementation: fetches each parent card individually to retrieve children array, then filters and syncs children with state=3
- Added sprint_id field to tasks table for sprint association
- Created endpoint POST `/api/kaiten/update-sprint/:sprintId` to fetch sprint data from Kaiten and update sprint_id for tasks where card_id matches cards in the sprint
- Added getSprint() method to KaitenClient for fetching sprint data from `/api/latest/sprints/{sprintId}`

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
- **Initiatives Timeline:** The core visualization, showing initiatives mapped to sprint timelines. It includes sticky columns for initiative details (name, start date, size, completed, involvement) and scrollable sprint columns with story points and colored status blocks.
- **Team Header:** Displays team name, board ID, Velocity, and Innovation Rate (percentage of Epic story points vs total story points).
- **Calculations:**
    - **Involvement:** Automatically calculated as the percentage of an initiative's story points against all story points within its time period.
    - **Sprint Header IR:** Displays Investment Ratio (Epic story points / Total sprint story points) in sprint headers.
    - **Sprint Auto-Generation:** Sprints are automatically generated from the current date to the end of the year based on `sprintDuration` (if provided), filling gaps and preserving existing sprints.

### Backend Architecture
The backend uses Express.js with TypeScript and an ESM module system. It provides a RESTful API under the `/api` prefix.

**API Endpoints:**
- `/api/departments` (GET, POST, PATCH): Manage departments.
- `/api/teams/:departmentId` (GET): Retrieve teams for a department.
- `/api/teams` (POST): Create a new team.
- `/api/teams/:teamId` (PATCH): Update team details.
- `/api/initiatives` (GET, POST, PATCH, DELETE): Manage initiatives.
- `/api/initiatives/board/:initBoardId`: Retrieve initiatives for a specific board.
- `/api/tasks` (GET, POST, PATCH, DELETE): Manage tasks.
- `/api/tasks/board/:boardId`: Retrieve tasks for a specific board.
- `/api/kaiten/sync-board/:boardId`: Sync initiatives from Kaiten.
- `/api/kaiten/sync-tasks/:boardId`: Sync tasks (children cards) from Kaiten.
- `/api/kaiten/update-sprint/:sprintId`: Fetch sprint from Kaiten and update sprint_id for tasks where card_id matches.

**Kaiten Integration:**
- Syncs initiatives from the Kaiten API (feature.kaiten.ru) to the database, mapping Kaiten card states to initiative states (queued, inProgress, done). Requires `KAITEN_API_KEY` and `KAITEN_DOMAIN` environment variables.

### Data Storage Solutions
PostgreSQL, powered by Neon, is the primary data store. Drizzle ORM with the Neon HTTP driver provides type-safe queries.

**Database Schema:**
- `users`: For future authentication.
- `departments`: Department names.
- `teams`: Team metadata (ID, name, velocity, sprint duration, department ID, board IDs).
- `initiatives`: Initiative details (ID, card ID, title, state, condition, size, board ID).
- `tasks`: Task details (ID, card ID, title, created, state, size, condition, board ID, sprint_id, type, completed_at, init_card_id).
- `sprints`: Sprint details (sprint_id (PK), board_id, title, velocity, start_date, finish_date, actual_finish_date).
- Schema is defined in `shared/schema.ts` for type safety.
- Drizzle-kit manages migrations.

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
- `connect-pg-simple` (for future session storage)
- `drizzle-zod` (for schema validation)