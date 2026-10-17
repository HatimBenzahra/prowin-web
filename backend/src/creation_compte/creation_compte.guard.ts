import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { KeycloakAccessToken, verifyKeycloakToken } from '../auth/keycloak-jwt';

@Injectable()
export class CreationCompteGuard implements CanActivate {
  private readonly logger = new Logger(CreationCompteGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gqlContext = GqlExecutionContext.create(context);
    const ctx = gqlContext.getContext();
    const request = ctx.req;

    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('Token manquant');
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Token invalide');
    }

    try {
      const decodedToken = await this.validateTokenWithKeycloak(token);

      request.user = {
        sub: decodedToken.sub,
        email: decodedToken.email || decodedToken.preferred_username,
        token,
      };

      this.logger.debug(`✅ Utilisateur authentifié: ${request.user.email}`);

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error('❌ Erreur validation token:', error.message);
      throw new UnauthorizedException('Token invalide ou expiré');
    }
  }

  private async validateTokenWithKeycloak(
    token: string,
  ): Promise<KeycloakAccessToken> {
    try {
      return await verifyKeycloakToken(token);
    } catch {
      throw new UnauthorizedException('Impossible de valider le token');
    }
  }
}
