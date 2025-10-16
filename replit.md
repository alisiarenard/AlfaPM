# Initiatives Timeline - Project Management Application

## Overview

This is a project management application designed to visualize and track team initiatives across sprint timelines. The application allows users to upload team data in JSON format and displays initiatives with their associated story points, sprint allocations, and status information in a clean, data-focused interface.

The application supports **multiple teams** in a single JSON array, with each team displayed in a separate tab for easy navigation between different team timelines.

The application follows a utility-first design philosophy inspired by Linear's minimalist aesthetics and Carbon Design's data visualization principles, prioritizing information density with clarity and scannable data presentation.

### Current Data Flow (October 16, 2025)
- **Initiative data**: Loaded from PostgreSQL database via `/api/initiatives/board/:initBoardId` endpoint
- **Team metadata**: Fetched from database via `/api/teams/:departmentId` endpoint  
- **Kaiten Integration**: Initiatives synced from Kaiten API (feature.kaiten.ru) to database
- **Data Source**: Database is the single source of truth (migrated from JSON files)
- **Sprint data**: Auto-generated from current date to end of year using sprintDuration (14 days)
- **Date handling**: start_date field not in DB schema - displays "—" for missing dates
- **Sprint display**: Empty sprints show "—" placeholder, no colored blocks for initiatives
- Active teams: "Каркас" (UUID: 898cfdfd-ff1a-4fc3-9f65-e9a473dce1af) and "Общие сервисы" (UUID: 622c81aa-0e45-49ea-b329-c7af1345fc93, init_board_id: 1532130)

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System:**
- React 18+ with TypeScript for type safety
- Vite as the build tool and development server
- Wouter for lightweight client-side routing
- React Query (TanStack Query) for server state management with infinite stale time and disabled refetching

**Layout & Responsive Design:**
- Main content container with responsive width:
  - Viewport < 1280px (xl breakpoint): max-width 1200px
  - Viewport >= 1280px (xl breakpoint): 80% of viewport width
- Container centered with `mx-auto`
- Applies to all states: empty state (upload form) and data state (timeline view)
- Timeline table: horizontal scroll within container when wider than container width
- Responsive: full width on narrow screens, centered with whitespace on wide screens
- Uses Tailwind classes: `max-w-[1200px] xl:max-w-none xl:w-4/5 mx-auto`

**UI Component System:**
- Shadcn/ui components built on Radix UI primitives
- Tailwind CSS for styling with custom design tokens
- CSS variables for theme switching (dark mode primary, light mode supported)
- Custom color palette defined in `index.css` with HSL values for backgrounds, borders, and semantic colors

**Design System:**
- Typography: Inter font family for general UI, JetBrains Mono for monospace data
- Custom border radius scale (lg: 9px, md: 6px, sm: 3px)
- Status color system: Active (green), Planned (blue), Completed (gray), At Risk (red/orange)
- Hover and active state elevation system using CSS variables (--elevate-1, --elevate-2)

**Key Components:**
- `HomePage`: Main page component that handles multi-team display with Tabs
  - Fetches department list via GET /api/departments
  - Loads team metadata via GET /api/teams/:departmentId
  - Fetches initiatives via GET /api/initiatives/board/:initBoardId
  - Renders Tabs UI for multi-team navigation
  - Each tab shows team name and contains TeamHeader + InitiativesTimeline
  - Maps database state (1-queued, 2-inProgress, 3-done) to UI status (planned, active, completed)
- `InitiativesTimeline`: Main visualization component showing initiatives mapped to sprint timelines with columns:
  - **Fixed columns** (sticky, remain visible during horizontal scroll):
    - Инициатива (Initiative name) - left: 0px, width: 220px
    - Дата начала (Start date) - left: 220px, width: 140px
    - Размер (Size) - left: 360px, width: 100px - total story points for initiative
    - Выполнено (Completed) - left: 460px, width: 100px - sum of all story points across all sprints
    - Вовлечённость (Involvement) - left: 560px, width: 120px - automatically calculated percentage of initiative's story points vs all story points in the initiative's time period
  - **Scrollable columns** (horizontal scroll):
    - Sprint columns with story points and colored status blocks (min-width: 140px each)
