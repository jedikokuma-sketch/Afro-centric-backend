const { ObjectId } = require('mongoose').Types;
const cloudinaryService = require('../src/services/cloudinaryService');
const photoService = require('../src/services/photoService');
const cleanupService = require('../src/services/commentLikeCleanupService');

function createValidImageBuffer() {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]);
}

function createMockPhotoModel() {
  const docs = [];

  function modelConstructor(data) {
    const instance = {
      ...data,
      save: jest.fn().mockImplementation(async function () {
        const existingIndex = docs.findIndex((doc) => String(doc._id) === String(this._id));
        if (existingIndex >= 0) {
          docs[existingIndex] = { ...docs[existingIndex], ...this };
        } else {
          docs.push({ ...this });
        }
        return this;
      }),
      toObject() {
        return { ...this };
      },
    };

    return instance;
  }

  const PhotoModel = function PhotoModel(data) {
    return modelConstructor(data);
  };

  PhotoModel.find = jest.fn((filter = {}) => {
    const items = docs.filter((doc) => {
      if (filter.category && doc.category !== filter.category) return false;
      if (filter.country && !new RegExp(`^${String(filter.country).source}$`, 'i').test(doc.country || '')) return false;
      if (filter.tags && filter.tags.$in) {
        const matcher = filter.tags.$in[0];
        if (!doc.tags || !doc.tags.some((tag) => matcher.test(tag))) return false;
      }
      if (filter.$or) {
        const matches = filter.$or.some((condition) => {
          if (condition.title) return condition.title.test(doc.title || '');
          if (condition.description) return condition.description.test(doc.description || '');
          if (condition.location) return condition.location.test(doc.location || '');
          if (condition.tags) return condition.tags.$in[0].test((doc.tags || []).join(' '));
          return false;
        });
        if (!matches) return false;
      }
      return true;
    });

    return {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(items),
    };
  });
  PhotoModel.countDocuments = jest.fn(async (filter = {}) => {
    return (await PhotoModel.find(filter).lean()).length;
  });
  PhotoModel.findById = jest.fn(async (id) => docs.find((doc) => String(doc._id) === String(id)) || null);
  PhotoModel.findById.mockImplementation((id) => {
    const doc = docs.find((item) => String(item._id) === String(id));
    if (!doc) return null;
    return {
      populate: jest.fn().mockResolvedValue(doc),
    };
  });
  PhotoModel.deleteOne = jest.fn(async ({ _id }) => {
    const index = docs.findIndex((doc) => String(doc._id) === String(_id));
    if (index >= 0) docs.splice(index, 1);
    return { deletedCount: 1 };
  });
  PhotoModel.create = jest.fn(async (payload) => {
    const photo = modelConstructor({
      ...payload,
      _id: new ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    docs.push(photo);
    return photo;
  });

  return { PhotoModel, docs, modelConstructor };
}

beforeEach(() => {
  jest.restoreAllMocks();
  const { PhotoModel, docs } = createMockPhotoModel();
  photoService.setPhotoModel(PhotoModel);
  global.__photoDocs = docs;
  jest.spyOn(cloudinaryService, 'uploadImage').mockResolvedValue({
    secure_url: 'https://cloudinary.example.com/photo.jpg',
    public_id: 'afrolens/photos/abc123',
  });
  jest.spyOn(cloudinaryService, 'deleteImage').mockResolvedValue({ result: 'ok' });
  jest.spyOn(cleanupService, 'cleanupPhotoRelations').mockResolvedValue({ deletedCount: 0 });
});

afterEach(() => {
  photoService.resetPhotoModel();
});

test('successful photo creation', async () => {
  const photo = await photoService.createPhoto({
    user: { _id: '64c3b7d4bb0d9f0d0e5cf2a4', role: 'user' },
    file: { buffer: createValidImageBuffer(), mimetype: 'image/jpeg' },
    metadata: { title: 'Lagos Market', category: 'Culture', country: 'Nigeria', location: 'Lagos', tags: ['market', 'city'] },
  });

  expect(photo.title).toBe('Lagos Market');
  expect(photo.photographer).toBe('64c3b7d4bb0d9f0d0e5cf2a4');
  expect(photo.imageUrl).toContain('cloudinary.example.com');
});

test('missing image is rejected', async () => {
  await expect(photoService.createPhoto({
    user: { _id: '64c3b7d4bb0d9f0d0e5cf2a4' },
    metadata: { title: 'Oops', category: 'Culture', country: 'Nigeria' },
  })).rejects.toMatchObject({ statusCode: 400 });
});

test('unsupported image content is rejected', async () => {
  await expect(photoService.createPhoto({
    user: { _id: '64c3b7d4bb0d9f0d0e5cf2a4' },
    file: { buffer: Buffer.from('not-an-image', 'utf8'), mimetype: 'image/png' },
    metadata: { title: 'Oops', category: 'Culture', country: 'Nigeria' },
  })).rejects.toMatchObject({ statusCode: 415 });
});

test('spoofed mime type is rejected', async () => {
  const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  await expect(photoService.createPhoto({
    user: { _id: '64c3b7d4bb0d9f0d0e5cf2a4' },
    file: { buffer: fakePng, mimetype: 'image/jpeg' },
    metadata: { title: 'Spoof', category: 'Culture', country: 'Nigeria' },
  })).rejects.toMatchObject({ statusCode: 415 });
});

test('photo creation cleanup after db failure', async () => {
  const { PhotoModel } = createMockPhotoModel();
  const uploadSpy = jest.spyOn(cloudinaryService, 'uploadImage').mockResolvedValue({
    secure_url: 'https://cloudinary.example.com/photo.jpg',
    public_id: 'afrolens/photos/abc123',
  });
  const deleteSpy = jest.spyOn(cloudinaryService, 'deleteImage').mockResolvedValue({ result: 'ok' });

  const originalNew = PhotoModel;
  const fakeCtor = function FakePhoto(data) {
    return {
      ...data,
      save: jest.fn().mockRejectedValue(new Error('mongo failed')),
      toObject() { return this; },
    };
  };
  fakeCtor.find = originalNew.find;
  fakeCtor.findById = originalNew.findById;
  fakeCtor.deleteOne = originalNew.deleteOne;
  fakeCtor.countDocuments = originalNew.countDocuments;
  photoService.setPhotoModel(fakeCtor);

  await expect(photoService.createPhoto({
    user: { _id: '64c3b7d4bb0d9f0d0e5cf2a4' },
    file: { buffer: createValidImageBuffer(), mimetype: 'image/jpeg' },
    metadata: { title: 'Cleanup', category: 'Culture', country: 'Nigeria' },
  })).rejects.toThrow('mongo failed');

  expect(uploadSpy).toHaveBeenCalled();
  expect(deleteSpy).toHaveBeenCalledWith('afrolens/photos/abc123');
});

test('protected fields are rejected', async () => {
  await expect(photoService.createPhoto({
    user: { _id: '64c3b7d4bb0d9f0d0e5cf2a4' },
    file: { buffer: createValidImageBuffer(), mimetype: 'image/jpeg' },
    metadata: { title: 'Bad', category: 'Culture', country: 'Nigeria', imageUrl: 'https://evil.com' },
  })).rejects.toMatchObject({ statusCode: 400 });
});

test('photo creation cleanup after db failure', async () => {
  const { PhotoModel } = createMockPhotoModel();
  const uploadSpy = jest.spyOn(cloudinaryService, 'uploadImage').mockResolvedValue({
    secure_url: 'https://cloudinary.example.com/photo.jpg',
    public_id: 'afrolens/photos/abc123',
  });
  const deleteSpy = jest.spyOn(cloudinaryService, 'deleteImage').mockResolvedValue({ result: 'ok' });

  const fakeCtor = function FakePhoto(data) {
    return {
      ...data,
      save: jest.fn().mockRejectedValue(new Error('mongo failed')),
      toObject() { return this; },
    };
  };
  fakeCtor.find = PhotoModel.find;
  fakeCtor.findById = PhotoModel.findById;
  fakeCtor.deleteOne = PhotoModel.deleteOne;
  fakeCtor.countDocuments = PhotoModel.countDocuments;
  photoService.setPhotoModel(fakeCtor);

  await expect(photoService.createPhoto({
    user: { _id: '64c3b7d4bb0d9f0d0e5cf2a4' },
    file: { buffer: createValidImageBuffer(), mimetype: 'image/jpeg' },
    metadata: { title: 'Cleanup', category: 'Culture', country: 'Nigeria' },
  })).rejects.toThrow('mongo failed');

  expect(uploadSpy).toHaveBeenCalled();
  expect(deleteSpy).toHaveBeenCalledWith('afrolens/photos/abc123');
});

test('listing with combined filters and pagination works', async () => {
  const { PhotoModel } = createMockPhotoModel();
  photoService.setPhotoModel(PhotoModel);
  const first = {
    _id: new ObjectId(),
    title: 'Lagos Festival',
    description: 'A city celebration',
    category: 'Culture',
    country: 'Nigeria',
    location: 'Lagos',
    tags: ['festival', 'market'],
    photographer: '64c3b7d4bb0d9f0d0e5cf2a4',
    imageUrl: 'https://cloudinary.example.com/a.jpg',
    cloudinaryPublicId: 'afrolens/photos/a',
    createdAt: new Date('2024-01-02T00:00:00.000Z'),
  };
  const second = {
    ...first,
    _id: new ObjectId(),
    title: 'Abuja Street',
    category: 'Street Photography',
    location: 'Abuja',
    tags: ['street', 'market'],
    createdAt: new Date('2024-01-10T00:00:00.000Z'),
  };
  PhotoModel.find.mockImplementation(() => ({
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([first, second]),
  }));
  PhotoModel.countDocuments.mockResolvedValue(2);

  const result = await photoService.listPhotos({ search: 'lagos', category: 'Culture', country: 'Nigeria', tag: 'market', page: '1', limit: '12' });

  expect(result.pagination.page).toBe(1);
  expect(result.pagination.total).toBe(2);
  expect(result.photos).toHaveLength(2);
});

test('invalid pagination is rejected', async () => {
  await expect(photoService.listPhotos({ page: '0' })).rejects.toMatchObject({ statusCode: 400 });
  await expect(photoService.listPhotos({ limit: '999' })).rejects.toMatchObject({ statusCode: 400 });
});

test('malformed photo id is rejected', async () => {
  await expect(photoService.getPhotoById('invalid-id')).rejects.toMatchObject({ statusCode: 400 });
});

test('missing photo is rejected', async () => {
  const randomId = new ObjectId().toHexString();
  await expect(photoService.getPhotoById(randomId)).rejects.toMatchObject({ statusCode: 404 });
});

test('owner metadata update is allowed', async () => {
  const photo = {
    _id: new ObjectId(),
    title: 'Old',
    description: 'Old description',
    category: 'Culture',
    country: 'Nigeria',
    location: 'Lagos',
    tags: ['old'],
    photographer: '64c3b7d4bb0d9f0d0e5cf2a4',
    imageUrl: 'https://cloudinary.example.com/old.jpg',
    cloudinaryPublicId: 'afrolens/photos/old',
    save: jest.fn().mockResolvedValue(true),
  };

  const { PhotoModel } = createMockPhotoModel();
  PhotoModel.findById.mockResolvedValue(photo);
  photoService.setPhotoModel(PhotoModel);

  const updated = await photoService.updatePhoto({
    photoId: String(photo._id),
    user: { _id: '64c3b7d4bb0d9f0d0e5cf2a4' },
    updates: { title: 'New title' },
  });

  expect(updated.title).toBe('New title');
});

test('non-owner metadata update is rejected', async () => {
  const photo = {
    _id: new ObjectId(),
    photographer: '64c3b7d4bb0d9f0d0e5cf2a4',
    save: jest.fn(),
  };
  const { PhotoModel } = createMockPhotoModel();
  PhotoModel.findById.mockResolvedValue(photo);
  photoService.setPhotoModel(PhotoModel);

  await expect(photoService.updatePhoto({
    photoId: String(photo._id),
    user: { _id: '111111111111111111111111' },
    updates: { title: 'OK' },
  })).rejects.toMatchObject({ statusCode: 403 });
});

test('admin deletion is allowed', async () => {
  const photo = {
    _id: new ObjectId(),
    photographer: '64c3b7d4bb0d9f0d0e5cf2a4',
    cloudinaryPublicId: 'afrolens/photos/xyz',
  };
  const { PhotoModel } = createMockPhotoModel();
  PhotoModel.findById.mockResolvedValue(photo);
  PhotoModel.deleteOne.mockResolvedValue({ deletedCount: 1 });
  photoService.setPhotoModel(PhotoModel);

  const result = await photoService.deletePhoto({
    photoId: String(photo._id),
    user: { _id: '111111111111111111111111', role: 'admin' },
  });

  expect(result.deletedPhotoId).toBe(String(photo._id));
  expect(cleanupService.cleanupPhotoRelations).toHaveBeenCalled();
});

test('unauthorized deletion is rejected', async () => {
  const photo = {
    _id: new ObjectId(),
    photographer: '64c3b7d4bb0d9f0d0e5cf2a4',
    cloudinaryPublicId: 'afrolens/photos/xyz',
  };
  const { PhotoModel } = createMockPhotoModel();
  PhotoModel.findById.mockResolvedValue(photo);
  photoService.setPhotoModel(PhotoModel);

  await expect(photoService.deletePhoto({
    photoId: String(photo._id),
    user: { _id: '111111111111111111111111' },
  })).rejects.toMatchObject({ statusCode: 403 });
});

test('related-record cleanup is required', async () => {
  const photo = {
    _id: new ObjectId(),
    photographer: '64c3b7d4bb0d9f0d0e5cf2a4',
    cloudinaryPublicId: 'afrolens/photos/xyz',
  };
  const { PhotoModel } = createMockPhotoModel();
  PhotoModel.findById.mockResolvedValue(photo);
  photoService.setPhotoModel(PhotoModel);
  cleanupService.cleanupPhotoRelations.mockRejectedValue(new Error('cleanup failed'));

  await expect(photoService.deletePhoto({
    photoId: String(photo._id),
    user: { _id: '64c3b7d4bb0d9f0d0e5cf2a4' },
  })).rejects.toMatchObject({ statusCode: 503 });
});
