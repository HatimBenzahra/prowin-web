import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../prisma.service';
import { requestFromContext } from './request-from-context';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly KEYCLOAK_BASE_URL = process.env.KEYCLOAK_BASE_URL;
  private readonly REALM = process.env.KEYCLOAK_REALM;
  private readonly CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID as string;
  private readonly CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET as string;

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = requestFromContext(context);

    // Extraire le token du header Authorization
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('Token manquant');
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Token invalide');
    }

    try {
      // Valider le token avec Keycloak
      const decodedToken = await this.validateTokenWithKeycloak(token);

      // Extraire les groupes/rôles
      const groups = this.extractGroups(decodedToken);
      const role = this.mapGroupToRole(groups);
      const email = decodedToken.email || decodedToken.preferred_username;
      const userRecord = await this.resolveUserRecord(email, role);

      if (!userRecord) {
        throw new UnauthorizedException('User not provisioned');
      }

      // Attacher les informations utilisateur au contexte
      request.user = {
        sub: decodedToken.sub,
        email,
        groups,
        role,
        id: userRecord.id,
        userId: userRecord.id,
      };

      this.logger.debug(
        `✅ Utilisateur authentifié: ${request.user.email} (${request.user.role})`,
      );

      return true;
    } catch (error) {
      this.logger.error('❌ Erreur validation token:', error.message);
      throw new UnauthorizedException('Token invalide ou expiré');
    }
  }

  private async validateTokenWithKeycloak(token: string): Promise<any> {
    const params = new URLSearchParams();
    params.append('client_id', this.CLIENT_ID);
    params.append('client_secret', this.CLIENT_SECRET);
    params.append('token', token);

    try {
      const response = await axios.post(
        `${this.KEYCLOAK_BASE_URL}/realms/${this.REALM}/protocol/openid-connect/token/introspect`,
        params.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      if (!response.data.active) {
        throw new UnauthorizedException('Token expiré');
      }

      return response.data;
    } catch (error) {
      throw new UnauthorizedException('Impossible de valider le token');
    }
  }

  private extractGroups(decodedToken: any): string[] {
    return (
      decodedToken.groups ||
      decodedToken.realm_access?.roles ||
      decodedToken.resource_access?.[this.CLIENT_ID]?.roles ||
      []
    );
  }

  private mapGroupToRole(groups: string[]): string {
    const groupToRoleMap = {
      'Prospection-Admin': 'admin',
      'Prospection-Directeur': 'directeur',
      'Prospection-Manager': 'manager',
      'Prospection-Commercial': 'commercial',
    };

    for (const group of groups) {
      if (groupToRoleMap[group]) {
        return groupToRoleMap[group];
      }
    }

    throw new UnauthorizedException('Aucun rôle autorisé');
  }

  private async resolveUserRecord(
    email: string | undefined,
    role: string,
  ): Promise<{ id: number } | null> {
    if (!email) {
      this.logger.warn('JWT payload missing email, cannot resolve user record');
      return null;
    }

    switch (role) {
      case 'commercial':
        return this.prisma.commercial.findUnique({
          where: { email },
          select: { id: true },
        });
      case 'manager':
        return this.prisma.manager.findUnique({
          where: { email },
          select: { id: true },
        });
      case 'admin':
        this.logger.debug(`Admin authentifié: ${email}`);
        return { id: 0 };
      case 'directeur':
        return this.prisma.directeur.findUnique({
          where: { email },
          select: { id: true },
        });
      default:
        return null;
    }
  }
}
