# MASTER PROJECT PROMPT
# NIGMASIM
## Application Simulation, Interactive Product Demo & Documentation Platform

**Project Owner:** PT Nigmagrid Indo Nesia  
**Product Name:** NigmaSim  
**Product Category:** Application Simulation & Interactive Demo Platform  
**Architecture:** Standalone Web Application

---

# 1. PROJECT OVERVIEW

Develop a standalone web-based platform named NigmaSim.

NigmaSim is designed to capture, analyze, reconstruct, simulate, and document existing web applications.

The primary objective is to transform an existing production web application into a fully functional, independent simulation application using reconstructed HTML, CSS, JavaScript, and React components.

The resulting simulation must reproduce the original application's visual appearance, navigation, forms, tables, buttons, dashboards, and business workflows as accurately as reasonably possible.

The simulation must operate independently without accessing the original application's production database, API, backend, or session.

NigmaSim will be used for:

1. Software product marketing.
2. Interactive product demonstrations.
3. Sales and presales presentations.
4. Client demonstrations.
5. User training and onboarding.
6. Application workflow demonstrations.
7. Standard Operating Procedure (SOP) generation.
8. User manual generation.
9. Software documentation.

NigmaSim must support multiple applications, not just one application.

It must be developed as a reusable simulation engine.

# 2. CORE CONCEPT

NigmaSim must provide a complete workflow:

Original Application → Browser Capture → UI Analysis → HTML/React Reconstruction → Dummy Data Generation → Workflow Simulation → Interactive Demo → Documentation.

The platform must prioritize Full Simulation rather than screenshot-only prototypes.

There must be two simulation modes:

### Mode A: Screenshot-Based Simulation

- Display captured screenshots.
- Create clickable hotspots.
- Connect screens.
- Simulate basic navigation.
- Display popup and modal overlays.

### Mode B: Full HTML/React Simulation

This is the primary mode.

- Reconstruct application layouts.
- Recreate navigation menus.
- Recreate dashboards.
- Recreate tables.
- Recreate forms.
- Recreate modal dialogs.
- Recreate dropdowns.
- Recreate tabs.
- Simulate CRUD operations.
- Simulate approval workflows.
- Use dummy data.
- Support interactive user actions.

Administrators can select the appropriate mode for each application.

# 3. TECHNOLOGY STACK

Use the following recommended technology stack:

### Frontend
- React
- TypeScript
- Tailwind CSS
- Responsive design
- Component-based architecture

### Backend
- Python
- FastAPI
- REST API

### Browser Automation
- Playwright
- Chromium

### Database
- SQLite for initial development
- Design database architecture for future PostgreSQL migration.

### Simulation Storage
- JSON datasets
- IndexedDB for client-side simulation state
- Local filesystem for screenshots and assets

### Documentation
- PDF generation
- HTML export
- Markdown export

### Deployment
- Docker
- Docker Compose
- Nginx reverse proxy
- Linux/Ubuntu server support

All technology choices must be modular and maintainable.

# 4. SYSTEM MODULES

## MODULE A: APPLICATION REGISTRY

Create an application management module.

Administrators can register multiple web applications.

Application fields:

- Application ID
- Application Name
- Application Description
- Application URL
- Login URL
- Application Category
- Application Logo
- Application Version
- Application Owner
- Capture Profile
- Simulation Status
- Created Date

Features:

- Add application.
- Edit application.
- Delete application.
- View application details.
- Manage capture sessions.
- Manage simulation versions.
- Publish or unpublish simulations.

Each registered application must have its own independent capture and simulation repository.

## MODULE B: BROWSER CAPTURE STUDIO

Develop a Playwright-based browser automation engine.

Purpose:

Capture the original application interface without modifying its source code.

Features:

1. Launch isolated Chromium browser.
2. Open the configured application URL.
3. Allow manual login by authorized users.
4. Support manual navigation.
5. Capture screenshots.
6. Capture full-page screenshots.
7. Record page URL.
8. Record page title.
9. Record navigation events.
10. Record user clicks.
11. Record visible menus.
12. Record modal dialogs.
13. Record form interactions.
14. Record tab switching.
15. Capture before-and-after interaction states.
16. Save capture metadata.
17. Support pause, resume, and stop.
18. Support manual screenshot capture.
19. Support automatic capture after navigation.

Capture information must include:

- Screen ID
- Application ID
- Page Title
- Page URL
- Screenshot Path
- Capture Timestamp
- Viewport Size
- Element Metadata
- Interaction History

