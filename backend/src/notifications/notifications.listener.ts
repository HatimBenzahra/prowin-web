import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Client } from 'pg';
import { UserType } from '@prisma/client';
import { NotificationsService } from './notifications.service';

type ZoneEnCoursChange = {
  op: 'INSERT' | 'DELETE';
  id: number;
  userId: number;
  userType: UserType;
  zoneId: number;
};

const CHANNEL = 'zone_en_cours_change';
const RECONNECT_DELAY_MS = 5_000;
// Fenêtre pour collapser une réassignation (DELETE de l'ancienne + INSERT de la
// nouvelle assignation d'un même utilisateur) en un seul event (last-write-wins).
const DEBOUNCE_MS = 400;

/**
 * Écoute les changements de la table ZoneEnCours via Postgres LISTEN/NOTIFY
 * (canal alimenté par le trigger `zone_en_cours_change_trigger`) et déclenche
 * l'envoi des notifications aux utilisateurs concernés.
 *
 * Connexion `pg` dédiée (hors pool Prisma, qui n'expose pas LISTEN). Reconnexion
 * automatique. NB : nécessite une connexion session (pas de pgbouncer en mode
 * transaction) — utiliser DIRECT_URL si DATABASE_URL passe par un pooler.
 */
@Injectable()
export class NotificationsListenerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationsListenerService.name);
  private client: Client | null = null;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly pending = new Map<string, ZoneEnCoursChange>();
  private readonly flushTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly notifications: NotificationsService) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.flushTimers.forEach((t) => clearTimeout(t));
    this.flushTimers.clear();
    await this.client?.end().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;

    const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      this.logger.error(
        'DATABASE_URL/DIRECT_URL manquant : listener de notifications désactivé',
      );
      return;
    }

    const client = new Client({ connectionString });
    this.client = client;

    client.on('error', (err) => {
      this.logger.error('Erreur de la connexion listener PG', err);
      this.scheduleReconnect();
    });
    client.on('end', () => {
      if (!this.stopped) this.scheduleReconnect();
    });
    client.on('notification', (msg) =>
      this.handleRaw(msg.channel, msg.payload),
    );

    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      this.logger.log(`LISTEN ${CHANNEL} actif`);
    } catch (err) {
      this.logger.error('Connexion du listener PG échouée', err as Error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const client = this.client;
    this.client = null;
    void client?.end().catch(() => undefined);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private handleRaw(channel: string, payload?: string): void {
    if (channel !== CHANNEL || !payload) return;
    let change: ZoneEnCoursChange;
    try {
      const parsed = JSON.parse(payload);
      change = {
        op: parsed.op === 'DELETE' ? 'DELETE' : 'INSERT',
        id: Number(parsed.id),
        userId: Number(parsed.userId),
        userType: parsed.userType as UserType,
        zoneId: Number(parsed.zoneId),
      };
    } catch {
      this.logger.warn(`Payload NOTIFY illisible: ${payload}`);
      return;
    }

    // Debounce par destinataire : le dernier event de la fenêtre gagne (une
    // réassignation = DELETE puis INSERT ⇒ on ne garde que l'INSERT final).
    const key = `${change.userId}:${change.userType}`;
    this.pending.set(key, change);
    const existing = this.flushTimers.get(key);
    if (existing) clearTimeout(existing);
    this.flushTimers.set(
      key,
      setTimeout(() => this.flush(key), DEBOUNCE_MS),
    );
  }

  private flush(key: string): void {
    this.flushTimers.delete(key);
    const change = this.pending.get(key);
    this.pending.delete(key);
    if (!change) return;

    void this.notifications
      .notifyZoneChange(
        change.op,
        change.userId,
        change.userType,
        change.zoneId,
      )
      .catch((err) =>
        this.logger.error('notifyZoneChange a échoué', err as Error),
      );
  }
}
