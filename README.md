# Agentverse UML Website Scaffold

This repository contains a starter website project for an Agentverse / OmegaClaw specialist capability.

## What this scaffold includes

- `Next.js` frontend with login, dashboard, and Cloudinary diagram preview support
- `MongoDB` storage for project UML diagrams via `mongoose`
- `Cloudinary` integration helper for storing and rendering UML diagram images
- `Agentverse` API stub and skill invocation flow using `pages/api/agentverse.js`
- Local auth stub via JWT cookies for quick prototyping
- Repo connector UI to connect Git or local schema sources

## Files created

- `pages/index.js`
- `pages/login.js`
- `pages/dashboard.js`
- `pages/api/auth.js`
- `pages/api/projects.js`
- `pages/api/agentverse.js`
- `lib/mongodb.js`
- `lib/cloudinary.js`
- `lib/agentverse.js`
- `components/DiagramViewer.js`
- `components/RepoConnector.js`
- `components/AgentverseConsole.js`
- `models/Project.js`
- `styles/globals.css`
- `.env.example`

## Setup

1. Copy `.env.example` to `.env.local`.
2. Populate `MONGODB_URI`, Cloudinary values, and `AGENTVERSE` credentials.
3. Run `npm install`.
4. Start development with `npm run dev`.

## Next steps

- Implement actual repo parsing and UML generation via a code intelligence / AST pipeline
- Register a specialist agent on Agentverse and wire `lib/agentverse.js` to the real API
- Add Chat Protocol support in the API response flow
- Connect the app to OmegaClaw as a discoverable skill for end-to-end demos
