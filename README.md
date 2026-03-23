# ReachFlow

LinkedIn outreach platform — internal build for Creative Deer.

## Quick Start

```bash
npm run install:all
cd backend && cp .env.example .env   # add your API keys
cd ..
npm run dev
```

Frontend → http://localhost:5173  
Backend  → http://localhost:3001

## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend**: Node.js + Express
- **AI**: Anthropic Claude (claude-sonnet-4-20250514)
- **LinkedIn**: Unipile API
- **Leads**: Apollo.io API
- **Signals**: Trigify API
- **Queue**: BullMQ + Redis
- **Auth**: Supabase Auth

## Project Structure

```
reachflow/
  frontend/src/
    pages/        One file per page
    components/   Shared components (Sidebar, Modal...)
    lib/          API client, utilities
    styles/       Global CSS, design system variables
  backend/src/
    routes/       Express route handlers
    services/     Business logic
    webhooks/     Unipile event handlers
    middleware/   Auth, error handling
```

## Build Roadmap

| Phase | Deliverable |
|-------|-------------|
| 0 | Foundation (this zip) |
| 1 | Onboarding wizard |
| 2 | AI Agents (Signal + Assistant) |
| 3 | Lead Finder |
| 4 | Campaigns + Builder |
| 5 | Inbox + AI replies |
| 6 | Polish + Internal launch |
| 7 | Content module (v2) |
| 8 | SaaS / white-label (v3) |

See the Project Brief document for full specifications.
