# Design Guidelines: Multi-Tenant Animal Rescue Portal

## Design Approach

**Selected Framework:** Hybrid Design System Approach  
**Primary Inspiration:** Linear (clean data presentation) + Notion (flexible content) + Asana (workflow management)  
**Rationale:** This is a mission-critical productivity tool for rescue organizations. The design must prioritize clarity, efficiency, and emotional connection while handling complex data workflows.

## Core Design Principles

1. **Compassionate Professionalism** - Balance operational efficiency with the emotional nature of animal rescue
2. **Role-Aware Clarity** - Interface adapts to user roles without overwhelming any user type
3. **Data Transparency** - Financial and operational data presented with absolute clarity
4. **Trust Through Design** - Public-facing pages build donor confidence through polished presentation

---

## Typography System

**Font Stack:**
- **Primary:** Inter (via Google Fonts CDN) - for UI, forms, data tables
- **Display:** Outfit (via Google Fonts CDN) - for headings, hero text on public pages

**Type Scale:**
- Hero/Display: 3xl to 5xl (public pages only)
- H1: 2xl, font-semibold
- H2: xl, font-semibold  
- H3: lg, font-medium
- Body: base, font-normal
- Small/Meta: sm, font-normal
- Micro/Labels: xs, font-medium, uppercase tracking-wide

**Line Heights:**
- Headings: leading-tight
- Body text: leading-relaxed
- Data tables: leading-snug

---

## Layout & Spacing System

**Tailwind Spacing Primitives:** Use units of 2, 4, 6, 8, 12, 16, 20, 24 consistently

**Container Strategy:**
- Public pages: max-w-7xl mx-auto px-6
- Dashboard content: max-w-full px-6 lg:px-8
- Forms: max-w-2xl
- Data tables: Full width with horizontal scroll

**Responsive Breakpoints:**
- Mobile-first approach
- Dashboard sidebar collapses to hamburger on mobile
- Tables scroll horizontally on mobile with sticky first column

---

## Component Library

### Navigation Components

**Public Site Header:**
- Fixed top navigation, backdrop-blur effect when scrolled
- Logo left, "Login" and "Donate" buttons right
- Mobile: Hamburger menu overlay

**Dashboard Sidebar:**
- Persistent left sidebar (desktop), collapsible with toggle
- Role-based menu items with icon + label
- Active state: subtle background treatment, border accent
- Nested items for modules (expandable sections)
- User profile card at bottom with role badge

**Breadcrumbs:**
- Show location in deep navigation (Dashboard > Animals > Buddy > Medical Records)
- Minimal, subtle separators (chevrons)

### Data Display Components