Provide a browser recording interface with Start Recording, Pause, Resume, Stop, and Save Capture buttons.

Security requirements:

- Do not bypass authentication.
- Do not bypass CAPTCHA or MFA.
- Do not extract credentials.
- Do not execute destructive actions without explicit approval.
- Do not modify production data during capture.
- Mask sensitive information before saving or publishing screenshots.

## MODULE C: SCREEN REPOSITORY

Create a central repository for captured application screens.

Features:

- Display screenshots in gallery format.
- Display screen metadata.
- Search screens.
- Filter by application.
- Group screens by module.
- Rename screens.
- Delete screens.
- Compare screen versions.
- Preview captured pages.
- Manage screen categories.

Support screen grouping, for example:

Application: NigmaRisk

- Dashboard
- Project Risk
- Risk Assessment
- Risk Monitoring
- Reporting
- Master Data
- User Management

## MODULE D: UI ANALYSIS & RECONSTRUCTION ENGINE

This is one of the most important modules.

Develop an engine that assists in reconstructing the original application interface into React components.

The engine should analyze:

1. Captured screenshots.
2. Page metadata.
3. Navigation structure.
4. DOM metadata when available.
5. Recorded user interactions.
6. Form field information.
7. Table structures.
8. Visible button labels.
9. Application layout.
10. Available workflow information.

Use a vision-capable AI model to assist with visual analysis and component reconstruction.

AI should help identify:

- Header.
- Sidebar.
- Navigation menu.
- Dashboard cards.
- Charts.
- Tables.
- Forms.
- Input fields.
- Dropdowns.
- Tabs.
- Buttons.
- Modal dialogs.
- Page relationships.

Generate reusable React components.

Important:

Do not assume that screenshots alone reveal all application business logic.

When business rules, validations, or workflow transitions cannot be determined from captured information, provide a manual configuration interface for administrators.

Generated components must be editable and reviewable before publication.

## MODULE E: FULL SIMULATION BUILDER

Develop a visual simulation editor.

Administrators must be able to build and configure a complete application simulation.

Features:

### 1. Layout Builder
- Configure application layout.
- Configure header.
- Configure sidebar.
- Configure navigation.
- Configure content area.
- Configure responsive layouts.

### 2. Screen Builder
- Create simulated screens.
- Select reconstructed React components.
- Add captured screenshots as visual references.
- Configure screen navigation.
- Preview each screen.

### 3. Component Builder
Support:

- Buttons
- Input fields
- Text areas
- Dropdowns
- Checkboxes
- Radio buttons
- Tables
- Pagination
- Search
- Filters
- Tabs
- Accordions
- Modal dialogs
- Notifications
- Charts
- Dashboard widgets

### 4. Interaction Builder

Allow administrators to configure:

- Button click actions.
- Navigation actions.
- Modal open and close.
- Form submission.
- Field validation.
- Dropdown selection.
- Tab switching.
- Table filtering.
- Table sorting.
- CRUD actions.
- Status changes.
- Conditional actions.

### 5. Visual Comparison

Display the original screenshot and reconstructed simulation side by side.

Provide manual review and adjustment tools.

The administrator must be able to compare:

- Layout.
- Colors.
- Spacing.
- Typography.
- Menu positions.
- Table structure.
- Form structure.

# 5. SIMULATION DATA ENGINE

Develop an independent dummy data engine.

Simulation data must never be stored in the original application's database.

Support:

- JSON datasets.
- IndexedDB.
- Initial demo datasets.
- Configurable dummy records.
- CRUD operations.
- Search and filtering.
- Sorting and pagination.
- Data validation.
- Data reset.
- Simulation history.

Example:

Application: Sales Force Automation

Customer Table:

- Customer ID
- Customer Name
- Company
- Address
- Customer Type
- Status

User can:

- Add customer.
- Edit customer.
- Delete customer.
- Search customer.
- Filter customer.
- View customer details.

All changes must affect only simulation data.

Provide a Reset Simulation function that restores the original dummy dataset.

# 6. WORKFLOW SIMULATION ENGINE

Create a configurable workflow simulation engine.

Support:

- Multiple workflow types.
- Multiple workflow steps.
- Conditional transitions.
- User roles.
- Approval actions.
- Rejection actions.
- Revision actions.
- Workflow history.
- Dummy notifications.

Example workflow:

Draft → Submitted → Under Review → Approved / Rejected.

Allow administrators to configure workflow rules.

Workflow actions must operate only within the simulation environment.

Example:

A user clicks Submit.

The system changes the simulation status from Draft to Submitted.

