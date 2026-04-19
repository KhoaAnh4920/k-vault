import { SetMetadata } from '@nestjs/common';

export enum Role {
  ADMIN = 'admin',
  /** Regular authenticated user — personal vault, private uploads, share links. */
  MEMBER = 'member',
}

export const ROLES_KEY = 'roles';

/** Attach required roles to a route handler. Enforced by RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
