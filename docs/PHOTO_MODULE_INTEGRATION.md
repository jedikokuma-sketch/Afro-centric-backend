# Photo module integration

## Scope and files

The photo gallery implementation is isolated to:

- `src/controllers/photoController.mjs`
- `src/routes/photoRoutes.mjs`
- `src/services/photoService.mjs`
- `src/services/cloudinaryService.mjs`
- `src/middleware/uploadMiddleware.mjs`
- `tests/photoModule.test.mjs`

No authentication, shared schema, comments/likes business logic, server bootstrap, or global error handling is implemented here.

## Integration blockers

1. `src/models/Photo.js` currently contains unresolved Git conflict markers. Its competing schema versions have different category values, tag constraints, and required country behavior. Resolve the shared schema to the agreed Photo contract and export its Mongoose model as the default export. The photo module accepts the ten exact, title-cased categories in the MVP specification and requires `title`, `category`, and `country` on creation.
2. `src/services/commentLikeCleanupService.js` currently contains only a throwing placeholder and is written as CommonJS although the package declares ESM. Before enabling deletion, the Comments & Likes owner must provide an ESM export `cleanupPhotoRelations(photoId)` that idempotently removes both related record types and rejects when cleanup is incomplete.
3. The project’s current central error middleware and package files also need their existing merge conflicts/integration work resolved by their owners. Photo errors use `error.statusCode` and are forwarded to `next(error)`.

Photo deletion returns `503` if cleanup is unavailable or fails. Its order is related-record cleanup, Cloudinary deletion, then MongoDB photo deletion. This is not atomic: if Cloudinary fails, the photo remains but its related records have already been removed; if Cloudinary succeeds but MongoDB deletion fails, the photo record remains while its image may be gone. A retry is possible while that record remains; Cloudinary's `not found` response is treated as an already-completed asset deletion. Cleanup should be safe to repeat.

## Existing dependencies and interfaces

The package manifest already lists Express, Mongoose, Multer, and Cloudinary. The module reuses:

- `src/config/cloudinary.js` for Cloudinary SDK configuration.
- `src/middleware/authMiddleware.js` named export `protect`.
- The shared Photo model's default export (currently blocked by its unresolved conflict).
- The Comments & Likes cleanup interface described above (currently unavailable).

Required environment variables: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.

Authenticated requests must set `req.user._id`; admin deletion expects `req.user.role` to equal `admin` (case-insensitive). The authentication middleware must reject suspended accounts.

## Mounting and middleware order

The project lead should mount the module after resolving the application/server conflicts:

```js
import photoRoutes from './routes/photoRoutes.mjs';

app.use('/api/photos', photoRoutes);
```

For creation, the router deliberately runs `protect`, a photo-user guard, Multer, image validation, and then the controller. The photo-user guard ensures the authentication middleware actually populated `req.user._id` before Multer runs. The Multer field is exactly `image`, limited to one in-memory file of at most 10 MiB. Accepted content signatures are JPEG, PNG, and WebP; MIME and extension alone are not trusted.

## Endpoints

| Method | Path | Access | Behavior |
| --- | --- | --- | --- |
| `POST` | `/api/photos` | Authenticated | Multipart upload; creates a public photo; responds `201`. |
| `GET` | `/api/photos` | Public | Search, filter, and paginate; responds `200`. |
| `GET` | `/api/photos/:id` | Public | Fetch a photo and only `name`/`profilePicture` for its photographer; responds `200`. |
| `PATCH` | `/api/photos/:id` | Authenticated owner only | Update metadata only; responds `200`. |
| `DELETE` | `/api/photos/:id` | Owner or admin | Cleans related records, Cloudinary asset, then photo; responds `200`. |

Successful responses use `{ "success": true, "message": "...", "data": ... }`. Errors are forwarded to the shared error middleware; photo-specific errors carry `statusCode`.

Example multipart fields: `title=Lagos Market`, `category=Culture`, `country=Nigeria`, and `tags=["market","city"]` (tags are JSON-encoded). The server assigns `photographer`, `imageUrl`, and `cloudinaryPublicId`; protected fields are rejected.

List query parameters are `search`, `category`, `country`, `tag`, `page`, and `limit`. Page defaults to `1`; limit defaults to `12` and is capped at `50`. Results are newest-first with `_id` as a deterministic tie-breaker. Search is escaped and matches title, description, location, and tags. Category is exact; country and tag are case-insensitive exact matches. Filters are combined with AND. Response data is `{ "photos": [], "pagination": { "page": 1, "limit": 12, "total": 0, "totalPages": 0 } }`.

`deletePhoto({ photoId, user })` is the reusable deletion-service interface for an admin route after admin authentication. It still enforces that the supplied user is the owner or an admin.

## Verification

Run focused tests with `node --test tests/photoModule.test.mjs`. Tests stub Cloudinary and inject a fake Photo model; they do not verify live MongoDB, Cloudinary credentials, deployed middleware, or cross-service consistency.
