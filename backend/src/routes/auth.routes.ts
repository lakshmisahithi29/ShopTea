import { Router } from 'express';
import { register, login, logout, getMe, updateProfile } from '../controllers/auth.controller';
import { validateRequest } from '../middlewares/validate.middleware';
import { registerSchema, loginSchema, updateProfileSchema } from '../validations/auth.validation';
import { authLimiter } from '../middlewares/rateLimit.middleware';
import { requireAuth } from '../middlewares/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/register', authLimiter, validateRequest({ body: registerSchema }), asyncHandler(register));
router.post('/login', authLimiter, validateRequest({ body: loginSchema }), asyncHandler(login));
router.post('/logout', asyncHandler(logout));
router.get('/me', requireAuth, asyncHandler(getMe));
router.patch('/profile', requireAuth, validateRequest({ body: updateProfileSchema }), asyncHandler(updateProfile));

export default router;
