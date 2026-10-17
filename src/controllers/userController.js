import { getPublicUserProfile, updateUserProfile, updateUserProfilePicture } from '../services/userService.js';

export async function getPublicProfile(req, res, next) {
  try {
    const user = await getPublicUserProfile(req.params.userId);

    return res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateMyProfile(req, res, next) {
  try {
    const user = await updateUserProfile(req.user._id, req.body);

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      data: { user },
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateProfilePicture(req, res, next) {
  try {
    const user = await updateUserProfilePicture(
      req.user._id,
      req.file,
    );

    return res.status(200).json({
      success: true,
      message: 'Profile picture updated successfully.',
      data: { user },
    });
  } catch (error) {
    return next(error);
  }
}
