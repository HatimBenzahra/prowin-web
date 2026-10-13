import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';

/** Préfixe de la route publique, retiré avant de relayer vers le serveur kiosk. */
export const KIOSK_PROXY_PREFIX = '/kiosk-api';

/**
 * Relais vers le serveur kiosk (OTA + MDM). Les identifiants admin du kiosk ne
 * vivent que côté serveur (`KIOSK_API_USER` / `KIOSK_API_PASS`) : le navigateur
 * s'authentifie auprès de ProWin, jamais auprès du kiosk.
 *
 * Relais en flux : l'upload d'un APK (multipart) passe sans être bufferisé.
 */
@Injectable()
export class KioskProxyService {
  private readonly logger = new Logger(KioskProxyService.name);
  private readonly handler: RequestHandler | null;

  constructor() {
    const target = process.env.KIOSK_API_URL;
    const user = process.env.KIOSK_API_USER;
    const pass = process.env.KIOSK_API_PASS;

    if (!target || !user || !pass) {
      this.logger.warn(
        'KIOSK_API_URL / KIOSK_API_USER / KIOSK_API_PASS absents : pages Kiosk indisponibles',
      );
      this.handler = null;
      return;
    }

    const basicAuth = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
    this.handler = createProxyMiddleware<Request, Response>({
      target,
      changeOrigin: true,
      pathRewrite: (path) => path.replace(KIOSK_PROXY_PREFIX, ''),
      on: {
        proxyReq: (proxyReq, req) => {
          // Remplace le jeton ProWin de l'utilisateur par l'accès admin du kiosk.
          proxyReq.setHeader('Authorization', basicAuth);
          proxyReq.removeHeader('cookie');
          // Le corps JSON a déjà été lu par le body-parser global : on le réécrit.
          fixRequestBody(proxyReq, req);
        },
      },
    });
  }

  forward(req: Request, res: Response, next: NextFunction): void {
    if (!this.handler) {
      throw new ServiceUnavailableException('Serveur kiosk non configuré');
    }
    void this.handler(req, res, next);
  }
}