A simulated manager can then approve or reject the submission.

No production API or database must be accessed.

# 7. INTERACTIVE DEMO PLAYER

Create a dedicated player to run published simulations.

Features:

- Fullscreen mode.
- Responsive mode.
- Application navigation.
- Interactive buttons.
- Working forms.
- Working tables.
- Dummy data.
- Simulated workflows.
- Modal dialogs.
- Notifications.
- Tutorial integration.
- Reset simulation.
- Back navigation.
- Demo scenario selection.

Provide two viewing modes:

### Presentation Mode
For sales and presales teams.

- Clean application display.
- Hide administration tools.
- Fullscreen support.
- Presenter navigation.
- Demo scenario selection.

### Public Demo Mode
For prospective customers.

- Access through shareable URL.
- No production login.
- Optional password protection.
- Optional expiration date.
- Isolated dummy data.
- Optional lead registration.

# 8. GUIDED WALKTHROUGH ENGINE

Create an interactive tutorial system.

Features:

- Highlight interface elements.
- Spotlight effect.
- Tooltip instructions.
- Next button.
- Previous button.
- Skip button.
- Exit tutorial.
- Tutorial progress.
- Automatic navigation.
- Manual interaction mode.
- Tutorial completion notification.

Support three modes:

1. Guided Mode: system controls the walkthrough.
2. Interactive Mode: user must click the highlighted element.
3. Free Exploration: user explores without guidance.

Tutorial steps must be configurable.

Example:

Tutorial: How to Create a New Project Risk.

Step 1: Open Project Risk menu.
Step 2: Click Add New Risk.
Step 3: Enter Risk Title.
Step 4: Select Risk Category.
Step 5: Enter Risk Description.
Step 6: Select Risk Level.
Step 7: Click Save.
Step 8: View the saved risk.

Allow multiple tutorials for each application.

# 9. SOP & DOCUMENTATION GENERATOR

Create a documentation generator based on captured screens and configured tutorial steps.

Supported documentation:

- User Manual.
- Standard Operating Procedure.
- Application Guide.
- Module Documentation.
- Step-by-Step Instructions.
- Role-Based User Guide.
- Workflow Documentation.

Each documentation step should support:

- Step Number.
- Screenshot.
- Highlighted UI element.
- Instruction Title.
- Description.
- Expected Result.
- Notes and Warnings.

Allow administrators to edit generated documentation before publication.

Export formats:

- PDF
- HTML
- Markdown

Provide company branding and application branding.

# 10. DEMO PUBLISHING

Allow administrators to publish selected simulations.

Features:

- Generate public demo URL.
- Generate private demo URL.
- Password protection.
- Expiration date.
- Enable or disable public access.
- Publish version management.
- Unpublish demo.
- Demo access analytics.

Each application can have multiple demo scenarios.

Example:

NigmaRisk:

- Dashboard Overview.
- Project Risk Workflow.
- Risk Approval Process.
- Monthly Risk Reporting.

# 11. DEMO ANALYTICS

Track demo usage:

- Demo visits.
- Unique visitors where privacy-compliant.
- Most viewed screens.
- Most popular demo scenarios.
- Tutorial completion rate.
- Average demo duration.
- Most frequently used interactions.
- Lead registration.

Provide dashboard reports.

Do not collect sensitive personal information unnecessarily.

# 12. USER & ROLE MANAGEMENT

Create roles:

### Super Administrator
Full access to the entire platform.

### Application Administrator
Manage assigned applications and their simulations.

### Capture Operator
Capture application screens and interactions.

### Simulation Designer
Build and edit simulations.

### Documentation Administrator
Manage SOP and user documentation.

### Sales / Presales
Access published demos and presentation mode.

### Public Visitor
Access permitted public demos.

Implement role-based access control.

# 13. SECURITY & ISOLATION

Security is a critical requirement.

The simulation environment must be completely independent of production.

Mandatory rules:

1. No production database connection during simulation.
2. No production API requests during simulation.
3. No production session cookies.
4. No original application JavaScript execution.
5. No original application iframe embedding.
6. No production form submissions.
7. No production data mutation.
8. No production credentials in simulation.
9. All dummy data must be isolated.
10. All published screenshots must be reviewed for confidential information.

Captured HTML and DOM metadata must be treated as untrusted content.

Do not directly execute captured scripts.

Sanitize imported content and implement a Content Security Policy.

Public demos must run in an isolated origin with appropriate access restrictions.

# 14. OFFLINE SIMULATION & EXPORT

