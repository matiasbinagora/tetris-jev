# Spec Delta

## Purpose

Describes how the Next.js game can run locally and on Vercel with the Jev decision route available while keeping the TypeSafe API credential private.

## ADDED Requirements

### Requirement: Configure local and hosted Jev access
The application SHALL read `JEV_API_KEY` only on the server. Local setup documentation SHALL explain how to configure it through an ignored `.env.local` file. Deployment documentation SHALL explain how to configure it as a server-side Vercel environment variable for Preview and Production, without a `NEXT_PUBLIC_` prefix.

#### Scenario: Run locally with a configured key
- **WHEN** the developer sets `JEV_API_KEY` in `.env.local` and starts the application
- **THEN** the Jev decision route can call the upstream API without exposing the key to the browser

#### Scenario: Deploy with hosted configuration
- **WHEN** the Vercel project has `JEV_API_KEY` set for its selected deployment environment
- **THEN** the deployed server route can call Jev using that environment's server-side value

### Requirement: Deploy the Next.js application to Vercel
The application SHALL build and run on Vercel using the Next.js App Router and a server-capable runtime for the Jev route. The deployment SHALL expose the game UI and same-origin decision route under one origin. A Preview deployment SHALL be used to validate configuration before promoting the app to Production.

#### Scenario: Validate a Preview deployment
- **WHEN** the project is connected to a Vercel project and Preview variables are configured
- **THEN** the Preview build serves the game and a Jev decision request succeeds without disclosing the key

#### Scenario: Promote a verified build
- **WHEN** the Preview deployment has been verified and Production variables are configured
- **THEN** the same application can be deployed to Production with the production Jev credential
