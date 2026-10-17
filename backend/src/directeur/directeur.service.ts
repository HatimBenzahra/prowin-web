import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateDirecteurInput, UpdateDirecteurInput } from './directeur.dto';

@Injectable()
export class DirecteurService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateDirecteurInput) {
    return this.prisma.directeur.create({
      data,
      include: {
        managers: true,
        commercials: true,
      },
    });
  }

  async findAll(userId?: number, userRole?: string) {
    if (userId === undefined || !userRole) {
      return this.prisma.directeur.findMany({
        include: {
          managers: true,
          commercials: true,
          statistics: true,
        },
      });
    }

    switch (userRole) {
      case 'admin':
        return this.prisma.directeur.findMany({
          include: {
            managers: true,
            commercials: true,
            statistics: true,
          },
        });

      case 'directeur':
        return this.prisma.directeur.findMany({
          where: {
            id: userId,
          },
          include: {
            managers: true,
            commercials: true,
            statistics: true,
          },
        });

      case 'manager':
        return this.prisma.directeur.findMany({
          where: {
            managers: {
              some: {
                id: userId,
              },
            },
          },
          include: {
            managers: true,
            commercials: true,
            statistics: true,
          },
        });

      default:
        return [];
    }
  }

  async findOne(id: number, userId: number, userRole: string) {
    // Admin can access all directeurs
    if (userRole === 'admin') {
      return this.prisma.directeur.findUnique({
        where: { id },
        include: {
          managers: true,
          commercials: true,
          statistics: true,
        },
      });
    }

    // Get the directeur
    const directeur = await this.prisma.directeur.findUnique({
      where: { id },
      include: {
        managers: true,
        commercials: true,
        statistics: true,
      },
    });

    if (!directeur) {
      throw new NotFoundException('Directeur not found');
    }

    // Directeur can only access themselves
    if (userRole === 'directeur' && directeur.id !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return directeur;
  }

  async update(data: UpdateDirecteurInput, userId: number, userRole: string) {
    const { id, ...updateData } = data;

    // Only admin can update directeurs
    if (userRole !== 'admin') {
      throw new ForbiddenException('Only admin can update directeurs');
    }

    // Verify directeur exists
    const directeur = await this.prisma.directeur.findUnique({
      where: { id },
    });

    if (!directeur) {
      throw new NotFoundException('Directeur not found');
    }

    return this.prisma.directeur.update({
      where: { id },
      data: updateData,
      include: {
        managers: true,
        commercials: true,
      },
    });
  }

  async remove(id: number, userId: number, userRole: string) {
    // Only admin can delete directeurs
    if (userRole !== 'admin') {
      throw new ForbiddenException('Only admin can delete directeurs');
    }

    // Verify directeur exists
    const directeur = await this.prisma.directeur.findUnique({
      where: { id },
    });

    if (!directeur) {
      throw new NotFoundException('Directeur not found');
    }

    return this.prisma.directeur.delete({
      where: { id },
      include: {
        managers: true,
        commercials: true,
      },
    });
  }
}
