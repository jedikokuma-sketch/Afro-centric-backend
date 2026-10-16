import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { Types } from 'mongoose';
import cloudinaryService from '../src/services/cloudinaryService.mjs';
import { requirePhotoUser } from '../src/middleware/uploadMiddleware.mjs';
import {
  createPhoto,
  deletePhoto,
  getPhotoById,
  listPhotos,
  resetPhotoDependenciesForTests,
  setPhotoCleanupForTests,
  setPhotoModelForTests,
  updatePhoto,
} from '../src/services/photoService.mjs';

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

test('photo authentication guard blocks upload processing without a user', () => {
  let passedToNext;
  requirePhotoUser({}, {}, (error) => { passedToNext = error; });
  assert.equal(passedToNext.statusCode, 401);
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
