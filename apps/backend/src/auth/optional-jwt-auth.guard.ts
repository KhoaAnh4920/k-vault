import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * A JWT guard that does NOT reject unauthenticated requests.
 *
 * Behavior:
 * - If a valid Bearer token is present: populates req.user (AuthUser)
 * - If no token or invalid token: req.user = null (Guest access)
 *
 * Use this guard on routes that should be accessible to all users
 * (Guests, Members, Admins) but need role-aware behavior when a
 * token is present — e.g., GET /videos (US4: guests see public only).
 *
 * Do NOT use this guard on routes that require authentication.
 * Use JwtAuthGuard + RolesGuard for protected routes.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Override to suppress Passport errors and allow unauthenticated requests
  handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser {
    // If no user (missing/invalid token), return null instead of throwing
    // The route handler receives req.user = null → treated as Guest
    return user || (null as TUser);
  }

  // Override to prevent Passport from rejecting requests with no Authorization header
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // Swallow auth errors — guest access is intentional
    }
    return true;
  }
}