- `TeamHeader`: Displays team information, velocity metrics, and innovation rate
  - Shows team name and board ID
  - Displays Velocity metric
  - Displays Innovation Rate metric (percentage of Epic story points vs total story points)
- `StatusBadge`: Color-coded status indicators with icons
- `ThemeToggle`: Theme switching between light and dark modes

**Multi-Team Support:**
- Each department can have multiple teams stored in database
- Teams displayed in separate tabs using Shadcn Tabs component
- Tab labels show team names from database `team_name` field
- Users select department from dropdown, then switch between team tabs
- Each tab independently fetches and displays its own initiatives via init_board_id
- Each tab shows TeamHeader (velocity, innovation rate) + InitiativesTimeline

### Backend Architecture

**Server Framework:**
- Express.js with TypeScript
- ESM module system throughout
- Custom request/response logging middleware for API routes

**API Structure:**
- RESTful endpoints under `/api` prefix
- GET `/api/departments`: Retrieve list of departments
- GET `/api/teams/:departmentId`: Retrieve teams for a specific department
- GET `/api/initiatives`: Retrieve all initiatives
- GET `/api/initiatives/board/:initBoardId`: Retrieve initiatives for a specific board
- GET `/api/initiatives/:id`: Retrieve a specific initiative
- POST `/api/initiatives`: Create new initiative
- PATCH `/api/initiatives/:id`: Update initiative
- DELETE `/api/initiatives/:id`: Delete initiative

**Kaiten API Integration:**
- POST `/api/kaiten/sync-board/:boardId`: Sync initiatives from Kaiten board to database
- GET `/api/kaiten/test`: Test Kaiten API connection
- Requires environment variables: `KAITEN_API_KEY` and `KAITEN_DOMAIN`
- Uses undici for HTTP requests with proper domain normalization
- **Endpoint**: `/api/latest/boards/{id}` - fetches board data including cards array
- **Domain**: feature.kaiten.ru (configured via KAITEN_DOMAIN env variable)
- Automatically maps Kaiten card states to initiative states (1=queued, 2=inProgress, 3=done)
- Updates existing initiatives by card_id or creates new ones
- Successfully integrated and tested with board 1532130 ("Общие сервисы" team)

**Development Setup:**
- Vite middleware integration in development mode
- SSR template serving for production builds
- Custom error handling middleware
- Replit-specific plugins for development (cartographer, dev banner, runtime error overlay)

### Data Storage Solutions

**Current Implementation:**
- PostgreSQL database powered by Neon
- Drizzle ORM with Neon HTTP driver for type-safe database queries
- `DbStorage` class implements `IStorage` interface
- Data persists across app restarts and page refreshes
- Transactional writes ensure data integrity

**Database Schema:**
- `users` table: id (UUID), username, password - for future authentication
- `departments` table: id (UUID), department (varchar) - department names
- `teams` table: team_id (varchar/UUID), team_name, vilocity, sprint_duration, department_id (UUID), space_id, sprint_board_id, init_board_id, sp_price
- `initiatives` table: id (UUID), card_id (integer), title (varchar), state (ENUM: 1-queued, 2-inProgress, 3-done), condition (ENUM: 1-live, 2-archived), size (integer), init_board_id (integer)
- Schema defined in `shared/schema.ts` for type safety across client and server
- Migrations managed through `drizzle-kit` (use `npm run db:push`)

**Database Connection:**
- File: `server/db.ts`
- Driver: Neon HTTP driver (`drizzle-orm/neon-http`)
- Connection via `DATABASE_URL` environment variable
- Automatic schema binding for type-safe queries

**Storage Layer:**
- `DbStorage` class in `server/storage.ts`
- Methods:
  - `getDepartments()`: Returns list of departments
  - `getTeamsByDepartment(departmentId)`: Returns teams for a department
  - `getAllInitiatives()`: Returns all initiatives
  - `getInitiativesByBoardId(initBoardId)`: Returns initiatives for a specific board
  - `getInitiative(id)`: Returns a specific initiative
  - `createInitiative(initiative)`: Creates a new initiative
  - `updateInitiative(id, initiative)`: Updates an initiative
  - `deleteInitiative(id)`: Deletes an initiative
  - User management methods (getUser, getUserByUsername, createUser)
