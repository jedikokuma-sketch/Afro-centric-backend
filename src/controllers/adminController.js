import {
  listUsers,
  updateUserAccountStatus,
  updateUserRole as updateUserRoleService,
  deleteAnyPhoto,
  deleteAnyComment,
} from '../services/adminService.js';

export async function getUsers(req, res, next) {
  try {
    const result = await listUsers(req.query);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateUserStatus(req, res, next) {
  try {
    const body = req.body;

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !Object.hasOwn(body, 'accountStatus')
    ) {
      const error = new Error(
        'Provide only accountStatus in the request body.',
      );
      error.statusCode = 400;
      throw error;
    }

    const user = await updateUserAccountStatus(
      req.params.userId,
      body.accountStatus,
    );

    return res.status(200).json({
      success: true,
      message: `User account ${user.accountStatus} successfully.`,
      data: { user },
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateUserRole(req, res, next) {
  try {
    const body = req.body;

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !Object.hasOwn(body, 'role')
    ) {
      const error = new Error(
        'Provide only role in the request body.',
      );
      error.statusCode = 400;
      throw error;
    }

    const user = await updateUserRoleService(
      req.params.userId,
      body.role,
    );

    return res.status(200).json({
      success: true,
      message: 'User role updated successfully.',
      data: { user },
    });
  } catch (error) {
    return next(error);
  }
}

export async function deleteAdminPhoto(req, res, next) {
  try {
    const result = await deleteAnyPhoto(
      req.params.photoId,
      req.user,
    );

    return res.status(200).json({
      success: true,
      message: 'Photo and related data deleted successfully.',
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

export async function deleteAdminComment(req, res, next) {
  try {
    const result = await deleteAnyComment(
      req.params.commentId,
      req.user,
    );

    return res.status(200).json({
      success: true,
      message: 'Comment deleted successfully.',
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}
