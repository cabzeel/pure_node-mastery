# Pure Node.js Mastery

A fitness-community web application built from the ground up with **Node.js, without Express or backend frameworks**.

This project is part of my journey toward mastering backend development by working directly with Node.js APIs, understanding how the underlying systems operate, and solving problems without relying on abstractions I haven't learned to build myself.

**Repository:** [github.com/cabzeel/pure_node-mastery](https://github.com/cabzeel/pure_node-mastery)

## Overview

The project implements a custom HTTP server, user authentication, session management, and user account operations using native Node.js modules.

Rather than starting with a framework, the goal is to understand the mechanics behind backend development, including HTTP request handling, routing, asynchronous operations, authentication, and data persistence.

## Features

- **User registration:** Create accounts with unique email addresses.
- **User login:** Verify credentials and establish authenticated sessions.
- **Session management:** Generate, persist, and expire session tokens.
- **User authentication:** Protect account endpoints using session-based token verification.
- **Profile management:** Retrieve, update, and delete user accounts.
- **Password management:** Verify existing passwords and securely hash new passwords.
- **JSON persistence:** Store user and session data in local JSON files.
- **Static file serving:** Serve frontend files through the native HTTP server.
- **Request handling:** Process JSON payloads, HTTP methods, content types, and request-size limits.

## Tech Stack

- **Runtime:** Node.js
- **Language:** JavaScript
- **Server:** Native `node:http`
- **Data persistence:** JSON files using the filesystem API
- **Security:** Password hashing with `crypto.scrypt`, salts, and cryptographically generated tokens
- **Frontend communication:** HTTP requests using `fetch`
- **Version control:** Git and GitHub

No Express or external backend framework is used.

## API Endpoints

| Method   | Endpoint             | Purpose                                   |
| -------- | -------------------- | ----------------------------------------- |
| `POST`   | `/api/signup`        | Register a new user                       |
| `POST`   | `/api/login`         | Authenticate a user                       |
| `POST`   | `/api/logout`        | End the user's session                    |
| `GET`    | `/api/user/profile`  | Retrieve the authenticated user's profile |
| `PATCH`  | `/api/user/profile`  | Update profile information                |
| `DELETE` | `/api/user/profile`  | Delete the user's account                 |
| `PATCH`  | `/api/user/password` | Change the user's password                |

Protected endpoints require valid authentication according to the application's session-handling logic.

## Project Structure

The backend separates server logic, utility functions, application state, and persisted data.

```text
backend/
├── utils/
│   ├── app.js
│   └── state.js
├── db/
│   ├── users.json
│   └── sessions.json
└── ...
```

The exact location of the server entry point and frontend files depends on the current repository structure.

## Getting Started

### Prerequisites

- Node.js installed on your machine
- Git installed on your machine

### 1. Clone the repository

```bash
git clone https://github.com/cabzeel/pure_node-mastery.git
cd pure_node-mastery
```

### 2. Navigate to the backend

```bash
cd backend
```

### 3. Start the server

Run the project's server entry file with Node.js. For example, if the entry file is `server.js`:

```bash
node server.js
```

The server is configured to listen on port `3000`.

### 4. Test the application

Open the local address in your browser:

```text
http://localhost:3000
```

Use the available frontend pages to test registration, login, profile operations, and password changes.

## Data Storage

The current implementation uses JSON files for persistence:

- `users.json` stores user account records.
- `sessions.json` stores active session records.

This keeps the project simple and makes the persistence mechanism easier to understand while learning how backend applications interact with the filesystem.

A dedicated database is a future improvement rather than a claimed feature of the current implementation.

## Learning Objectives

This project explores the fundamentals behind a Node.js backend:

- Creating an HTTP server without a framework
- Routing requests and parsing URLs
- Reading request bodies as streams
- Handling asynchronous operations and Promises
- Working with modules and the filesystem
- Implementing authentication and session lifecycles
- Hashing passwords and generating secure random values
- Designing reusable utility functions
- Handling validation, errors, and HTTP status codes
- Understanding the trade-offs of file-based persistence

## Current Status

The core server, authentication flow, session handling, and account operations have been implemented. The project is still evolving, and further validation, security hardening, persistence improvements, and architectural refinements remain part of the learning process.

It is a learning project, **not a production-ready authentication system**.

## What's Next

Planned areas of exploration include:

- Migrating from JSON files to a dedicated database
- Improving request validation and error handling
- Strengthening authentication and session security
- Refining data persistence and consistency
- Expanding backend functionality as the project evolves

## Author

**Cabzeel Yong**

- GitHub: [@Cabzeel](https://github.com/Cabzeel)
- Portfolio: [https://](https://zeeltechsolutions.com)[zeeltechsolutions.com](https://zeeltechsolutions.com)

Built through deliberate practice, experimentation, debugging, and a commitment to understanding backend systems from the ground up.

`#CabzeelCodes`
