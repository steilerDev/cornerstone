# cornerstone - A Home Building Project Management Application - Requirements Document

## 1. Project Overview

### Purpose
A web-based project management application designed to help homeowners manage their home building project, tracking work items, budget (including multiple financing sources and subsidies), timelines, and household item purchases.

### Target Users
- Primary users: One to many homeowners (project owners)

### Key Features
- Work item management with Gantt chart visualization and automatic rescheduling based on work item dependencies
- Household item and furniture purchase tracking
- Multi-source budget tracking with subsidy programs
- Document integration via Paperless-ngx
- OIDC-based authentication with automatic user provisioning

---

## 2. Functional Requirements

### 2.1 Work Items Management

#### Core Properties
- **Identification**: Unique ID, title, description
- **Status**: Not Started, In Progress, Completed, Blocked
- **Scheduling**:
  - Start date and end date
  - Duration (calculated or manual)
  - "Start after" date (earliest possible start - constraint)
  - "Start before" date (latest possible start - constraint)
- **Budget**:
  - Assigned budget amount
  - Actual cost tracking
  - Confidence calculation for estimating work item cost
  - Link to budget categories
  - Link to vendors/contractors
  - Associated subsidies
- **Dependencies**: Predecessor/successor relationships for Gantt chart
- **Tags**: Custom labels for organization
- **Timestamps**: Created at, updated at

#### Additional Features
- Notes
- Document links (references to Paperless-ngx documents)
- Subtasks/checklist items

### 2.2 Budget Management

#### Category-Based Budgeting
- Pre-defined categories (Materials, Labor, Permits, Design, etc.)
- Planned vs actual cost tracking per category
- Budget variance alerts

#### Vendor/Contractor Tracking
- Vendor database (name, contact info, specialty)
- Payment history per vendor
- Invoice tracking
- Payment status (Pending, Paid, Overdue)
- Outstanding balance calculations

#### Budget Sources (Creditors)
- Multiple financing sources (bank loans, credit lines, savings, etc.)
- Total amount per source
- Used amount tracking
- Available amount calculation
- Interest rates and terms
- Payment schedules to creditors
- Notes per source

#### Subsidy Programs
- Program database (name, description, eligibility)
- Reduction type (percentage or fixed amount)
- Reduction value
- Application status tracking (Eligible, Applied, Approved, Received)
- Application deadline tracking
- Applicable categories
- Apply to work items or household items
- Automatic cost reduction calculations
- Documenting and tracking of subsidy requirements

#### Document Integration (Paperless-ngx)
- Link to documents stored in Paperless-ngx
- Reference Paperless-ngx document IDs
- Display documents inline via Paperless-ngx API
- Leverage Paperless-ngx tagging system
- No local document storage

### 2.3 Household Items & Furniture

#### Item Management
- Item name and description
- Category (furniture, appliances, fixtures, decor, etc.)
- Cost (planned and actual)
- Vendor/supplier
- Purchase status (Not Ordered, Ordered, In Transit, Delivered)
- Order date
- Expected delivery date
- Actual delivery date
- Delivery location/room
- Notes and specifications
- Tags for organization

#### Budget Integration
- Items have their own budget tracking
- Contribute to overall project budget
- Can be assigned to budget categories
- Link to budget sources (creditors)
- Support for subsidy programs (e.g., energy-efficient appliance rebates)

#### Timeline Integration
- Delivery dates shown on timeline/calendar
- Can be linked to work items (e.g., "Install kitchen cabinets" depends on cabinet delivery)
- Visual distinction from work items on timeline

#### Document Links (Paperless-ngx)
- Link to receipts in Paperless-ngx
- Link to invoices in Paperless-ngx
- Link to warranty documents in Paperless-ngx
- Link to product photos and manuals in Paperless-ngx
- Display linked documents inline

### 2.4 Timeline & Gantt Chart

#### Gantt Chart Visualization
- Visual timeline of all work items
- Task bars showing duration
- Dependency arrows (Finish-to-Start, Start-to-Start, etc.)
- Critical path highlighting
- Today marker
- Milestone markers
- Household item delivery dates (visually distinct)

#### Dependency Management
- Define task dependencies
- Automatic scheduling based on dependencies
- Conflict detection (circular dependencies)
- Cascade updates when dates change

#### Milestones
- Major project milestones
- Milestone dates
- Milestone completion tracking

#### Views
- Gantt chart view
- Calendar view
- List view

### 2.5 User Management & Collaboration

#### User Management
- Support arbitrary number of users
- User roles (Admin, Member)
- Local Authentication for Admin user (used for initial setup) - ability to disable local authentication
- OIDC authentication (OpenID Connect)
- Automatic user creation on first login
- User profiles (name, email, role, avatar)

