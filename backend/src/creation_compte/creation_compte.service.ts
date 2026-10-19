import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import {
  CreerUtilisateurInput,
  ReponseCreationUtilisateur,
  RoleUtilisateur,
  SupprimerUtilisateurInput,
  ReponseSupprimerUtilisateur,
  ModifierUtilisateurInput,
  ReponseModifierUtilisateur,
} from './creation_compte.dto';
import { PrismaService } from '../prisma.service';

@Injectable()
export class CreationCompteService {
  private readonly logger = new Logger(CreationCompteService.name);

  private readonly KEYCLOAK_BASE_URL = process.env.KEYCLOAK_BASE_URL!;
  private readonly REALM = process.env.KEYCLOAK_REALM!;
  private readonly ROLE_TO_GROUP: Record<RoleUtilisateur, string> = {
    [RoleUtilisateur.DIRECTEUR]: 'Prospection-Directeur',
    [RoleUtilisateur.MANAGER]: 'Prospection-Manager',
    [RoleUtilisateur.COMMERCIAL]: 'Prospection-Commercial',
  };

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================================
  // ENDPOINT: CRÉER UN UTILISATEUR
  // ============================================================================

  async creerCompteProWin(
    input: CreerUtilisateurInput,
    adminToken: string,
  ): Promise<ReponseCreationUtilisateur> {
    try {
      // 1. Generate username from nom.prenom.prowin
      const username = this.genererUsername(input.nom, input.prenom);

      // 2. Generate email if not provided (Keycloak rejette les accents)
      const email = this.nettoyerEmail(
        input.email || `${input.nom}.${input.prenom}@pro-win.app`,
      );

      // 3. Generate random password
      const password = this.genererMotDePasseAleatoire();

      // 4. Create user in Keycloak
      const userId = await this.creerUtilisateurKeycloak(adminToken, {
        username,
        email,
        firstName: input.prenom,
        lastName: input.nom,
        password,
      });

      // 5. Assign group based on role
      await this.assignerUtilisateurAuGroupe(
        adminToken,
        userId,
        this.ROLE_TO_GROUP[input.role],
      );

      // 6. Sync local database
      await this.synchroniserUtilisateurLocal({ ...input, email });

      this.logger.log(
        `✅ User ${username} (${email}) created with role ${input.role}`,
      );

      return { success: true, password, userId, email };
    } catch (error: any) {
      this.logger.error(`❌ Failed to create user: ${error.message}`);

      if (error.response?.status === 409) {
        throw new BadRequestException(
          'Un utilisateur avec cet email existe déjà',
        );
      }

      throw new BadRequestException(
        error.message || 'Erreur lors de la création du compte',
      );
    }
  }

  // ============================================================================
  // MÉTHODES PRIVÉES - BASE DE DONNÉES LOCALE
  // ============================================================================

  private async synchroniserUtilisateurLocal(
    input: CreerUtilisateurInput,
  ): Promise<void> {
    const { email, nom, prenom, role } = input;

    switch (role) {
      case RoleUtilisateur.COMMERCIAL:
        await this.prisma.commercial.upsert({
          where: { email },
          update: { nom, prenom },
          create: { email, nom, prenom },
        });
        return;
      case RoleUtilisateur.MANAGER:
        await this.prisma.manager.upsert({
          where: { email },
          update: { nom, prenom },
          create: { email, nom, prenom },
        });
        return;
      case RoleUtilisateur.DIRECTEUR:
        await this.prisma.directeur.upsert({
          where: { email },
          update: { nom, prenom },
          create: { email, nom, prenom },
        });
        return;
      default:
        this.logger.warn(`Rôle local non pris en charge: ${role}`);
    }
  }

  // ============================================================================
  // MÉTHODES PRIVÉES - HELPERS & GÉNÉRATION
  // ============================================================================

  private genererMotDePasseAleatoire(length = 12): string {
    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    return Array.from(crypto.randomBytes(length))
      .map((byte) => chars[byte % chars.length])
      .join('');
  }

  private sansAccents(valeur: string): string {
    return valeur
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Enlever les accents
  }

  private genererUsername(nom: string, prenom: string): string {
    // Garder seulement lettres et chiffres
    const cleanNom = this.sansAccents(nom).replace(/[^a-z0-9]/g, '');
    const cleanPrenom = this.sansAccents(prenom).replace(/[^a-z0-9]/g, '');

    return `${cleanNom}.${cleanPrenom}.prowin`;
  }

  private nettoyerEmail(email: string): string {
    // Garder seulement les caractères ASCII valides dans un email
    return this.sansAccents(email).replace(/[^a-z0-9._%+@-]/g, '');
  }

  // ============================================================================
  // MÉTHODES PRIVÉES - KEYCLOAK
  // ============================================================================

