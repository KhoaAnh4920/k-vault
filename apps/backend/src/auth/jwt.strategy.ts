import {
  createParamDecorator,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import type { Request } from 'express';

/** Namespace used in Auth0 custom rules/actions for app-specific claims. */
const ROLES_CLAIM = 'https://k-vault/roles';

export interface AuthUser {
  userId: string;
  roles: string[];
}

interface JwtPayload {
  sub: string;
  iss: string;
  aud: string | string[];
  [key: string]: unknown;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${config.get<string>('AUTH0_DOMAIN')}/.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience: config.get<string>('AUTH0_AUDIENCE'),
      issuer: `https://${config.get<string>('AUTH0_DOMAIN')}/`,
      algorithms: ['RS256'],
    });
  }

  validate(payload: JwtPayload): AuthUser {
    const raw = (payload[ROLES_CLAIM] as string[] | undefined) ?? [];
    return {
      userId: payload.sub,
      roles: raw.map((r) => r.toLowerCase()),
    };
  }
}

/** Parameter decorator that extracts the authenticated user from the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
    return req.user;
  },
);