#### Access Control
- **Admin**: Full access (create, edit, delete, manage users)
- **Member**: Create and edit work items, budget, comments

---

### 2.6 Reporting

## 3. Non-Functional Requirements

### 3.1 Data Storage
- SQLite Database

### 3.2  Paperless-ngx Integration
- Store Paperless-ngx API endpoint in config.json
- Store API authentication token
- Work items and household items reference Paperless-ngx document IDs
- Fetch document metadata and thumbnails via Paperless-ngx API
- Use Paperless-ngx's tagging for organization

### 3.2 Technical Requirements

#### Platform
- Web application (browser-based)
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Responsive design (desktop and tablet support, mobile-friendly)
- Fast load times (<2s)
- Smooth Gantt chart interactions

#### Hosting
- This application is primarily meant for self-hosting this on a per-project level - multi-project support is not necessary
- This application does not need to scale - each instance is expected to be used by less than 5 people
- This applicaiton should be deployed through a Docker container
- Try to keep the architecture and dependecies as simple as possible. 

### 3.3 Security & Privacy

#### Authentication
- **OIDC (OpenID Connect)** as primary authentication
- Supports standard OIDC providers (Keycloak, Auth0, Okta, Google, Azure AD, etc.)
- Automatic user provisioning on first successful login
- Session management
- Optional local authentication for admin user as initial setup and fallback

#### Data Security
- HTTPS should be handled by upstream proxy
- Additional encryption is not neccessary

### 3.4 Usability

- Intuitive interface
- Minimal learning curve
- Drag-and-drop for Gantt chart
- Keyboard shortcuts for power users
- Touch friendly interface on mobile devices

---

## 4. User Stories

### Authentication & User Management
- As a user, I want to login with my existing OIDC account so I don't need to create new credentials
- As a user, after login, I want to be able to read and edit the current project

### Work Items
- As a homeowner, I want to create work items with start/end dates so I can plan the construction timeline
- As a homeowner, I want to set dependencies between tasks so I can ensure work happens in the right order
- As a homeowner, I want to see "start after" and "start before" constraints so I can respect vendor availability and weather constraints
- As a homeowner, I want to assign work items to any registered user so we know who is responsible
- As a homeowner, I want to link Paperless-ngx documents to work items so I can view related receipts and contracts

### Budget
- As a homeowner, I want to track my budget by category so I can see where money is being spent
- As a homeowner, I want to track multiple financing sources so I know which creditor is funding which work
- As a homeowner, I want to apply subsidy programs to work items so I can see the reduced actual cost
- As a homeowner, I want to track payments to vendors so I know what's been paid and what's outstanding
- As a homeowner, I want to link invoices and receipts from Paperless-ngx so I can view proof of payment
- As a homeowner, I want to see planned vs actual costs so I can identify budget overruns early
- As a homeowner, I want to export documents for reporting to the bank. This includes full statements for a given budget and timeframe as well as the relevant invoices or offers.

### Household Items & Furniture
- As a homeowner, I want to track furniture and appliance purchases so I can manage my total project budget
- As a homeowner, I want to record expected delivery dates so I can plan installation work accordingly
- As a homeowner, I want to link furniture deliveries to work items so I know when installation can happen
- As a homeowner, I want to link purchase receipts and warranties from Paperless-ngx so I can view all documents
- As a homeowner, I want to see delivery dates on the timeline so I can coordinate with work schedules

### Timeline
- As a homeowner, I want to see a Gantt chart of all work items so I can visualize the project timeline
- As a homeowner, I want to see household item delivery dates on the timeline so I can coordinate installations
- As a homeowner, I want to drag tasks in the Gantt chart to adjust dates quickly
- As a homeowner, I want to see the critical path so I know which tasks cannot be delayed
- As a homeowner, I want to see milestones on the timeline so I can track major progress points
- As a homeowner, I want automatic rescheduling when a task is delayed so I can see the impact on dependent tasks

---

## 5. Summary

### Key Decisions
1. **Storage**: SQLite database (no database, no import/export features at this time)
2. **Authentication**: OIDC (OpenID Connect) with automatic user provisioning, local admin user as optional fallback / initial setup
3. **Documents**: Integration with Paperless-ngx (no built-in document storage)
4. **Users**: Support arbitrary number, no specific roles required
5. **Core Entities**:
   - **Work Items**: Tasks with dependencies, scheduling constraints, budget
   - **Household Items**: Furniture/appliances with delivery dates, budget impact (NOT work items)
   - **Budget**: Categories, vendors, creditors (multiple financing sources), subsidies
6. **Timeline**: Gantt chart showing both work items and household item delivery dates

### Focus
- Usability and simplicity
- Simple and efficient tech steck
- Well tested
- Secure authentication
- Integration with existing tools (OIDC providers, Paperless-ngx)
