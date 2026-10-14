import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { WinleadPlusUser, MappingSuggestion, MappingEntry } from './gamification.dto';
import { WinleadPlusApiService } from './winleadplus-api.service';

@Injectable()
export class MappingService {
  private readonly logger = new Logger(MappingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly winleadPlusApi: WinleadPlusApiService,
  ) {}

  // ============================================================================
  // PROXY — Lister les users WinLead+
  // ============================================================================

  async getWinleadPlusUsers(token: string): Promise<WinleadPlusUser[]> {
    return this.winleadPlusApi.getUsers(token);
  }

  // ============================================================================
  // SUGGESTIONS — Proposer des mappings par nom + prénom normalisés
  // ============================================================================

  async getMappingSuggestions(token: string): Promise<MappingSuggestion[]> {
    const winleadUsers = await this.winleadPlusApi.getUsers(token);

    const [commercials, managers] = await Promise.all([
      this.prisma.commercial.findMany({
        where: { status: 'ACTIF' },
        select: { id: true, nom: true, prenom: true, email: true, winleadPlusId: true },
      }),
      this.prisma.manager.findMany({
        where: { status: 'ACTIF' },
        select: { id: true, nom: true, prenom: true, email: true, winleadPlusId: true },
      }),
    ]);

    const suggestions: MappingSuggestion[] = [];

    // Les admins WinLead+ signent aussi : candidats pour les deux types.
    const winleadCommercials = winleadUsers.filter((u) => ['COMMERCIAL', 'ADMIN'].includes(u.role));
    for (const commercial of commercials) {
      suggestions.push(this.buildSuggestion(commercial, 'COMMERCIAL', winleadCommercials));
    }

    const winleadManagers = winleadUsers.filter((u) => ['MANAGER', 'ADMIN'].includes(u.role));
    for (const manager of managers) {
      suggestions.push(this.buildSuggestion(manager, 'MANAGER', winleadManagers));
    }

    return suggestions;
  }

  // ============================================================================
  // CONFIRMER — Enregistrer les mappings validés par l'admin
  // ============================================================================

  async confirmMappings(
    mappings: MappingEntry[],
  ): Promise<{ mapped: number; skipped: number }> {
    let mapped = 0;
    let skipped = 0;

    for (const entry of mappings) {
      try {
        if (entry.type === 'COMMERCIAL') {
          await this.prisma.commercial.update({
            where: { id: entry.prowinId },
            data: { winleadPlusId: entry.winleadPlusId },
          });
        } else if (entry.type === 'MANAGER') {
          await this.prisma.manager.update({
            where: { id: entry.prowinId },
            data: { winleadPlusId: entry.winleadPlusId },
          });
        } else {
          skipped++;
          continue;
        }
        mapped++;
      } catch (error: any) {
        this.logger.warn(
          `Mapping échoué pour ${entry.type} #${entry.prowinId}: ${error.message}`,
        );
        skipped++;
      }
    }

    this.logger.log(`Mapping terminé: ${mapped} mappés, ${skipped} ignorés`);
    return { mapped, skipped };
  }

  // ============================================================================
  // SUPPRIMER — Retirer un mapping existant
  // ============================================================================

  async removeMapping(prowinId: number, type: string): Promise<boolean> {
    try {
      if (type === 'COMMERCIAL') {
        await this.prisma.commercial.update({
          where: { id: prowinId },
          data: { winleadPlusId: null },
        });
      } else if (type === 'MANAGER') {
        await this.prisma.manager.update({
          where: { id: prowinId },
          data: { winleadPlusId: null },
        });
      }
      return true;
    } catch (error: any) {
      this.logger.warn(
        `Suppression mapping échouée pour ${type} #${prowinId}: ${error.message}`,
      );
      return false;
    }
  }

  // ============================================================================
  // HELPERS — Logique de matching
  // ============================================================================

  private buildSuggestion(
    prowinUser: {
      id: number;
      nom: string;
      prenom: string;
      email: string | null;
      winleadPlusId: string | null;
    },
    type: string,
    winleadUsers: WinleadPlusUser[],
  ): MappingSuggestion {
    if (prowinUser.winleadPlusId) {
      const matched = winleadUsers.find((u) => u.id === prowinUser.winleadPlusId);
      return {
        prowinId: prowinUser.id,
        prowinNom: prowinUser.nom,
        prowinPrenom: prowinUser.prenom,
        prowinEmail: prowinUser.email ?? undefined,
        prowinType: type,
        winleadPlusId: prowinUser.winleadPlusId,
        winleadPlusNom: matched?.nom,
        winleadPlusPrenom: matched?.prenom,
        winleadPlusEmail: matched?.email,
        confidence: 100,
        alreadyMapped: true,
      };
    }

    const bestMatch = this.findBestMatch(prowinUser, winleadUsers, type);

    return {
      prowinId: prowinUser.id,
      prowinNom: prowinUser.nom,
      prowinPrenom: prowinUser.prenom,
      prowinEmail: prowinUser.email ?? undefined,
      prowinType: type,
      winleadPlusId: bestMatch?.user.id,
      winleadPlusNom: bestMatch?.user.nom,
      winleadPlusPrenom: bestMatch?.user.prenom,
      winleadPlusEmail: bestMatch?.user.email,
      confidence: bestMatch?.confidence,
      alreadyMapped: false,
    };
  }

  private findBestMatch(
    prowinUser: { nom: string; prenom: string; email: string | null },
    winleadUsers: WinleadPlusUser[],
    type: string,
  ): { user: WinleadPlusUser; confidence: number } | null {
    const prowinNom = this.normalize(prowinUser.nom);
    const prowinPrenom = this.normalize(prowinUser.prenom);

    let bestMatch: WinleadPlusUser | null = null;
    let bestConfidence = 0;

    for (const wUser of winleadUsers) {
      const wNom = this.normalize(wUser.nom);
      const wPrenom = this.normalize(wUser.prenom);
      let confidence = 0;

      // Match exact nom + prénom = 90%
      if (prowinNom === wNom && prowinPrenom === wPrenom) {
        confidence = 90;
      }
      // Match nom exact + prénom commence pareil = 70%
      else if (
        prowinNom === wNom &&
        (wPrenom.startsWith(prowinPrenom) || prowinPrenom.startsWith(wPrenom))
      ) {
        confidence = 70;
      }
      // Match par email si disponible = 95%
      if (
        prowinUser.email &&
        wUser.email &&
        prowinUser.email.toLowerCase() === wUser.email.toLowerCase()
      ) {
        confidence = 95;
      }
      //la condition ajoute pour un utilisateur qui a le compte gmail dans prowin et a 2 comptes gmail et winlead dans winlead plus
      // À égalité, le compte du même rôle l'emporte sur un compte admin homonyme.
      const sameRole = (u: WinleadPlusUser | null) => u?.role === type;
      if (confidence > bestConfidence ||
          (confidence === bestConfidence && sameRole(wUser) && !sameRole(bestMatch)) ||
          (confidence === bestConfidence && sameRole(wUser) === sameRole(bestMatch) &&
            wUser.email?.endsWith('@winleadplus.com'))) {
        bestConfidence = confidence;
        bestMatch = wUser;
      }
    }

    if (!bestMatch || bestConfidence < 50) return null;

    return { user: bestMatch, confidence: bestConfidence };
  }

  /**
   * Normalise un nom/prénom pour comparaison :
   * trim, lowercase, supprime accents, supprime caractères spéciaux
   */
  private normalize(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // accents
      .replace(/[^a-z0-9]/g, '');       // caractères spéciaux
  }
}
