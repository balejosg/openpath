import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, adminProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { LoginDTOSchema, CreateUserDTOSchema } from '../../types/index.js';
import { AuthService } from '../../services/index.js';
import {
  readAccessTokenFromRequest,
  clearSessionCookies,
  readRefreshTokenFromRequest,
  setSessionCookies,
} from '../../lib/session-cookies.js';

const COOKIE_SESSION_MARKER = 'cookie-session';

export const authRouter = router({
  /**
   * Register a new user.
   * Public endpoint.
   */
  register: publicProcedure.input(CreateUserDTOSchema).mutation(async ({ input }) => {
    const result = await AuthService.register(input);
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return {
      user: result.data.user,
      verificationRequired: result.data.verificationRequired,
    };
  }),

  /**
   * Log in user and return JWT tokens.
   * Public endpoint.
   */
  login: publicProcedure.input(LoginDTOSchema).mutation(async ({ input, ctx }) => {
    const result = await AuthService.login(input.email, input.password);
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    const usingCookies = setSessionCookies(ctx.res, result.data);
    return usingCookies
      ? {
          ...result.data,
          accessToken: COOKIE_SESSION_MARKER,
          refreshToken: COOKIE_SESSION_MARKER,
        }
      : result.data;
  }),

  /**
   * Log in with Google ID token.
   * Public endpoint.
   */
  googleLogin: publicProcedure
    .input(z.object({ idToken: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const result = await AuthService.loginWithGoogle(input.idToken);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      const usingCookies = setSessionCookies(ctx.res, result.data);
      return usingCookies
        ? {
            ...result.data,
            accessToken: COOKIE_SESSION_MARKER,
            refreshToken: COOKIE_SESSION_MARKER,
          }
        : result.data;
    }),

  /**
   * Generate a new email verification token for an existing unverified user.
   * Public endpoint so SaaS wrappers can own delivery without teaching OpenPath about providers.
   */
  generateEmailVerificationToken: adminProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const result = await AuthService.generateEmailVerificationToken(input.email);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }),

  /**
   * Verify a user's email address with a token.
   * Public endpoint.
   */
  verifyEmail: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        token: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const result = await AuthService.verifyEmail(input.email, input.token);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }),

  /**
   * Refresh access token using refresh token.
   */
  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const refreshToken = input.refreshToken ?? readRefreshTokenFromRequest(ctx.req);
      if (!refreshToken) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Refresh token required' });
      }

      const result = await AuthService.refresh(refreshToken);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      const usingCookies = setSessionCookies(ctx.res, result.data);
      return usingCookies
        ? {
            ...result.data,
            accessToken: COOKIE_SESSION_MARKER,
            refreshToken: COOKIE_SESSION_MARKER,
          }
        : result.data;
    }),

  /**
   * Logout user.
   */
  logout: protectedProcedure
    .input(z.object({ refreshToken: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const bearerAccessToken =
        ctx.req.headers.authorization?.slice(7) ?? readAccessTokenFromRequest(ctx.req) ?? undefined;
      const refreshToken = input.refreshToken ?? readRefreshTokenFromRequest(ctx.req) ?? undefined;
      const result = await AuthService.logout(bearerAccessToken, refreshToken);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      clearSessionCookies(ctx.res);
      return result.data;
    }),

  /**
   * Get current user profile.
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const result = await AuthService.getProfile(ctx.user.sub);
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return result.data;
  }),

  /**
   * Generate password reset token (Admin only).
   */
  generateResetToken: adminProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const result = await AuthService.generateResetToken(input.email);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }),

  /**
   * Use token to reset password.
   */
  resetPassword: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        token: z.string(),
        newPassword: z.string().min(8),
      })
    )
    .mutation(async ({ input }) => {
      const result = await AuthService.resetPassword(input.email, input.token, input.newPassword);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }),

  /**
   * Change password for authenticated user.
   */
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await AuthService.changePassword(
        ctx.user.sub,
        input.currentPassword,
        input.newPassword
      );
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }),
});