**Animal Cards (Public):**
- Image aspect ratio: 4:3
- Card structure: Image top, name/breed/age below, "Learn More" button
- Grid: 1 column mobile, 2 tablet, 3 desktop (grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
- Hover: Subtle lift effect (transform translate-y-1)

**Data Tables:**
- Zebra striping for rows
- Sticky header row on scroll
- Column headers: uppercase, xs, font-semibold, tracking-wide
- Row height: py-3 for comfortable scanning
- Action buttons in final column (icon-only with tooltips)
- Pagination controls below table

**Kanban Board (Applications):**
- Horizontal scrollable columns on mobile, grid on desktop
- Column header shows count badge
- Cards within columns: compact, draggable, show key info only
- Status indicators via left border accent
- Internal notes section (expandable)

**Statistics Cards (Dashboard):**
- Grid: 2x2 mobile, 4 columns desktop
- Each card: Large number display, label, trend indicator (↑↓)
- Minimal borders, generous internal padding (p-6)

**Finance Tables:**
- Separate tabs for Donations vs Expenditures
- Sortable columns (click header)
- Running total row at bottom (sticky)
- Export to CSV button in header

### Form Components

**Form Fields:**
- Consistent height: h-10 for inputs, h-24 for textarea
- Labels: Above field, text-sm font-medium, mb-1
- Placeholder text: Helpful examples
- Error state: Red border, error message text-sm below
- Required indicator: Red asterisk after label

**File Upload:**
- Drag-and-drop zone with dashed border
- Shows preview thumbnails for images
- Progress bar during upload
- CSV upload shows parsing preview before submission

**Multi-Step Forms (Signup):**
- Progress indicator at top (step 1 of 4)
- Previous/Next buttons, "Save & Continue Later" option
- Form validation inline and on submit

**Donation Form (Public):**
- Preset amount buttons ($25, $50, $100, Custom)
- Selected state clearly indicated
- Payment fields below, secure badge icon
- "Sponsor a Pet" shows animal photo inline

### Interactive Components

**Modal Dialogs:**
- Overlay with backdrop blur
- Max width: max-w-lg for simple, max-w-4xl for complex
- Header with title + close button
- Footer with action buttons (Cancel left, Primary right)

**Toast Notifications:**
- Fixed bottom-right position
- Auto-dismiss after 4s (closeable)
- Success, error, info variants
- Icon + message + close button

**Volunteer Calendar:**
- Month view default, week view option
- Time slots show as blocks on grid
- Open slots: dashed border, "Sign Up" on hover
- Filled slots: show volunteer name
- Filter by task type (Transport, Event, etc.)

**Filter/Search Bar:**
- Sticky at top of lists
- Inline search input with icon
- Dropdown filters for status, date range
- Active filter chips below (dismissible)

---

## Page-Specific Layouts

### Public Homepage (`[subdomain].myrescueportal.com`)

**Hero Section:**
- Full-width, height: 60vh
- Background: Large hero image of rescue animals (happy, high-quality photo)
- Overlay: Semi-transparent gradient for text readability
- Content: Rescue logo, tagline, dual CTAs ("Meet Our Pets" + "Donate Now")
- Buttons: Blurred background treatment for readability

**Available Animals Section:**
- Container: max-w-7xl, py-20
- Section header: "Available for Adoption" with filter controls
- Grid of animal cards (3 columns desktop)

**Impact Stats:**
- 3-4 stat cards in row (Animals Rescued This Year, Success Rate, etc.)
- Background treatment to separate from animals section
- py-16 section padding

**Footer:**
- Multi-column layout (About, Contact, Quick Links, Social)
- Newsletter signup inline
- 501(c)(3) statement if applicable

### Dashboard Home

**Layout:**
- Sidebar left (16rem width desktop)
- Main content area: Full remaining width
- Top bar: Breadcrumbs left, user menu right

**Content:**
- Welcome message with user name
- Role-specific quick stats grid
- Recent activity feed (3 most recent items)
- Quick action buttons for common tasks

### Animal Detail Page (Dashboard)

**Two-Column Layout:**
- Left (60%): Image gallery, bio, status timeline
- Right (40%): Key stats sidebar (age, breed, medical status)

**Tabbed Sections Below:**
- Medical Records (table + upload)
- Applications (mini kanban)
- Foster Info (if applicable)

### Finance Module

**Tab Navigation:**
- Donations | Expenditures | Reports | Import

**Import Section:**
- QuickBooks upload: Large drag-drop zone
- Preview table shows parsed data before confirmation
- Manual entry forms below import section

### Application Kanban

**Full-width board:**
- Columns: New, Screening, Vet Check, Home Visit, Approved, Denied
- Each column scrolls independently
- Drag-and-drop between columns
- Card click opens detail modal

---

## Animation Guidelines

**Minimal, Purposeful Motion:**
- Page transitions: None (instant navigation)
- Modal open/close: 150ms fade + scale
- Toast notifications: Slide in from right, 200ms
- Drag-and-drop: Smooth follow cursor, drop shadow during drag
- Hover states: 100ms transition on transform/opacity only
- NO scroll-triggered animations
- NO auto-playing carousels

---

## Images Section

**Hero Image (Public Homepage):**
- Placement: Full-width hero section background
- Description: Professional photo showing 2-3 happy rescued animals with adopters or in care, natural lighting, candid moment conveying warmth and hope
- Treatment: 50% opacity gradient overlay (dark) for text legibility

**Animal Photos (Throughout):**
- Placement: Card thumbnails, detail page galleries, application cards
- Description: Clear, well-lit photos of individual animals, ideally multiple angles
- Treatment: Aspect ratio 4:3, object-fit-cover, rounded corners (rounded-lg)

**Success Stories (Happy Tails):**
- Placement: Optional public page section
- Description: Before/after photo pairs or adopted animals in new homes
- Treatment: Side-by-side layout or slider

**Placeholder Strategy:**
- Use https://placehold.co/{width}x{height} during development
- All image containers must have defined aspect ratios to prevent layout shift

---

## Accessibility Requirements

- All interactive elements minimum 44x44px touch target
- Form labels properly associated with inputs
- Keyboard navigation through all interactive elements (visible focus states)
- Sufficient contrast ratios for all text (maintain WCAG AA minimum)
- Proper heading hierarchy (no skipped levels)
- Table headers with scope attributes
- ARIA labels for icon-only buttons
- Screen reader text for status indicators