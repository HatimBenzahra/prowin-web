import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { KioskProxyController } from './kiosk-proxy.controller';
import { KioskProxyService } from './kiosk-proxy.service';

@Module({
  controllers: [KioskProxyController],
  providers: [KioskProxyService, PrismaService],
})
export class KioskProxyModule {}
