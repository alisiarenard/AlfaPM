# Design Guidelines for Initiatives Timeline Application

## Design Approach: Design System-Based (Linear + Carbon Design Hybrid)

**Justification**: This is a utility-focused, data-heavy application requiring clarity and efficiency. Drawing inspiration from Linear's minimalist aesthetics and Carbon Design's data visualization principles for optimal information display.

**Key Design Principles**:
- Information density with breathing room
- Scannable data presentation
- Clear visual hierarchy
- Professional, distraction-free interface

---

## Core Design Elements

### A. Color Palette

**Dark Mode (Primary)**:
- Background: 220 15% 12% (main canvas)
- Surface: 220 15% 16% (cards, table rows)
- Border: 220 10% 25% (subtle dividers)
- Text Primary: 220 10% 95%
- Text Secondary: 220 8% 65%
- Primary Action: 215 80% 60% (interactive elements)
- Status Colors:
  - Active/In Progress: 142 76% 45%
  - Planned: 215 80% 60%
  - Completed: 220 8% 55%
  - At Risk: 25 95% 55%

**Light Mode**:
- Background: 220 15% 98%
- Surface: 0 0% 100%
- Border: 220 10% 88%
- Text Primary: 220 15% 15%
- Text Secondary: 220 8% 45%
- Primary Action: 215 85% 55%

### B. Typography

**Font Families** (via Google Fonts CDN):
- Primary: 'Inter' (system fallback: -apple-system, BlinkMacSystemFont, "Segoe UI")
- Monospace: 'JetBrains Mono' for dates and numeric values

**Type Scale**:
- Table Headers: 13px, font-weight 600, letter-spacing 0.02em, uppercase
- Initiative Names: 15px, font-weight 500
- Data Values: 14px, font-weight 400
- Sprint Names: 13px, font-weight 500
- Story Points: 16px, font-weight 600, monospace

### C. Layout System

**Spacing Primitives**: Use Tailwind units of 1, 2, 3, 4, 6, 8, 12
- Table padding: p-4
- Cell padding: px-4 py-3
- Section margins: mb-6, mb-8
- Header spacing: mb-4

**Container Structure**:
- Max width: max-w-full (allow horizontal scroll)
- Main padding: p-6 md:p-8
- Table container: overflow-x-auto with fixed left columns

### D. Component Library

**Table Structure**:
- Sticky first column (Initiative name) with min-width: 200px
- Fixed-width columns for metadata: Date (120px), Size (100px)
- Dynamic sprint columns: min-width 100px each
- Alternating row backgrounds for scanability
- Hover state: subtle background lift on row hover
- Border: thin borders (1px) between columns

**Data Display Elements**:
- Status Badges: Small pills (px-2 py-1, rounded-full) with status-specific colors
- Story Points Display: Prominent numeric display in sprint cells, centered
- Sprint Headers: Sticky header row with sprint names, gradient fade at scroll edges
- Date Format: Localized format (DD.MM.YYYY) in monospace font

**Interactive Elements**:
- Table rows: cursor-pointer with hover state (bg-opacity-50)
- Sort indicators: Heroicons chevron-up/down on headers
- Responsive scroll: Custom scrollbar styling (thin, low-opacity)

**Navigation & Controls**:
- Top bar: Team selector, filters (status, date range)
- View controls: Toggle between compact/comfortable density
- Export button: Secondary style (outline)

### E. Visual Enhancements

**Micro-interactions** (minimal):
- Smooth row hover transitions: 150ms ease
- Status badge pulse for "Active" status (subtle)
- Sprint cell highlight on hover: border accent

**Visual Hierarchy**:
- Initiative names: Bolder, slightly larger
- Story points: Visually prominent with color accent
- Sprint columns: Lighter background to separate from metadata
- Use divider lines sparingly (only between major sections)

**Icons**: Heroicons (CDN) for:
- Status indicators (check-circle, clock, alert-triangle)
- Team/board icons
- Filter and control buttons

---

## Layout Specifications

**Table Layout**:
```
[Team Header - full width, sticky top]
[Filters & Controls - horizontal layout]

[Table Structure]
┌─────────────────┬─────────┬──────┬─────────┬─────────┬─────────┐
│ Initiative Name │ Date    │ Size │ Sprint1 │ Sprint2 │ Sprint3 │
│ (sticky)        │         │      │  (pts)  │  (pts)  │  (pts)  │
├─────────────────┼─────────┼──────┼─────────┼─────────┼─────────┤
│ Initiative A    │ 01.01   │ XL   │   21    │   18    │   15    │
└─────────────────┴─────────┴──────┴─────────┴─────────┴─────────┘
```

**Responsive Behavior**:
- Desktop: Full table with horizontal scroll for many sprints
- Tablet: Maintain table, reduce padding (p-3 instead of p-4)
- Mobile: Card-based layout - stack initiative details, collapsible sprint timeline

---

## Accessibility & UX

- High contrast ratios (WCAG AAA for text)
- Keyboard navigation: arrow keys to navigate cells
- Focus indicators: 2px accent border on focused cells
- Screen reader: Proper table semantics with scope attributes
- Loading states: Skeleton loaders matching table structure
- Empty states: Centered message with icon when no data

**Critical Constraints**:
- No hero sections or marketing elements
- Minimal animations - focus on data clarity
- Consistent table spacing and alignment
- Professional productivity tool aesthetic
- Support for Cyrillic text (Russian language)