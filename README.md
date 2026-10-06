# Formulino [website](http://formulino.michelepasetto.it)

A schema-driven system that uses an LLM to generate structured forms and automatically deploy them as Google Forms via API.

Instead of manually building forms in a UI, users define or generate a JSON schema and the system compiles it into a working Google Form.

## Overview

This project enables:

- Generation of form structures using LLMs
- Strict JSON-based form DSL
- Automatic creation of Google Forms
- Web UI + CLI support
- OAuth-based authentication with Google

**Core idea**: treat forms as code artifacts, not UI constructs.

## Architecture

```
Prompt (LLM)
→ JSON Form DSL
→ Validation Layer
→ Mapping Engine (Compiler)
→ Google Forms API
→ Live Google Form
```

## Tech Stack

**Frontend**

- Angular
  - JSON editor (optional Monaco editor)

**Backend**

- Node.js / NestJS
- Google Forms API integration
- OAuth2 authentication

**External**

- Google Forms API
- Google Identity Services (OAuth)
- Optional LLM provider (OpenAI or others)
- Form DSL (Schema)

## Form DSL

All forms are defined using a strict JSON structure.

### Example

```json
{
    "title": "Customer Feedback",
    "description": "Help us improve",
    "sections": [
        {
            "title": "General",
            "items": [
                {
                    "type": "text",
                    "title": "Your name",
                    "required": true
                },
                {
                    "type": "multiple_choice",
                    "title": "Rate us",
                    "options": ["1", "2", "3", "4", "5"]
                }
            ]
        }
    ]
}
```

### Supported item types

- text
- multiple_choice
- checkbox
- dropdown
- image
- video
- section_break

## Core Modules

### 1. LLM Generator (optional)

Generates DSL from natural language prompts.

Rules:

- Must output valid JSON only
- No explanations
- Must strictly follow schema

### 2. Validator

Validates DSL with:

- JSON schema validation (AJV)
- Required fields enforcement
- Type validation
- Option validation

### 3. Mapping Engine (Compiler)

Transforms DSL into Google Forms API requests.

Responsibilities:

- Sections -> page breaks
- Items -> question items
- Maintain ordering via index
- Normalize field types

### 4. Google Forms Adapter

Wrapper over Google Forms API:

- Create form
- Batch update items
- Authentication handling

### 5. Auth Module

Uses Google OAuth.

Scope:

```text
https://www.googleapis.com/auth/forms.body
```

Flow:

1. Login with Google
2. Receive access token
3. Use token to call Google Forms API

### 6. Web App

Features:

- Paste JSON DSL
- Validate structure
- Generate Google Form
- Return shareable link

Optional enhancements:

- Live preview
- Visual schema editor
- Template library

### 7. CLI

Usage:

```bash
create-form form.json
```

Behavior:

1. Read JSON file
2. Validate schema
3. Call backend or API
4. Output form URL

## Example Flow

### Input

```json
{
        "title": "Survey",
        "sections": [
                {
                        "title": "Basics",
                        "items": [
                                {
                                        "type": "text",
                                        "title": "Name",
                                        "required": true
                                }
                        ]
                }
        ]
}
```

### Output

Google Form created:

```text
https://docs.google.com/forms/d/FORM_ID
```

## Constraints

- No native JSON import in Google Forms
- Media handling limitations:
    - Images may require upload handling
    - Videos must be YouTube links
- Updates are limited (append-first model)
- Ordering must be explicitly managed

## Design Principles

- Schema-first architecture
- Deterministic transformation
- Stateless pipeline
- Strict validation at boundaries
- No UI logic in core engine

## Project Structure

```text
/frontend
    Angular application

/backend
    api
    auth
    forms
    mapper
    validators

/cli
    create-form tool

/dsl
    schema definition
    examples

/docs
    architecture
    API documentation
```

## Deployment

Recommended stack for this repository:

- Railway single-service deploy (frontend + backend in one container)
- Configured with `railway.toml` + `Dockerfile` (non-deprecated flow)

Step-by-step guide:

- See `docs/deploy-railway-single-service.md`

## Security

- OAuth tokens not persisted long-term
- Strict schema validation before API calls
- Rate limiting on form creation endpoint
- Input sanitization

## Future Enhancements

- Visual form builder (schema-driven UI)
- Multi-provider support (Typeform, Airtable)
- Versioning system for forms
- Diff-based updates
- Prompt -> form -> preview -> deploy pipeline
- Template marketplace

## Concept Model

- LLM = code generator
- DSL = contract
- Mapper = compiler
- Google Forms API = runtime

## Status

MVP-ready architecture.

Main work items:

1. Finalize DSL
2. Implement mapping engine
3. Build OAuth flow
4. Create Angular UI
5. Add CLI tool

## Phase 1 Foundation (Implemented)

Phase 1 baseline is now scaffolded with:

- npm workspaces monorepo (`backend`, `frontend`, `cli`)
- NestJS backend skeleton
- Angular frontend skeleton
- CLI starter command
- Shared ESLint, Prettier, TypeScript, and Jest baseline
- GitHub Actions CI for lint + test
- Environment templates for backend and frontend

## Quickstart

### Prerequisites

- Node.js 20 LTS
- npm 10+

### Setup

```bash
npm install
```

### Run in Development

```bash
npm run dev
```

Default local endpoints:

- Backend health: `http://localhost:3000/health`
- Frontend dev server: `http://localhost:4200`

### Build, Test, Lint

```bash
npm run build
npm run test
npm run lint
```

### Environment Templates

- Backend: `backend/.env.example`
- Frontend: `frontend/.env.example`

## Phase 1 Exit Checklist

- `npm install` completes without blockers
- `npm run dev` starts backend and frontend
- `npm run lint` passes
- `npm run test` passes
- CI runs lint + test on push and pull_request

## Versioning

Every commit bumps the patch number in `VERSION` and in `frontend/src/environments/*.ts` via `scripts/bump_version.py`.
After cloning, enable the hook once with:

```bash
git config core.hooksPath .githooks
```
