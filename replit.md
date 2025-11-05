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
- **Excel Report Download:** Generates a client-side Excel file with two sheets using `xlsx`:
    - **Структура затрат** (Cost Structure): Shows year, department, teams, and breakdown by Development/Support categories with percentages
    - **Инициативы** (Initiatives): Lists all initiatives for selected teams with columns: Тип, Название, Срок (план), Срок (прод), Срок (эффект), Затраты (план), Затраты (факт), Эффект (план), Эффект (факт), Value/Cost (план), Value/Cost (факт). Initiatives are grouped by cardId to avoid duplication - if multiple teams work on the same initiative, it appears once with summed costs. For Compliance and Enabler initiatives, Эффект (план) = Затраты (план) and Эффект (факт) = Затраты (факт), ensuring Value/Cost ratio equals 1.0. Dates are formatted as "dd.MM" (e.g., "30.10"). Report structure: all Epic initiatives first, then "Всего" row with totals, then Compliance initiatives with "Всего" row, then Enabler initiatives with "Всего" row, then all other initiative types. "Всего" rows show summed costs, summed values, and calculated value/cost ratios (sum of values ÷ sum of costs)
- **Metrics Card:** Displays Innovation Rate and Value/Cost metrics. Value/Cost shows planned (sum of all initiative planned values ÷ sum of all initiative planned costs) and actual (sum of all initiative actual values ÷ sum of all initiative actual costs) ratios for the selected department. Smoothly transitions opacity during recalculation to indicate loading without content shift.
- **Initiatives Timeline:** Core visualization with sticky columns for initiative details and scrollable sprint columns.
    - **Status Icons:** Material Design icons indicate initiative status. In-progress and completed initiatives use red color (#cd253d), queued initiatives use gray.
    - **Completion Indicator:** Small green checkmark icon (CheckCircle from lucide-react, 3x3px) appears after initiative title when all required data is complete. For Epic initiatives: size > 0 and plannedValue filled. For Compliance/Enabler: size > 0 (values auto-calculated from costs).
    - **Forecasted Color Blocks:** Visualizes forecasted sprint duration based on `ceil(Size / (Velocity × Involvement%))` with guards for invalid values.
    - **Planned Duration Borders:** 2px borders indicate planned duration range based on `ceil(Size / (Velocity × PlannedInvolvement%))`.
    - **Editable Planned Involvement:** "Фокус(план)" column is inline editable, saving changes to the database and recalculating borders on blur or Enter.
    - **Business Support Handling:** "Поддержка бизнеса" (cardId === 0) displays grey blocks only for sprints with factual SP > 0, without forecasting.
    - **Initiative Details Modal:** Clicking initiative title opens a modal showing initiative name, type, and four progress bars (5px height, bg-muted background, #cd253d fill color rgb(205, 37, 61)). Modal structure:
        - **Header**: Initiative name and type (displayed below title in smaller, darker text-xs text-foreground)
        - **Progress bars**:
          - **Размер, SP**: actual / planned (without SP in values). Actual value displayed in red (#cd253d) if it exceeds planned. **Planned size is inline-editable for "Epic" type only** - clicking the value shows an input field with no spinner arrows; changes are saved on Enter or blur and synced to both Kaiten and local database.
          - **Затраты, ₽**: actual / planned cost in rubles with thousand separators (without ₽ in values). Actual cost displayed in red (#cd253d) if it exceeds planned. Costs are calculated automatically (not editable).
          - **Эффект, ₽**: actual / planned value in rubles with thousand separators (without ₽ in values). **Both planned and actual values are inline-editable for "Epic" type only** - clicking either value shows an input field with no spinner arrows; changes are saved on Enter or blur and synced to both Kaiten and local database.
          - **Value/Cost**: actual / planned ratio with one decimal place. Both actual and planned ratios displayed in red (#cd253d) if they are less than 1.0. Ratios are calculated automatically from values/costs.
        - **Editable Fields**: Three fields support inline editing with instant Kaiten synchronization **only for initiatives of type "Epic"**:
          - **Planned Size (SP)**: Integer value updated via PATCH /api/kaiten/update-initiative/:cardId with `size` parameter
          - **Planned Value (₽)**: Numeric value updated via PATCH /api/kaiten/update-initiative/:cardId with `plannedValue` parameter (stored as string in DB, sent as number to Kaiten API)
          - **Actual Value (₽)**: Numeric value updated via PATCH /api/kaiten/update-initiative/:cardId with `factValue` parameter (stored as string in DB, sent as number to Kaiten API)
        - **Editing Behavior**: Click a value to start editing (only for "Epic" type) → input field appears with current value selected, no spinner arrows → press Enter or blur to save, Escape to cancel → progress bars and Value/Cost ratios update immediately in real-time without modal reload → changes persist to both Kaiten (custom properties id_451379 for planned value, id_448119 for actual value) and local database. Number inputs support localized formats (ru-RU, de-DE, en-US) with automatic decimal and grouping separator detection.
        - **Legend**: Color indicators centered below progress bars with increased spacing (pt-6), no top border
          - Grey circle (bg-muted): "Плановые значения" (Planned values)
          - Red circle (#cd253d): "Фактические значения" (Actual values)
      For Compliance and Enabler initiative types, planned value equals planned cost and actual value equals actual cost (Value/Cost = 1.0).
      Non-clickable initiatives: "Поддержка бизнеса" (Business Support, cardId=0) and initiatives without data (no planned size and no completed SP) are rendered as non-clickable text instead of buttons.
    - **Sprint Tasks Modal:** Clicking sprint headers opens a modal displaying initiatives and their tasks for that sprint. Accordions are expanded by default for all initiatives.
    - **Clickable Task Links:** Task titles in sprint modal are clickable links that open Kaiten cards in new tabs. Task titles use medium font size (text-sm) with ExternalLink icon (lucide-react) positioned to the right. URL structure uses spaceId from team settings and adapts based on archived status: non-archived tasks use `/boards/card/{cardId}`, archived tasks use `/archive/card/{cardId}`.
    - **Task SP Display:** Tasks with SP > 0 show "{size} sp" in gray. Tasks without SP (size = 0) display red text "нет оценки" with medium font weight for emphasis.
    - **Timeline Block Tooltips:** Displays start, planned end, and actual end dates on hover.
- **Team Header:** Displays team name, board ID, Velocity, Innovation Rate, and a button to sync initiatives from Kaiten.
- **Team Management:** Full CRUD for teams and departments with Kaiten board validation.
- **Initiative Filtering:** Displays queued initiatives always; "Show Active Only" filter shows in-progress and queued; hides initiatives with 0 completed SP in done/inProgress state. Backend filters ensure relevance.
- **Calculations:**
    - **Innovation Rate (IR):** `(innovationSP / totalSP) * 100` dynamically calculated, displayed with color-coded difference from planned.
    - **Value/Cost:** Calculated at department level as `(sum of all initiative values) ÷ (sum of all initiative costs)`. Planned ratio uses planned values/costs, actual ratio uses actual values/costs. Initiatives are deduplicated by cardId when calculating across multiple teams. For Compliance and Enabler initiatives, values are automatically set equal to costs (ensuring ratio = 1.0).
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
- `/api/metrics/innovation-rate`: Calculates Innovation Rate for selected teams.
- `/api/metrics/cost-structure`: Calculates cost structure breakdown by initiative/task types for selected teams and year.
- `/api/metrics/value-cost`: Calculates Value/Cost metrics (planned and actual) for selected teams. Returns: plannedValueCost (sum of planned values ÷ sum of planned costs), factValueCost (sum of actual values ÷ sum of actual costs), and component sums.
- `/api/kaiten/*`: Endpoints for syncing initiatives, tasks, and sprints from Kaiten.
- `PATCH /api/kaiten/update-initiative/:cardId`: Updates initiative fields in both Kaiten and local database. Accepts `size` (planned size in SP), `plannedValue` (planned effect value in ₽), and `factValue` (actual effect value in ₽). Values are converted to numbers for Kaiten API (custom properties id_451379 and id_448119) while stored as strings in the database.

**Kaiten Integration:**
- Syncs initiatives and tasks from Kaiten API, mapping states. Requires `KAITEN_API_KEY` and `KAITEN_DOMAIN`.
- **Type Synchronization:** Persists initiative and task types (`card.type.name`) from Kaiten during sync operations.
- **Archived Status:** Syncs `card.archived` status for tasks from Kaiten.
- **Custom Field Synchronization:** Syncs custom field values from Kaiten card properties. All initiatives have `planned_value_id = "id_451379"` and `fact_value_id = "id_448119"` by default. During sync, both `planned_value` and `fact_value` are read from `card.properties[planned_value_id]` and `card.properties[fact_value_id]` respectively. Extraction logic handles falsy values correctly (including 0 and empty strings).
- **Automatic Cost-Based Values for Compliance and Enabler:** After syncing initiatives, for types "Compliance" and "Enabler", the system automatically calculates and sets: `planned_value = size × team.spPrice` (planned cost) and `fact_value = actual_size × team.spPrice` (actual cost based on completed tasks). This ensures Value/Cost ratio equals 1.0 for these initiative types.
- **Date Synchronization:** Syncs `due_date` from Kaiten's `due_date` field and `done_date` from Kaiten's `last_moved_to_done_at` field for initiatives.

### Data Storage Solutions
PostgreSQL (via Neon) is the primary data store, with Drizzle ORM for type-safe queries.

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