- All writes wrapped in transactions for data integrity

**Data Models:**
- `Team`: boardId, teamId (UUID), name, velocity, sprintDuration (optional, number of days per sprint)
- `Initiative`: id, name, status, type (optional, e.g., "Epic" or "Feature"), startDate, size, involvement, sprints array
- `Sprint`: sprintId, name, startDate, endDate, storyPoints
- `TeamRow`: Database model for teams table (team_id as UUID, team_name, vilocity, sprint_duration, department_id, etc.)
- `InitiativeRow`: Database model for initiatives table (id as UUID, card_id, title, state, condition, size, init_board_id)

**Investment Ratio (IR) Calculation:**
- Sprint headers display IR (Investment Ratio) as the percentage of Epic initiative story points vs. total sprint story points
- Formula: IR = (Epic story points / Total story points) × 100%
- Displayed in sprint header as second row below dates
- Shows "—" for sprints with no story points

**Sprint Header Format:**
- First row: Dates in dd.MM - dd.MM format (monospace font)
- Second row: IR percentage (bold)

**Innovation Rate Calculation:**
- Displayed in TeamHeader next to Velocity metric
- Formula: Innovation Rate = (Epic story points / Total story points) × 100%
- Shows percentage of Epic initiative story points vs all story points
- Rounds to nearest integer
- Shows "0%" when total story points = 0

**Involvement (Вовлечённость) Calculation:**
- Automatically calculated based on initiative's time period
- Period: from initiative start date to the end date of last sprint in initiative
- Formula: Involvement = (Initiative's story points / All story points in period) × 100%
- Includes ALL sprints in the period when calculating total, even if initiative has no points in some sprints
- Example: Initiative A has 100 points in Sprints 1&3, period is Sprint 1-3, total in period is 160 (including Sprint 2 from other initiatives) → Involvement = 63%

**Sprint Auto-Generation:**
- When `sprintDuration` is provided in team data, the system automatically generates sprint columns until the end of the current year
- **If no sprints exist in data**: Generates sprints from current date to Dec 31 with sequential naming ("Спринт 1", "Спринт 2", etc.)
- **If sprints exist in data**: Preserves existing sprints and fills gaps between them, continuing to year-end
- Sprint generation respects irregular sprint lengths and avoids overlaps
- The final partial sprint is included even if shorter than sprintDuration
- Generated sprints are named "Спринт N" where N continues from the maximum existing sprint number
- All generated sprints have storyPoints = 0 (empty by default)

### Authentication and Authorization

**Current State:**
- Basic user schema defined (username/password)
- No active authentication implementation
- User creation and retrieval methods available in storage layer
- Ready for session-based or token-based auth implementation

**Prepared Infrastructure:**
- Connect-pg-simple for PostgreSQL session storage (included in dependencies)
- Drizzle-zod for schema validation

### External Dependencies

**Database:**
- Neon HTTP driver (`@neondatabase/serverless` with `drizzle-orm/neon-http`)
- Drizzle ORM for type-safe database queries
- Connection configured via `DATABASE_URL` environment variable
- JSONB storage for flexible team data structure

**UI Libraries:**
- Radix UI component primitives (accordion, alert-dialog, avatar, checkbox, dialog, dropdown-menu, popover, select, tabs, toast, tooltip, and others)
- Lucide React for icons
- Embla Carousel for carousel functionality
- date-fns for date formatting and manipulation

**Utilities:**
- class-variance-authority (CVA) for component variant management
- clsx and tailwind-merge for className composition
- cmdk for command menu functionality
- React Hook Form with resolvers for form management

**Build Tools:**
- esbuild for server bundle production builds
- PostCSS with Tailwind CSS and Autoprefixer
- TypeScript with strict mode enabled

**Development Tools:**
- Replit-specific Vite plugins (cartographer, dev banner, runtime error modal)
- tsx for running TypeScript server in development
- Custom Vite configuration with path aliases (@, @shared, @assets)