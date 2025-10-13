# Initiatives Timeline - Project Management Application

## Overview

This is a project management application designed to visualize and track team initiatives across sprint timelines. The application allows users to upload team data in JSON format and displays initiatives with their associated story points, sprint allocations, and status information in a clean, data-focused interface.

The application follows a utility-first design philosophy inspired by Linear's minimalist aesthetics and Carbon Design's data visualization principles, prioritizing information density with clarity and scannable data presentation.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System:**
- React 18+ with TypeScript for type safety
- Vite as the build tool and development server
- Wouter for lightweight client-side routing
- React Query (TanStack Query) for server state management with infinite stale time and disabled refetching

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
- `InitiativesTimeline`: Main visualization component showing initiatives mapped to sprint timelines
- `TeamHeader`: Displays team information and velocity metrics
- `StatusBadge`: Color-coded status indicators with icons
- `ThemeToggle`: Theme switching between light and dark modes

### Backend Architecture

**Server Framework:**
- Express.js with TypeScript
- ESM module system throughout
- Custom request/response logging middleware for API routes

**API Structure:**
- RESTful endpoints under `/api` prefix
- POST `/api/team-data`: Upload and validate team initiative data
- GET `/api/team-data`: Retrieve stored team data
- Zod schema validation for incoming data

**Development Setup:**
- Vite middleware integration in development mode
- SSR template serving for production builds
- Custom error handling middleware
- Replit-specific plugins for development (cartographer, dev banner, runtime error overlay)

### Data Storage Solutions

**Current Implementation:**
- In-memory storage using `MemStorage` class
- Data stored in Maps and arrays for quick access
- No persistent database currently configured

**Database Schema (Prepared):**
- Drizzle ORM configured for PostgreSQL
- User table with UUID primary keys, username, and password fields
- Schema defined in `shared/schema.ts` for type safety across client and server
- Migration support configured with `drizzle-kit`

**Data Models:**
- `Team`: boardId, teamId, name, velocity, sprintDuration (optional, number of days per sprint)
- `Initiative`: id, name, status, startDate, size, involvement, sprints array
- `Sprint`: sprintId, name, startDate, endDate, storyPoints

**Sprint Auto-Generation:**
- When `sprintDuration` is provided in team data, the system automatically generates sprint columns until the end of the current year
- Existing sprints from data are always preserved
- Generated sprints fill gaps between existing sprints and after the last sprint up to December 31
- Sprint generation respects irregular sprint lengths and avoids overlaps
- The final partial sprint is included even if shorter than sprintDuration
- Generated sprints are named "Спринт N" where N continues from the maximum existing sprint number

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
- Neon Serverless PostgreSQL driver (`@neondatabase/serverless`)
- Drizzle ORM for type-safe database queries
- Connection configured via `DATABASE_URL` environment variable

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