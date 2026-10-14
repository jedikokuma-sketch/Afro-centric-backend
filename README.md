# Afro-centric Backend

This repository contains the Express API backend.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `MONGODB_URI` to a reachable MongoDB database.
3. Set the Cloudinary values in `.env` to enable photo uploads.
4. Start the API with `npm start`.

The API listens on port `3000` by default. The photo endpoints are mounted at `/api/photos`.

In PowerShell, for example:

```powershell
Copy-Item .env.example .env
npm start
```

In a second PowerShell terminal, list photos with:

```powershell
curl.exe -i "http://localhost:3000/api/photos?page=1&limit=12"
```

Photo creation, editing, and deletion require the shared authentication middleware. Those protected operations return a JSON `503` until the authentication module is available and integrated.

## Tests

```powershell
npm test
```
