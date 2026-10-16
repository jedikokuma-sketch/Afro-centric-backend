import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import express from 'express';
import { Types } from 'mongoose';
import cloudinaryService from '../src/services/cloudinaryService.mjs';
import {
  requirePhotoUser,
  uploadImages,
  validateUploadedImage,
} from '../src/middleware/uploadMiddleware.mjs';
import { errorHandler } from '../src/middleware/errorMiddleware.mjs';
import {
  createPhoto,
  createPhotos,
  deletePhoto,
  getPhotoById,
  listPhotos,
  resetPhotoDependenciesForTests,
  setPhotoCleanupForTests,
  setPhotoModelForTests,
  updatePhoto,
} from '../src/services/photoService.mjs';
import Photo, { photoCategories } from '../src/models/Photo.js';

const ownerId = '64c3b7d4bb0d9f0d0e5cf2a4';
const otherId = '111111111111111111111111';
const photoId = '65c3b7d4bb0d9f0d0e5cf2a4';
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

function makePhoto(overrides = {}) {
  return {
    _id: new Types.ObjectId(photoId),
    title: 'Lagos Market',
    category: 'Culture',
    country: 'Nigeria',
    tags: ['market'],
    photographer: ownerId,
    imageUrl: 'https://res.cloudinary.com/example/image/upload/photo.jpg',
    cloudinaryPublicId: 'afrolens/photos/test',
    save: async function save() { return this; },
    toObject() { return { ...this }; },
    ...overrides,
  };
}

function makeModel(photo = makePhoto()) {
  const model = function Photo(data) {
    return {
      ...data,
      _id: new Types.ObjectId(photoId),
      async save() { return this; },
      toObject() { return { ...this }; },
    };
  };
  model.findById = async () => photo;
  model.deleteOne = async () => ({ deletedCount: 1 });
  model.find = (filter) => {
    model.lastFilter = filter;
    const query = {
      sort(value) { model.sortValue = value; return this; },
      skip(value) { model.skipValue = value; return this; },
      limit(value) { model.limitValue = value; return this; },
      lean: async () => [],
    };
    return query;
  };
  model.countDocuments = async () => 0;
  return model;
}

afterEach(() => {
  resetPhotoDependenciesForTests();
  cloudinaryService.uploadImage = originalUploadImage;
  cloudinaryService.deleteImage = originalDeleteImage;
});

const originalUploadImage = cloudinaryService.uploadImage;
const originalDeleteImage = cloudinaryService.deleteImage;

test('upload validates actual image bytes instead of trusting the MIME type', () => {
  assert.throws(
    () => cloudinaryService.validateImageBuffer({ buffer: Buffer.from('not an image'), mimetype: 'image/jpeg' }),
    { statusCode: 415 },
  );
  assert.throws(
    () => cloudinaryService.validateImageBuffer({ buffer: jpg, mimetype: 'image/png' }),
    { statusCode: 415 },
  );
});

test('shared Photo model supports the agreed gallery categories and required country', async () => {
  assert.deepEqual(photoCategories, [
    'Culture',
    'People',
    'Fashion',
    'Nature',
    'Architecture',
    'Events',
    'Traditional Life',
    'Street Photography',
    'Food',
    'Wildlife',
  ]);
  const photo = new Photo({
    title: 'Lagos Market',
    category: 'Culture',
    country: 'Nigeria',
    imageUrl: 'https://example.test/photo.jpg',
    cloudinaryPublicId: 'afrolens/photos/test',
    photographer: new Types.ObjectId(ownerId),
  });
  await assert.doesNotReject(photo.validate());
  const missingCountry = new Photo({
    title: 'Lagos Market',
    category: 'Culture',
    imageUrl: 'https://example.test/photo.jpg',
    cloudinaryPublicId: 'afrolens/photos/test',
    photographer: new Types.ObjectId(ownerId),
  });
  await assert.rejects(
    missingCountry.validate(),
    (error) => error.name === 'ValidationError' && Boolean(error.errors.country),
  );
});

test('photo authentication guard blocks upload processing without a user', () => {
  let passedToNext;
  requirePhotoUser({}, {}, (error) => { passedToNext = error; });
  assert.equal(passedToNext.statusCode, 401);
});

test('too many upload files return a clear 400 client error', () => {
  const response = {
    headersSent: false,
    statusCode: undefined,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  errorHandler(
    Object.assign(new Error('Too many files'), { code: 'LIMIT_FILE_COUNT' }),
    {},
    response,
    () => assert.fail('error handler should respond'),
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    success: false,
    message: 'Too many files or unexpected file field. Upload no more than 5 files using the "image" field.',
    errors: ['Too many files or unexpected file field. Upload no more than 5 files using the "image" field.'],
  });
});

