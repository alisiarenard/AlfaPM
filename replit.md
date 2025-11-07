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
- **Metrics Card:** Displays Innovation Rate and Value/Cost metrics with smooth loading transitions.
- **Initiatives Timeline:** Core visualization with sticky columns and scrollable sprint columns.
    - **Status Icons:** Material Design icons indicate initiative status.
    - **Completion Indicator:** A small green checkmark icon indicates when all required data is complete for an initiative.
    - **Forecasted Color Blocks & Planned Duration Borders:** Visualizes sprint duration and planned duration range.
    - **Editable Planned Involvement:** Inline editing for "Фокус(план)" column.
    - **Business Support Handling:** Special display for "Поддержка бизнеса" initiatives.
    - **Initiative Details Modal:** Displays initiative details, four progress bars (Size, Costs, Effect, Value/Cost), and allows inline editing for "Epic" type initiatives (Planned Size, Planned Value, Actual Value). Value calculations are automated for Compliance and Enabler types.
    - **Sprint Tasks Modal:** Shows tasks for a given sprint, with clickable links to Kaiten cards.
    - **Timeline Block Tooltips:** Displays start, planned end, and actual end dates on hover.
- **Team Header:** Displays team name, board ID, Velocity, Innovation Rate, and a Kaiten sync button.
- **Team Management:** Full CRUD operations for teams and departments with Kaiten board validation.
- **Initiative Filtering:** Filters initiatives based on status and completion.
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

**Kaiten Integration:**
- **New Sprint API:** Uses Kaiten's `/api/latest/sprints` endpoint to fetch all company sprints in a single request, filtering by team `board_id` for efficiency.
- **Synchronization Sequence:** 
  1. Initiatives: Fetches cards from initiative boards
  2. Sprints: Retrieves all sprints via new API, filters by board_id, saves to database
  3. Tasks: Fetches task cards from each sprint
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