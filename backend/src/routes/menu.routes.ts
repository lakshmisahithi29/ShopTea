import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { createMenuItem, getMenuItem, getMenuItems, updateMenuItem } from '../controllers/menu.controller';
import { menuItemSchema, menuListQuerySchema } from '../validations/menu.validation';

const router = Router();
router.get('/', requireAuth, validateRequest({ query: menuListQuerySchema }), asyncHandler(getMenuItems));
router.post('/', requireAuth, validateRequest({ body: menuItemSchema }), asyncHandler(createMenuItem));
router.get('/:id', requireAuth, asyncHandler(getMenuItem));
router.patch('/:id', requireAuth, validateRequest({ body: menuItemSchema }), asyncHandler(updateMenuItem));
export default router;