test('multipart upload middleware accepts repeated image fields and enforces the five-file cap', async () => {
  const app = express();
  app.post(
    '/upload',
    (req, res, next) => {
      req.user = { _id: ownerId };
      next();
    },
    requirePhotoUser,
    uploadImages,
    validateUploadedImage,
    (req, res) => res.json({ count: req.files.length }),
  );
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, () => resolve(listeningServer));
  });

  try {
    const url = `http://127.0.0.1:${server.address().port}/upload`;
    const accepted = new FormData();
    for (let index = 0; index < 2; index += 1) {
      accepted.append('image', new Blob([jpg], { type: 'image/jpeg' }), `photo-${index}.jpg`);
    }
    const acceptedResponse = await fetch(url, { method: 'POST', body: accepted });
    assert.equal(acceptedResponse.status, 200);
    assert.deepEqual(await acceptedResponse.json(), { count: 2 });

    const rejected = new FormData();
    for (let index = 0; index < 6; index += 1) {
      rejected.append('image', new Blob([jpg], { type: 'image/jpeg' }), `photo-${index}.jpg`);
    }
    const rejectedResponse = await fetch(url, { method: 'POST', body: rejected });
    assert.equal(rejectedResponse.status, 400);
    assert.match((await rejectedResponse.json()).message, /no more than 5 files/i);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('oversized image buffers are rejected', () => {
  const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
  assert.throws(
    () => cloudinaryService.validateImageBuffer({ buffer: oversized }),
    { statusCode: 413 },
  );
});

test('creation derives photographer and image fields from authenticated user and Cloudinary', async () => {
  setPhotoModelForTests(makeModel());
  cloudinaryService.uploadImage = async () => ({
    secure_url: 'https://res.cloudinary.com/test/new.jpg',
    public_id: 'afrolens/photos/new',
  });
  let saved;
  const model = function Photo(data) {
    saved = data;
    return { ...data, async save() { return this; }, toObject() { return { ...this }; } };
  };
  setPhotoModelForTests(model);

  const photo = await createPhoto({
    user: { _id: ownerId },
    file: { buffer: jpg, mimetype: 'image/jpeg' },
    metadata: {
      title: 'Lagos Market',
      category: 'Culture',
      country: 'Nigeria',
      tags: '["market","city"]',
    },
  });

  assert.equal(photo.photographer, ownerId);
  assert.equal(photo.imageUrl, 'https://res.cloudinary.com/test/new.jpg');
  assert.equal(photo.cloudinaryPublicId, 'afrolens/photos/new');
  assert.deepEqual(saved.tags, ['market', 'city']);
});

test('batch creation canonicalizes category capitalization before saving', async () => {
  let saved;
  setPhotoModelForTests(function Photo(data) {
    saved = data;
    return {
      ...data,
      async save() { return this; },
      toObject() { return { ...this }; },
    };
  });
  cloudinaryService.uploadImage = async () => ({
    secure_url: 'https://res.cloudinary.com/test/new.jpg',
    public_id: 'afrolens/photos/new',
  });

  const [photo] = await createPhotos({
    user: { _id: ownerId },
    files: [{ buffer: jpg, mimetype: 'image/jpeg' }],
    metadataList: [{ title: 'Lagos Market', category: 'culture', country: 'Nigeria' }],
  });

  assert.equal(photo.category, 'Culture');
  assert.equal(saved.category, 'Culture');
});

test('creation rejects absent files and protected client fields', async () => {
  await assert.rejects(
    createPhoto({ user: { _id: ownerId }, metadata: { title: 'A', category: 'Culture' } }),
    { statusCode: 400 },
  );
  await assert.rejects(
    createPhoto({ file: { buffer: jpg }, metadata: { title: 'A', category: 'Culture' } }),
    { statusCode: 401 },
  );
  await assert.rejects(
    createPhoto({
      user: { _id: ownerId },
      file: { buffer: jpg, mimetype: 'image/jpeg' },
      metadata: { title: 'A', category: 'Culture', imageUrl: 'https://attacker.invalid/a.jpg' },
    }),
    { statusCode: 400 },
  );
});

test('failed database creation compensates by deleting the uploaded Cloudinary asset', async () => {
  let deletedId;
  setPhotoModelForTests(function Photo() {
    return { async save() { throw new Error('database unavailable'); } };
  });
  cloudinaryService.uploadImage = async () => ({
    secure_url: 'https://res.cloudinary.com/test/new.jpg',
    public_id: 'afrolens/photos/new',
  });
  cloudinaryService.deleteImage = async (publicId) => { deletedId = publicId; };

  await assert.rejects(
    createPhoto({
      user: { _id: ownerId },
      file: { buffer: jpg, mimetype: 'image/jpeg' },
      metadata: { title: 'Lagos Market', category: 'Culture', country: 'Nigeria' },
    }),
    { statusCode: 503 },
  );
  assert.equal(deletedId, 'afrolens/photos/new');
});

test('batch creation saves each image with its own metadata', async () => {
  const savedPhotos = [];
  let uploadIndex = 0;
  setPhotoModelForTests(function Photo(data) {
    return {
      ...data,
      _id: new Types.ObjectId(),
      async save() { savedPhotos.push(this); },
      toObject() { return { ...this }; },
    };
  });
  cloudinaryService.uploadImage = async () => {
    uploadIndex += 1;
    return {
      secure_url: `https://res.cloudinary.com/test/${uploadIndex}.jpg`,
      public_id: `afrolens/photos/${uploadIndex}`,
    };
  };

  const photos = await createPhotos({
    user: { _id: ownerId },
    files: [
      { buffer: jpg, mimetype: 'image/jpeg' },
      { buffer: jpg, mimetype: 'image/jpeg' },
    ],
    metadataList: [
      { title: 'Lagos Market', category: 'Culture', country: 'Nigeria' },
      { title: 'Kente Fashion', category: 'Fashion', country: 'Ghana' },
    ],
  });

  assert.equal(photos.length, 2);
  assert.equal(photos[0].title, 'Lagos Market');
  assert.equal(photos[1].title, 'Kente Fashion');
  assert.equal(photos[0].cloudinaryPublicId, 'afrolens/photos/1');
  assert.equal(photos[1].cloudinaryPublicId, 'afrolens/photos/2');
  assert.equal(savedPhotos.length, 2);
});

test('batch creation rejects mismatched metadata counts and more than five images', async () => {
  const file = { buffer: jpg, mimetype: 'image/jpeg' };
  await assert.rejects(
    createPhotos({
      user: { _id: ownerId },
      files: [file, file],
      metadataList: [{ title: 'Only one', category: 'Culture', country: 'Nigeria' }],
    }),
    { statusCode: 400 },
  );
  await assert.rejects(
    createPhotos({
      user: { _id: ownerId },
      files: [file, file, file, file, file, file],
      metadataList: Array.from({ length: 6 }, () => ({
        title: 'Test photo',
        category: 'Culture',
        country: 'Nigeria',
      })),
    }),
    { statusCode: 400 },
  );
});

test('batch failure rolls back saved photos and uploaded assets', async () => {
  const deletedPhotoIds = [];
  const deletedAssetIds = [];
  let saveCalls = 0;
  let uploadCalls = 0;
  const model = function Photo(data) {
    return {
      ...data,
      _id: new Types.ObjectId(),
      async save() {
        saveCalls += 1;
        if (saveCalls === 2) {
          throw new Error('database unavailable');
        }
      },
    };
  };
  model.deleteOne = async ({ _id }) => {
    deletedPhotoIds.push(String(_id));
    return { deletedCount: 1 };
  };
  setPhotoModelForTests(model);
  cloudinaryService.uploadImage = async () => {
    uploadCalls += 1;
    return {
      secure_url: `https://res.cloudinary.com/test/${uploadCalls}.jpg`,
      public_id: `afrolens/photos/${uploadCalls}`,
    };
  };
  cloudinaryService.deleteImage = async (publicId) => {
    deletedAssetIds.push(publicId);
  };

  await assert.rejects(
    createPhotos({
      user: { _id: ownerId },
      files: [
        { buffer: jpg, mimetype: 'image/jpeg' },
        { buffer: jpg, mimetype: 'image/jpeg' },
      ],
      metadataList: [
        { title: 'First photo', category: 'Culture', country: 'Nigeria' },
        { title: 'Second photo', category: 'Fashion', country: 'Ghana' },
      ],
    }),
    { statusCode: 503 },
  );
  assert.equal(deletedPhotoIds.length, 1);
  assert.deepEqual(deletedAssetIds, ['afrolens/photos/2', 'afrolens/photos/1']);
});

test('listing combines allowed filters, escapes search syntax and paginates', async () => {
  const model = makeModel();
  setPhotoModelForTests(model);
  const result = await listPhotos({
    search: 'lagos.*',
    category: 'Culture',
    country: 'Nigeria',
    tag: 'market',
    page: '2',
    limit: '5',
  });

  assert.equal(result.pagination.page, 2);
  assert.equal(result.pagination.limit, 5);
  assert.equal(model.skipValue, 5);
  assert.deepEqual(model.sortValue, { createdAt: -1, _id: -1 });
  assert.equal(model.lastFilter.category, 'Culture');
  assert.equal(model.lastFilter.country.test('nigeria'), true);
  assert.equal(model.lastFilter.tags.$in[0].test('MARKET'), true);
  assert.equal(model.lastFilter.$or[0].title.source, 'lagos\\.\\*');
});

test('category filters accept case variations and use the canonical value', async () => {
  const model = makeModel();
  setPhotoModelForTests(model);

  await listPhotos({ category: 'street photography' });

  assert.equal(model.lastFilter.category, 'Street Photography');
});

test('invalid pagination is rejected', async () => {
  await assert.rejects(listPhotos({ page: '1e2' }), { statusCode: 400 });
  await assert.rejects(listPhotos({ limit: '51' }), { statusCode: 400 });
});

test('malformed IDs and missing photos return client errors', async () => {
  await assert.rejects(getPhotoById('not-an-id'), { statusCode: 400 });
  const model = makeModel();
  model.findById = async () => null;
  setPhotoModelForTests(model);
  await assert.rejects(getPhotoById(photoId), { statusCode: 404 });
});

test('only the owner may update photo metadata, including when the caller is an admin', async () => {
  const photo = makePhoto();
  const model = makeModel(photo);
  setPhotoModelForTests(model);

  const updated = await updatePhoto({
    photoId,
    user: { _id: ownerId },
    updates: { title: 'Updated title' },
  });
  assert.equal(updated.title, 'Updated title');

  await assert.rejects(
    updatePhoto({ photoId, user: { _id: otherId, role: 'admin' }, updates: { title: 'Denied' } }),
    { statusCode: 403 },
  );
  await assert.rejects(
    updatePhoto({ photoId, user: { _id: ownerId }, updates: { imageUrl: 'https://bad.invalid' } }),
    { statusCode: 400 },
  );
});

test('deletion cleans related records before deleting the asset and photo', async () => {
  const calls = [];
  const model = makeModel(makePhoto());
  model.deleteOne = async () => { calls.push('database'); return { deletedCount: 1 }; };
  setPhotoModelForTests(model);
  setPhotoCleanupForTests({
    async cleanupPhotoRelations(id) {
      assert.equal(id, photoId);
      calls.push('relations');
    },
  });
  cloudinaryService.deleteImage = async (id) => {
    assert.equal(id, 'afrolens/photos/test');
    calls.push('cloudinary');
    return { result: 'ok' };
  };

  await deletePhoto({ photoId, user: { _id: ownerId } });
  assert.deepEqual(calls, ['relations', 'cloudinary', 'database']);
});

test('failed related-record cleanup prevents Cloudinary and photo deletion', async () => {
  const model = makeModel(makePhoto());
  model.deleteOne = async () => { throw new Error('should not delete photo'); };
  setPhotoModelForTests(model);
  setPhotoCleanupForTests({ async cleanupPhotoRelations() { throw new Error('cleanup failure'); } });
  let cloudinaryCalled = false;
  cloudinaryService.deleteImage = async () => { cloudinaryCalled = true; };

  await assert.rejects(deletePhoto({ photoId, user: { _id: ownerId } }), { statusCode: 503 });
  assert.equal(cloudinaryCalled, false);
});

test('non-owner deletion is rejected and admin deletion is allowed', async () => {
  const model = makeModel(makePhoto());
  setPhotoModelForTests(model);
  await assert.rejects(
    deletePhoto({ photoId, user: { _id: otherId } }),
    { statusCode: 403 },
  );

  setPhotoCleanupForTests({ async cleanupPhotoRelations() {} });
  cloudinaryService.deleteImage = async () => ({ result: 'ok' });
  await assert.doesNotReject(deletePhoto({
    photoId,
    user: { _id: otherId, role: 'ADMIN' },
  }));
});

test('Cloudinary deletion failure leaves the photo record undeleted', async () => {
  const model = makeModel(makePhoto());
  let databaseDeleteCalled = false;
  model.deleteOne = async () => { databaseDeleteCalled = true; return { deletedCount: 1 }; };
  setPhotoModelForTests(model);
  setPhotoCleanupForTests({ async cleanupPhotoRelations() {} });
  cloudinaryService.deleteImage = async () => {
    const error = new Error('Cloudinary unavailable');
    error.statusCode = 503;
    throw error;
  };

  await assert.rejects(
    deletePhoto({ photoId, user: { _id: ownerId } }),
    { statusCode: 503 },
  );
  assert.equal(databaseDeleteCalled, false);
});