Each completed simulation should support standalone HTML export.

Export package should include:

- HTML files.
- CSS assets.
- JavaScript bundles.
- Images.
- Fonts where licensed.
- Dummy JSON datasets.
- Simulation configuration.
- Tutorial configuration.

The exported simulation must be capable of running without connecting to the original production application.

Provide an offline mode.

Do not claim offline compatibility until the application has been tested without network connectivity.

# 15. MAIN ADMINISTRATOR INTERFACE

Create a modern enterprise dashboard.

Main navigation:

1. Dashboard
2. Application Registry
3. Capture Studio
4. Screen Repository
5. UI Reconstruction
6. Simulation Builder
7. Workflow Builder
8. Tutorial Builder
9. Documentation Generator
10. Published Demos
11. Analytics
12. User Management
13. Settings

Design requirements:

- Modern enterprise UI.
- Professional typography.
- Dark sidebar.
- Clean workspace.
- Responsive design.
- Consistent design system.
- Clear status indicators.
- Professional administration interface.

# 16. DATABASE DESIGN

Create appropriate database entities.

Suggested tables:

- users
- roles
- permissions
- applications
- application_versions
- capture_sessions
- captured_screens
- captured_elements
- recorded_interactions
- reconstructed_components
- simulation_projects
- simulation_screens
- simulation_hotspots
- simulation_actions
- simulation_datasets
- simulation_workflows
- workflow_steps
- tutorials
- tutorial_steps
- documentation
- published_demos
- demo_access_logs
- demo_analytics

Use appropriate relationships, indexes, and timestamps.

# 17. DEVELOPMENT PHASES

Develop incrementally.

### Phase 1: Foundation
- Project setup.
- Authentication.
- User management.
- Application Registry.
- Database schema.

### Phase 2: Capture Studio
- Playwright integration.
- Browser session.
- Screenshot capture.
- Interaction recording.
- Screen Repository.

### Phase 3: UI Reconstruction
- Screen analysis.
- Component identification.
- React reconstruction.
- Visual comparison.
- Manual correction tools.

### Phase 4: Full Simulation
- Simulation Builder.
- Navigation.
- Forms.
- Tables.
- CRUD.
- Dummy Data Engine.
- Workflow Engine.

### Phase 5: Guided Walkthrough
- Tutorial Builder.
- Spotlight.
- Tooltip.
- Tutorial Player.

### Phase 6: Documentation
- SOP Generator.
- User Manual.
- PDF Export.
- HTML Export.
- Markdown Export.

### Phase 7: Publishing
- Public Demo.
- Private Demo.
- Password Protection.
- Expiration.
- Analytics.

### Phase 8: Quality Assurance
- Functional testing.
- Visual testing.
- Security testing.
- Offline testing.
- Performance testing.

# 18. PILOT PROJECT

Before developing all capabilities, implement one complete pilot.

Use one existing web application with authorization to capture and reproduce.

Pilot scope:

- 5 to 10 application screens.
- One dashboard.
- One listing table.
- One input form.
- One detail page.
- One CRUD workflow.
- One approval workflow.
- One guided tutorial.
- One SOP document.
- One published demo.

The pilot must demonstrate the entire process from browser capture to functional simulation.

After successful testing, extend the engine to support additional applications.

# 19. DELIVERABLES

Provide:

1. Complete source code.
2. Backend source code.
3. Frontend source code.
4. Database schema.
5. Playwright capture engine.
6. UI reconstruction module.
7. Simulation builder.
8. Interactive simulation player.
9. Dummy data engine.
10. Workflow simulation engine.
11. Guided walkthrough engine.
12. Documentation generator.
13. Demo publishing module.
14. Docker configuration.
15. Installation guide.
16. Developer documentation.
17. Sample application.
18. Sample simulation project.
19. Functional test cases.
20. Security testing report.

# 20. FINAL DEVELOPMENT INSTRUCTION

Build a real, functional, reusable Application Simulation Platform.

Do not build only a dashboard mockup.

Do not build only a screenshot gallery.

Do not build only a clickable image prototype.

The primary goal is to reconstruct existing web applications into independent, interactive HTML/React simulations.

Prioritize:

- Visual fidelity.
- Functional interactions.
- Reusable components.
- Independent dummy data.
- Workflow simulation.
- Guided user instructions.
- SOP generation.
- Security isolation.
- Easy onboarding of new applications.

The platform must make it possible to turn different authorized web applications into professional interactive product demonstrations with minimal repetitive development work.

All modules must be maintainable, testable, and ready for future expansion.