  private async creerUtilisateurKeycloak(
    token: string,
    user: {
      username: string;
      email: string;
      firstName: string;
      lastName: string;
      password: string;
    },
  ): Promise<string> {
    const response = await axios.post(
      `${this.KEYCLOAK_BASE_URL}/admin/realms/${this.REALM}/users`,
      {
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        enabled: true,
        emailVerified: true,
        credentials: [
          {
            type: 'password',
            value: user.password,
            temporary: false,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    // Get user ID from Location header
    const location = response.headers.location;
    return location.split('/').pop();
  }

  private async assignerUtilisateurAuGroupe(
    token: string,
    userId: string,
    groupName: string,
  ): Promise<void> {
    // Les groupes Prospection-* sont des sous-groupes de /Prospection
    // D'abord trouver le groupe parent "Prospection"
    const groupsResponse = await axios.get(
      `${this.KEYCLOAK_BASE_URL}/admin/realms/${this.REALM}/groups?search=Prospection`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const parentGroup = groupsResponse.data.find(
      (g: any) => g.name === 'Prospection',
    );
    if (!parentGroup) {
      throw new Error('Groupe parent Prospection non trouvé dans Keycloak');
    }

    // Récupérer les sous-groupes
    const childrenResponse = await axios.get(
      `${this.KEYCLOAK_BASE_URL}/admin/realms/${this.REALM}/groups/${parentGroup.id}/children`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const group = childrenResponse.data.find((g: any) => g.name === groupName);
    if (!group) {
      throw new Error(`Groupe ${groupName} non trouvé dans Keycloak`);
    }

    // Assigner l'utilisateur au groupe
    await axios.put(
      `${this.KEYCLOAK_BASE_URL}/admin/realms/${this.REALM}/users/${userId}/groups/${group.id}`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }

  // ============================================================================
  // ENDPOINT: SUPPRIMER UN UTILISATEUR
  // ============================================================================

  async supprimerUtilisateur(
    input: SupprimerUtilisateurInput,
    adminToken: string,
  ): Promise<ReponseSupprimerUtilisateur> {
    try {
      const { email } = input;

      // 1. Trouver l'utilisateur dans Keycloak par email
      const userId = await this.trouverUtilisateurKeycloakParEmail(
        adminToken,
        email,
      );

      if (!userId) {
        throw new BadRequestException('Utilisateur non trouvé dans Keycloak');
      }

      // 2. Supprimer l'utilisateur de Keycloak
      await this.supprimerUtilisateurKeycloak(adminToken, userId);

      // 3. Supprimer l'utilisateur de la base de données locale
      await this.supprimerUtilisateurLocal(email);

      this.logger.log(`✅ User ${email} deleted successfully`);

      return {
        success: true,
        message: 'Utilisateur supprimé avec succès',
      };
    } catch (error: any) {
      this.logger.error(`❌ Failed to delete user: ${error.message}`);
      throw new BadRequestException(
        error.message || "Erreur lors de la suppression de l'utilisateur",
      );
    }
  }

  // ============================================================================
  // ENDPOINT: MODIFIER UN UTILISATEUR
  // ============================================================================

  async modifierUtilisateur(
    input: ModifierUtilisateurInput,
    adminToken: string,
  ): Promise<ReponseModifierUtilisateur> {
    try {
      const { email, nouveauMotDePasse } = input;

      // 1. Trouver l'utilisateur dans Keycloak par email
      const userId = await this.trouverUtilisateurKeycloakParEmail(
        adminToken,
        email,
      );

      if (!userId) {
        throw new BadRequestException('Utilisateur non trouvé dans Keycloak');
      }

      // 2. Changer le mot de passe dans Keycloak
      await this.changerMotDePasseKeycloak(
        adminToken,
        userId,
        nouveauMotDePasse,
      );

      this.logger.log(`✅ Password changed for user ${email}`);

      return {
        success: true,
        message: 'Mot de passe modifié avec succès',
      };
    } catch (error: any) {
      this.logger.error(`❌ Failed to change password: ${error.message}`);
      throw new BadRequestException(
        error.message || 'Erreur lors de la modification du mot de passe',
      );
    }
  }

  private async trouverUtilisateurKeycloakParEmail(
    token: string,
    email: string,
  ): Promise<string | null> {
    try {
      const response = await axios.get(
        `${this.KEYCLOAK_BASE_URL}/admin/realms/${this.REALM}/users?email=${encodeURIComponent(email)}&exact=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.data && response.data.length > 0) {
        return response.data[0].id;
      }

      return null;
    } catch (error: any) {
      this.logger.error(
        `Erreur lors de la recherche de l'utilisateur: ${error.message}`,
      );
      throw error;
    }
  }

  private async supprimerUtilisateurKeycloak(
    token: string,
    userId: string,
  ): Promise<void> {
    await axios.delete(
      `${this.KEYCLOAK_BASE_URL}/admin/realms/${this.REALM}/users/${userId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
  }

  private async changerMotDePasseKeycloak(
    token: string,
    userId: string,
    nouveauMotDePasse: string,
  ): Promise<void> {
    await axios.put(
      `${this.KEYCLOAK_BASE_URL}/admin/realms/${this.REALM}/users/${userId}/reset-password`,
      {
        type: 'password',
        value: nouveauMotDePasse,
        temporary: false,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );
  }

  private async supprimerUtilisateurLocal(email: string): Promise<void> {
    // Tenter de supprimer de toutes les tables
    await Promise.all([
      this.prisma.commercial.deleteMany({ where: { email } }),
      this.prisma.manager.deleteMany({ where: { email } }),
      this.prisma.directeur.deleteMany({ where: { email } }),
    ]);
  }
}
