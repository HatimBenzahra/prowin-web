import type { ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext, type GqlContextType } from '@nestjs/graphql';
import type { Request } from 'express';

/** Utilisateur posé sur la requête par `JwtAuthGuard`. */
export interface AuthenticatedUser {
  sub: string;
  email: string;
  groups: string[];
  role: string;
  id: number;
  userId: number;
}

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

/**
 * Requête HTTP portée par le contexte, qu'il s'agisse d'un resolver GraphQL ou
 * d'un contrôleur REST : les guards d'authentification servent aux deux.
 */
export function requestFromContext(
  context: ExecutionContext,
): AuthenticatedRequest {
  return context.getType<GqlContextType>() === 'graphql'
    ? GqlExecutionContext.create(context).getContext<{
        req: AuthenticatedRequest;
      }>().req
    : context.switchToHttp().getRequest<AuthenticatedRequest>();
}
