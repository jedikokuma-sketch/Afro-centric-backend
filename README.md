# Afro-centric Backend

## About the Project

Afro-centric is a digital photography gallery dedicated to showcasing African people, culture, traditions, fashion, architecture, landscapes, and everyday life through photography.

This repository contains the backend API that powers the platform. It handles user authentication, photo management, comments, likes, and administrative moderation.

## Tech Stack

- **Node.js** — JavaScript runtime
- **Express.js** — Backend web framework
- **MongoDB Atlas** — Cloud database
- **Mongoose** — MongoDB object modelling
- **JWT** — Authentication tokens
- **bcryptjs** — Password hashing
- **Cloudinary** — Image storage and management
- **Multer** — File upload handling
- **dotenv** — Environment variable management
- **CORS** — Cross-origin resource sharing

## Getting Started

### Prerequisites

Install the following before running the project:

- Node.js
- Git
- A MongoDB Atlas account
- A Cloudinary account
- Postman or another API testing tool

### 1. Clone the Repository

```bash
git clone <REPOSITORY_URL>
cd Afro-centric-backend
```

Replace `<REPOSITORY_URL>` with the actual GitHub repository URL.

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root using `.env.example` as a guide.

Add your own credentials:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_private_jwt_secret
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

**Important:** Never commit your `.env` file or share private credentials in GitHub issues, pull requests, or group chats.

### 4. Start the Development Server

```bash
npm run dev
```

The server runs on the port configured in your environment variables, defaulting to port 5000.

Visit `http://localhost:5000/` to check the API health endpoint.

## Planned Features

- User registration and login
- JWT-based authentication and role-based authorization
- User profile management
- Photograph uploads and management
- Browse, search, and filter photographs
- Photograph likes and unlikes
- Comments on photographs
- Administrative moderation and user management

## Project Structure

```text
src/
├── config/
│   ├── db.js
│   └── cloudinary.js
├── controllers/
├── middleware/
├── models/
├── routes/
├── services/
├── utils/
└── server.js
```

## Team Contribution Guidelines

### Branching Rules

- `master` is reserved for stable releases.
- `develop` is the shared development branch.
- Never code directly on `master` or `develop`.
- Each contributor must work on a separate feature branch.

### Starting a Task

First, update your local development branch:

```bash
git checkout develop
git pull origin develop
```

Create a feature branch for your assigned task:

```bash
git checkout -b feature/your-feature-name
```

Example:

```bash
git checkout -b feature/user-authentication
```

### Saving and Pushing Work

```bash
git add .
git commit -m "feat: describe your change"
git push -u origin feature/your-feature-name
```

### Submitting Changes

1. Open a pull request from your feature branch into `develop`.
2. Explain what you implemented and how you tested it.
3. Wait for the team lead to review and approve the pull request.
4. Resolve any requested changes before merging.
5. Do not merge your own pull request unless the team lead authorizes it.

### Collaboration Rules

- Work only on your assigned features.
- Discuss shared models, routes, and interfaces before changing them.
- Do not modify another teammate's feature without communicating with them.
- Never commit credentials, `node_modules`, or personal configuration files.
- Test your changes before submitting a pull request.
- Communicate blockers early.

## Development Status

**Current stage:** Backend foundation setup.

Authentication, photo management, likes, comments, and administration are planned features and will be implemented incrementally.
