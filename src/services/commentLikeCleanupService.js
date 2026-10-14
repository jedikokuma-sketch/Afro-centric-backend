async function cleanupPhotoRelations(photoId) {
  throw new Error(
    'The shared comment/like cleanup service is not available yet. Provide a cleanupPhotoRelations(photoId) implementation that removes related comments and likes before a photo is deleted.'
  );
}

module.exports = {
  cleanupPhotoRelations,
};
