import { All, Controller, Next, Req, Res, UseGuards } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { KioskProxyService } from './kiosk-proxy.service';

/**
 * Pages Kiosk du web (appareils, releases, commandes) : réservées admin + directeur,
 * comme le reste de l'administration. Même authentification Keycloak que le GraphQL.
 */
@Controller('kiosk-api')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'directeur')
export class KioskProxyController {
  constructor(private readonly kioskProxy: KioskProxyService) {}

  @All('*path')
  forward(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ): void {
    this.kioskProxy.forward(req, res, next);
  }
}
