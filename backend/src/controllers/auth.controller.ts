import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { signAuthToken, getAuthCookieOptions, getClearedAuthCookieOptions } from '../utils/token';
import { toSafeUser } from '../utils/safeUser';
import { RegisterInput, LoginInput, UpdateProfileInput } from '../validations/auth.validation';

const DUMMY_PASSWORD_HASH = bcrypt.hashSync('invalid-user-timing-placeholder', 10);

// ─── register ────────────────────────────────────────────────────────────────

export async function register(req: Request, res: Response): Promise<void> {
  const { username, email, password } = req.body as RegisterInput;

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email }],
    },
  });

  if (existingUser) {
    if (existingUser.username === username) {
      res.status(409).json({
        success: false,
        message: 'Username is already taken. Please choose another.',
      });
      return;
    }

    if (existingUser.email === email) {
      res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
      return;
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        isEmailVerified: true,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(',')
        : String(error.meta?.target ?? '');

      res.status(409).json({
        success: false,
        message: target.includes('email')
          ? 'An account with this email already exists.'
          : 'Username is already taken. Please choose another.',
      });
      return;
    }
    throw error;
  }

  res.status(201).json({
    success: true,
    message: 'Account created successfully. You can now sign in.',
  });
}

// ─── login ───────────────────────────────────────────────────────────────────

export async function login(req: Request, res: Response): Promise<void> {
  const { identifier, password } = req.body as LoginInput;

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username: identifier }, { email: identifier }],
    },
    include: { shop: true },
  });

  const isPasswordValid = await bcrypt.compare(password, user?.password ?? DUMMY_PASSWORD_HASH);

  if (!user || !isPasswordValid) {
    res.status(401).json({
      success: false,
      message: 'Invalid credentials',
    });
    return;
  }

  const authToken = signAuthToken({
    userId: user.id,
    username: user.username,
    email: user.email,
    shopId: user.shopId,
  });

  res.cookie('token', authToken, getAuthCookieOptions());

  res.status(200).json({
    success: true,
    message: 'Logged in successfully',
    user: toSafeUser(user),
  });
}

// ─── logout ──────────────────────────────────────────────────────────────────

export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie('token', getClearedAuthCookieOptions());

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
}

// ─── getMe ───────────────────────────────────────────────────────────────────

export async function getMe(req: Request, res: Response): Promise<void> {
  res.status(200).json({
    success: true,
    user: req.user,
  });
}

// ─── updateProfile ───────────────────────────────────────────────────────────

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const { name } = req.body as UpdateProfileInput;
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { name },
    include: { shop: true },
  });
  res.status(200).json({
    success: true,
    message: 'Profile updated successfully.',
    user: toSafeUser(user),
  });
}