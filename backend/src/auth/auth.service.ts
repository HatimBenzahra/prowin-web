import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { LoginInput } from './dto/login.input';
import { AuthResponse } from './auth.types';
import { PrismaService } from '../prisma.service';
import { KeycloakAccessToken, verifyKeycloakToken } from './keycloak-jwt';

interface KeycloakTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
}

interface KeycloakUserInfo {
  sub: string;
  email?: string;
  family_name?: string;
  name?: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly KEYCLOAK_BASE_URL = process.env.KEYCLOAK_BASE_URL;
  private readonly REALM = process.env.KEYCLOAK_REALM;
  private readonly CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID!;
  private readonly CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET!;

  // Mapping des groupes Keycloak vers les rôles de l'application
  private readonly GROUP_TO_ROLE_MAP = {
    'Prospection-Admin': 'admin',
    'Prospection-Directeur': 'directeur',
    'Prospection-Manager': 'manager',
    'Prospection-Commercial': 'commercial',
  };

  // Groupes autorisés
  private readonly ALLOWED_GROUPS = [
    'Prospection-Admin',
    'Prospection-Directeur',
    'Prospection-Manager',
    'Prospection-Commercial',
  ];

  async login(loginInput: LoginInput): Promise<AuthResponse> {
    const { username, password } = loginInput;

    // Étape 1: Obtenir le token de Keycloak
    const params = new URLSearchParams();
    params.append('client_id', this.CLIENT_ID);
    params.append('client_secret', this.CLIENT_SECRET);
    params.append('grant_type', 'password');
    params.append('username', username);
    params.append('password', password);

    try {
      const response: AxiosResponse<KeycloakTokenResponse> = await axios.post(
        `${this.KEYCLOAK_BASE_URL}/realms/${this.REALM}/protocol/openid-connect/token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      return this.processAuthResponse(response.data);
    } catch (error: any) {
      // Si c'est une erreur de groupe non autorisé, la propager
      if (error instanceof ForbiddenException) {
        throw error;
      }

      // Sinon, erreur d'authentification Keycloak
      const message =
        error.response?.data?.error_description ||
        error.response?.data?.error ||
        'Login failed';

      Logger.error(
        'AuthService',
        "❌ Erreur d'authentification Keycloak:",
        message,
      );
      throw new UnauthorizedException(message);
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    const params = new URLSearchParams();
    params.append('client_id', this.CLIENT_ID);
    params.append('client_secret', this.CLIENT_SECRET);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);

    try {
      const response: AxiosResponse<KeycloakTokenResponse> = await axios.post(
        `${this.KEYCLOAK_BASE_URL}/realms/${this.REALM}/protocol/openid-connect/token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      return this.processAuthResponse(response.data);
    } catch (error: any) {
      // Si c'est une erreur de groupe non autorisé, la propager
      if (error instanceof ForbiddenException) {
        throw error;
      }

      const message =
        error.response?.data?.error_description ||
        error.response?.data?.error ||
        'Token refresh failed';

      Logger.error('AuthService', '❌ Erreur refresh token Keycloak:', message);
      throw new UnauthorizedException(message);
    }
  }

  private async processAuthResponse(
    tokenData: KeycloakTokenResponse,
  ): Promise<AuthResponse> {
    // Étape 2: Décoder le token pour extraire les groupes
    const decodedToken = await this.validateTokenWithKeycloak(
      tokenData.access_token,
    );
    // Log pour debug - afficher la structure complète du token
    Logger.debug(
      'AuthService',
      '🔍 Token décodé complet:',
      JSON.stringify(decodedToken, null, 2),
    );
    // Extraire les groupes (on va tester plusieurs emplacements possibles)
    const groups = this.extractGroups(decodedToken);

    Logger.debug('AuthService', '📋 Groupes extraits:', groups);

    // Étape 3: Valider que l'utilisateur a au moins un groupe autorisé
    const authorizedGroup = groups.find((group) =>
      this.ALLOWED_GROUPS.includes(group),
    );

    if (!authorizedGroup) {
      Logger.error(
        'AuthService',
        "❌ Aucun groupe autorisé trouvé. Groupes de l'utilisateur:",
        groups,
      );
      throw new ForbiddenException('UNAUTHORIZED_GROUP');
    }

    // Étape 4: Mapper le groupe vers un rôle
    const role = this.GROUP_TO_ROLE_MAP[authorizedGroup];

    Logger.debug(
      'AuthService',
      'Connexion réussie - Groupe:',
      authorizedGroup,
      '- Rôle:',
      role,
    );
    if (role === 'admin') {
      const userInfo = this.extractUserInfo(decodedToken);
      Logger.debug('AuthService', '✅ Admin authentifié:', userInfo.email);

      return {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type,
        groups,
        role,
        userId: 0,
        email: userInfo.email,
      };
    }
    // Étape 5: Créer ou récupérer l'utilisateur dans la BD locale
    const userInfo = this.extractUserInfo(decodedToken);
    const userId = await this.findOrCreateUser(userInfo, role);

    Logger.debug(
      'AuthService',
      '✅ Utilisateur synchronisé - ID:',
      userId,
      '- Email:',
      userInfo.email,
    );

    return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      token_type: tokenData.token_type,
      groups,
      role,
      userId,
      email: userInfo.email,
    };
  }

