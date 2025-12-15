# Initiatives Timeline - Project Management Application

## Overview
This project is a web-based application designed to visualize and track team initiatives across sprint timelines. It enables users to upload team data, displaying initiatives with story points, sprint allocations, and status. The application supports multiple teams via separate tabs and aims to provide a clear, scannable overview of project progress and team allocation, streamlining project management and enhancing team visibility for efficient, data-driven tracking. The business vision is to improve project management efficiency and provide data-driven insights into team progress and resource allocation.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with React 18+ and TypeScript, utilizing Vite for tooling, Wouter for routing, and React Query for server state management.

**UI/UX Decisions:**
- **Layout:** Responsive, centered layout with horizontal scrolling for timeline tables.
- **Component System:** Shadcn/ui components (Radix UI base) styled with Tailwind CSS, custom design tokens, and CSS variables for theming (dark mode primary).
- **Design System:** Inter font for UI, JetBrains Mono for code. Custom border radius, status color system (Active, Planned, Completed, At Risk), and elevation system for hover/active states.

**Technical Implementations:**
- **Multi-Team Support:** Departments and teams are managed via Shadcn Tabs, with independent data fetching.
- **URL-Based Filter State:** Complete bidirectional synchronization between URL parameters and filter state, enabling shareable links and browser history navigation.
- **Excel Report Download:** Generates client-side Excel files with "Cost Structure" and "Initiatives" sheets.
- **AI-Powered Sprint PDF Reports:** Generates downloadable PDF reports for sprints with AI-processed task summaries. Optimized with batched AI requests and graceful fallback. AI configuration is flexible via .env file, supporting OpenAI, Azure OpenAI, and compatible APIs.
- **Metrics Card:** Displays Innovation Rate and Value/Cost metrics with smooth loading transitions.
- **Initiatives Timeline:** Core visualization with sticky columns and scrollable sprint columns, status icons, completion indicators, forecasted color blocks, and editable planned involvement.
- **Initiative Details Modal:** Displays initiative details, progress bars, and allows inline editing for "Epic" type initiatives. Value calculations are automated for Compliance and Enabler types.
- **Sprint Tasks Modal:** Shows tasks for a given sprint with clickable links to Kaiten cards.
- **Team Management:** Full CRUD operations for teams and departments with Kaiten board validation, including atomic deletion of teams and associated data.
- **Initiative Filtering:** Server-side filtering via `filterInitiativesForTimeline()` in `server/routes.ts`. Filters based on status, year, and completion for Epic, Compliance, Enabler, and "Поддержка бизнеса" initiatives. Frontend passes `year` and `showActiveOnly` query parameters to the timeline API. Excel report filtering is also server-side via `forReport=true` parameter on `/api/initiatives/board` endpoint.
- **Calculations:** Dynamically calculates Innovation Rate, Value/Cost, Cost Structure, Involvement, Forecasted Sprint Count, and automatically generates sprints.

### Backend Architecture
The backend is an Express.js application with TypeScript and ESM, providing a RESTful API under `/api`.

**System Design Choices:**
- **API Endpoints:** Standard CRUD endpoints for departments, teams, initiatives, and tasks. Specific endpoints for timeline data with server-side filtering, sprint saving, metrics calculation (Innovation Rate, Cost Structure, Value/Cost from done tasks only), sprint information, Kaiten synchronization, and PDF report generation.
- **Kaiten Integration:** Intelligent all-in-one synchronization for initiatives and tasks, including automatic sprint detection, archiving logic, parent chain validation for initiative types, and optimized API calls. Handles new sprints, updates existing ones, and manages sprintless teams. Synchronizes custom fields and calculates planned/actual values. Automatic synchronization on team creation.
- **Data Storage:** PostgreSQL (via Neon) is the primary data store, managed with Drizzle ORM.
    - **Database Schema:** Includes tables for `users`, `departments`, `teams`, `initiatives`, `tasks`, and `sprints`. Migrations are managed by Drizzle-kit.

**Configuration:**
- **Kaiten Configuration:** Kaiten domain and custom field IDs are configured via environment variables (`KAITEN_DOMAIN`, `VITE_KAITEN_DOMAIN`, `KAITEN_API_KEY`).
- **AI Configuration:** AI model, API key, and base URL are configurable via environment variables (`OPENAI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`), allowing integration with various OpenAI-compatible APIs.

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
- `openai` (for AI task summarization)
- `pdfkit` (PDF generation)