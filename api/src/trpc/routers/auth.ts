import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, adminProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { LoginDTOSchema, CreateUserDTOSchema } from '../../types/index.js';
import { AuthService } from '../../services/index.js';

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
    return result.data;
  }),

  /**
   * Log in user and return JWT tokens.
   * Public endpoint.
   */
  login: publicProcedure.input(LoginDTOSchema).mutation(async ({ input }) => {
    const result = await AuthService.login(input.email, input.password);
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return result.data;
  }),

  /**
   * Log in with Google ID token.
   * Public endpoint.
   */
  googleLogin: publicProcedure
    .input(z.object({ idToken: z.string() }))
    .mutation(async ({ input }) => {
      const result = await AuthService.loginWithGoogle(input.idToken);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }),

  /**
   * Refresh access token using refresh token.
   */
  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ input }) => {
      const result = await AuthService.refresh(input.refreshToken);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }),

  /**
   * Logout user.
   */
  logout: protectedProcedure
    .input(z.object({ refreshToken: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const accessToken = ctx.req.headers.authorization?.slice(7);
      const result = await AuthService.logout(accessToken, input.refreshToken);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
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
});