  /**
   * Valide un token Keycloak localement (signature JWKS, expiration, émetteur)
   */
  private async validateTokenWithKeycloak(
    token: string,
  ): Promise<KeycloakAccessToken> {
    try {
      return await verifyKeycloakToken(token);
    } catch (error) {
      Logger.error('AuthService', 'Erreur validation token Keycloak:', error);
      throw new UnauthorizedException('Impossible de valider le token');
    }
  }
  /**
   * Extrait les groupes du token décodé
   * Teste plusieurs emplacements possibles où Keycloak peut stocker les groupes
   */
  private extractGroups(decodedToken: any): string[] {
    // Emplacements possibles des groupes dans un token Keycloak
    const possiblePaths = [
      decodedToken['groups'], // Groupes au niveau racine (votre cas)
      decodedToken['realm_access']?.['roles'], // Rôles realm (fallback)
      decodedToken['resource_access']?.[this.CLIENT_ID]?.['roles'], // Rôles client (fallback)
    ];

    // Chercher le premier emplacement qui contient un tableau valide
    for (const groups of possiblePaths) {
      if (Array.isArray(groups) && groups.length > 0) {
        return groups;
      }
    }

    // Si aucun groupe trouvé, retourner tableau vide
    return [];
  }

  /**
   * Extrait les informations utilisateur du token décodé
   */
  private extractUserInfo(decodedToken: any): KeycloakUserInfo {
    const email = decodedToken.email || '';

    let nom = '';
    let prenom = '';

    // Priorité 1: Utiliser given_name et family_name s'ils existent
    if (decodedToken.given_name) {
      prenom = decodedToken.given_name;
    }
    if (decodedToken.family_name) {
      nom = decodedToken.family_name;
    }

    // Priorité 2: Si on n'a pas de given_name/family_name, parser le champ "name"
    if ((!nom || !prenom) && decodedToken.name) {
      const nameParts = decodedToken.name.trim().split(' ');
      if (nameParts.length > 1) {
        // Si on n'a pas de prénom, prendre le premier mot
        if (!prenom) {
          prenom = nameParts[0];
        }
        // Si on n'a pas de nom, prendre le reste
        if (!nom) {
          nom = nameParts.slice(1).join(' ');
        }
      } else {
        // Un seul mot dans "name" - l'utiliser pour ce qui manque
        if (!prenom && !nom) {
          prenom = decodedToken.name;
          nom = decodedToken.name;
        } else if (!prenom) {
          prenom = decodedToken.name;
        } else if (!nom) {
          nom = decodedToken.name;
        }
      }
    }

    // Si on n'a toujours pas de nom/prénom, utiliser l'email
    if (!nom) {
      Logger.error('AuthService', '❌ Nom vide');
    }
    if (!prenom) {
      Logger.error('AuthService', '❌ Prénom vide');
    }

    return {
      sub: decodedToken.sub,
      email,
      family_name: nom,
      name: prenom,
    };
  }

  /**
   * Trouve ou crée un utilisateur dans la base de données locale
   * selon son rôle et ses informations Keycloak
   */
  private async findOrCreateUser(
    userInfo: KeycloakUserInfo,
    role: string,
  ): Promise<number> {
    const email = userInfo.email;
    const prenom = userInfo.name || 'PrenomVide';
    const nom = userInfo.family_name || 'nomVide';

    Logger.debug(
      'AuthService',
      `🔍 Recherche de l'utilisateur: ${email} (${role})`,
    );

    try {
      switch (role) {
        case 'commercial': {
          // Chercher le commercial existant
          let commercial = await this.prisma.commercial.findUnique({
            where: { email },
          });

          // Si non trouvé, créer
          if (!commercial) {
            console.log(`📝 Création du commercial: ${prenom} ${nom}`);
            commercial = await this.prisma.commercial.create({
              data: {
                email,
                nom,
                prenom,
              },
            });
            Logger.debug(
              'AuthService',
              `✅ Commercial créé avec ID: ${commercial.id}`,
            );
          } else {
            Logger.debug(
              'AuthService',
              `✅ Commercial trouvé avec ID: ${commercial.id}`,
            );
          }

          return commercial.id;
        }

        case 'manager': {
          // Chercher le manager existant
          let manager = await this.prisma.manager.findUnique({
            where: { email },
          });

          // Si non trouvé, créer
          if (!manager) {
            console.log(`📝 Création du manager: ${prenom} ${nom}`);
            manager = await this.prisma.manager.create({
              data: {
                email,
                nom,
                prenom,
              },
            });
            Logger.debug(
              'AuthService',
              `✅ Manager créé avec ID: ${manager.id}`,
            );
          } else {
            Logger.debug(
              'AuthService',
              `✅ Manager trouvé avec ID: ${manager.id}`,
            );
          }

          return manager.id;
        }
        case 'directeur': {
          // Chercher le directeur existant
          let directeur = await this.prisma.directeur.findUnique({
            where: { email },
          });

          // Si non trouvé, créer
          if (!directeur) {
            console.log(`📝 Création du directeur: ${prenom} ${nom}`);
            directeur = await this.prisma.directeur.create({
              data: {
                email,
                nom,
                prenom,
              },
            });
            Logger.debug(
              'AuthService',
              `✅ Directeur créé avec ID: ${directeur.id}`,
            );
          } else {
            Logger.debug(
              'AuthService',
              `✅ Directeur trouvé avec ID: ${directeur.id}`,
            );
          }

          return directeur.id;
        }

        default:
          throw new UnauthorizedException('Rôle non reconnu');
      }
    } catch (error) {
      Logger.debug(
        'AuthService',
        '❌ Erreur lors de la création/recherche utilisateur:',
        error,
      );
      throw new UnauthorizedException('Erreur de synchronisation utilisateur');
    }
  }
}
