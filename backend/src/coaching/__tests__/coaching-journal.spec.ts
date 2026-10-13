import {
  CoachingQueryService,
  parisDay,
} from '../lecture/coaching-query.service';
import { CoachingResolver } from '../coaching.resolver';
import { CoachingService } from '../coaching.service';
import { NotFoundException } from '@nestjs/common';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';

/** Journal des écoutes : 1 audio = 1 ligne, pagination par jours entiers, filtres. */
describe('coachingJournal', () => {
  const at = (iso: string) => new Date(iso);
  const porte = (id: number, extra: any = {}) => ({
    id,
    numero: String(100 + id),
    etage: 1,
    statut: 'ARGUMENTE',
    coachingFavori: false,
    immeubleId: id < 10 ? 1 : 2,
    immeuble: { adresse: id < 10 ? '12 rue Bobet' : '5 avenue Foch' },
    ...extra,
  });
  const seg = (
    id: number,
    key: string,
    createdAt: string,
    p: any,
    extra: any = {},
  ) => ({
    id,
    s3KeyOriginal: key,
    commercialId: 3,
    managerId: null,
    statut: null,
    durationSec: 60,
    createdAt: at(createdAt),
    porte: p,
    ...extra,
  });

  function fixture(
    segments: any[],
    analyses: any[] = [],
    commercials: any[] = [],
    archives: any[] = [],
  ) {
    const inRange = (s: any, where: any) => {
      const c = where.createdAt ?? {};
      const t = s.createdAt.getTime();
      if (c.gte && t < c.gte.getTime()) return false;
      if (c.lte && t > c.lte.getTime()) return false;
      if (c.lt && t >= c.lt.getTime()) return false;
      if (where.commercialId != null && s.commercialId !== where.commercialId)
        return false;
      if (where.managerId != null && s.managerId !== where.managerId)
        return false;
      return true;
    };
    const prisma: any = {
      recordingSegment: {
        aggregate: jest.fn(async ({ where }: any) => {
          const ts = segments
            .filter((s) => inRange(s, where))
            .map((s) => s.createdAt.getTime());
          return {
            _min: { createdAt: ts.length ? new Date(Math.min(...ts)) : null },
            _max: { createdAt: ts.length ? new Date(Math.max(...ts)) : null },
          };
        }),
        findMany: jest.fn(async ({ where }: any) =>
          segments.filter((s) => inRange(s, where)).sort((a, b) => a.id - b.id),
        ),
      },
      recording: {
        findMany: jest.fn(async ({ where }: any) =>
          where.s3Key.in.map((s3Key: string, i: number) => ({
            id: 1000 + i,
            s3Key,
          })),
        ),
      },
      coachingAnalysis: {
        findMany: jest.fn(async ({ where }: any) =>
          analyses.filter(
            (a) =>
              where.s3KeyOriginal.in.includes(a.s3KeyOriginal) &&
              where.referenceId === 7,
          ),
        ),
      },
      commercial: {
        findMany: jest.fn(async ({ where }: any) =>
          where.id.in.map(
            (id: number) =>
              commercials.find((c) => c.id === id) ?? {
                id,
                nom: 'Martin',
                prenom: 'Léa',
                status: 'ACTIF',
              },
          ),
        ),
      },
      manager: { findMany: jest.fn(async () => []) },
      coachingArchive: {
        findMany: jest.fn(async ({ where }: any) =>
          archives.filter((x) => where.s3Key.in.includes(x.s3Key)),
        ),
      },
    };
    const query = new CoachingQueryService(
      prisma,
      { getActive: async () => ({ id: 7 }) } as any,
      {} as any,
    );
    return { query, prisma };
  }

  const analysis = (key: string, extra: any = {}) => ({
    id: key.length,
    s3KeyOriginal: key,
    status: 'READY',
    quality: 'ANALYZED',
    score: 80,
    band: 'correct',
    executionScore: 82,
    outcomeScore: 6,
    visitResult: 'VENTE',
    nonSaleReason: null,
    productStatuses: [
      { key: 'purea', label: 'Purea', status: 'ACCEPTE', evidence: [] },
    ],
    transcriptDurationSec: 312,
    ...extra,
  });

  it('rend une ligne par audio, sur la porte du premier segment', async () => {
    const f = fixture(
      [
        seg(1, 'a.mp4', '2026-10-13T08:00:00Z', porte(1), {
          statut: 'CONTRAT_SIGNE',
        }),
        seg(2, 'a.mp4', '2026-10-13T08:00:00Z', porte(2), { durationSec: 90 }),
      ],
      [analysis('a.mp4')],
    );
    const page = await f.query.coachingJournal({});
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({
      s3Key: 'a.mp4',
      recordingId: 1000,
      day: '2026-10-13',
      porteId: 1,
      porteNumero: '101',
      statutPorte: 'CONTRAT_SIGNE',
      immeubleId: 1,
      adresse: '12 rue Bobet',
      subjectId: 3,
      subjectName: 'Léa Martin',
      subjectRole: 'commercial',
      durationSec: 312,
      analysis: {
        score: 80,
        band: 'correct',
        visitResult: 'VENTE',
        productStatuses: [{ key: 'purea', status: 'ACCEPTE' }],
      },
    });
    // Lots, pas de N+1 : une requête par table et par fenêtre.
    expect(f.prisma.coachingAnalysis.findMany).toHaveBeenCalledTimes(1);
    expect(f.prisma.commercial.findMany).toHaveBeenCalledTimes(1);
  });

  it('masque le score tant que l’analyse n’est pas prête, et ignore les utilisateurs de test', async () => {
    const f = fixture(
      [
        seg(1, 'a.mp4', '2026-10-13T08:00:00Z', porte(1)),
        seg(2, 'b.mp4', '2026-10-13T09:00:00Z', porte(2), { commercialId: 9 }),
      ],
      [analysis('a.mp4', { status: 'ANALYZING' })],
      [{ id: 9, nom: 'Test', prenom: 'Compte', status: 'UTILISATEUR_TEST' }],
    );
    const page = await f.query.coachingJournal({});
    expect(page.rows.map((r) => r.s3Key)).toEqual(['a.mp4']);
    expect(page.rows[0].analysis).toMatchObject({
      status: 'ANALYZING',
      score: null,
      executionScore: null,
    });
  });

  it('pagine par jours entiers, au-delà d’une fenêtre de 14 jours', async () => {
    const segments = [
      seg(1, 'j1-a.mp4', '2026-10-13T09:00:00Z', porte(1)),
      seg(2, 'j1-b.mp4', '2026-10-13T07:00:00Z', porte(2)),
      seg(3, 'j2.mp4', '2026-10-12T10:00:00Z', porte(3)),
      seg(4, 'j3.mp4', '2026-09-20T10:00:00Z', porte(4)),
    ];
    const f = fixture(segments);
    const first = await f.query.coachingJournal({ days: 1 });
    expect(first.days).toEqual(['2026-10-13']);
    expect(first.rows.map((r) => r.s3Key)).toEqual(['j1-a.mp4', 'j1-b.mp4']);
    expect(first.hasMore).toBe(true);
    expect(first.nextBefore).toBe('2026-10-13T07:00:00.000Z');

    const second = await f.query.coachingJournal({
      days: 2,
      before: new Date(first.nextBefore!),
    });
    expect(second.days).toEqual(['2026-10-12', '2026-09-20']);
    expect(second.hasMore).toBe(false);
    expect(second.nextBefore).toBeNull();
  });

  it('borne la période et filtre le sujet en base', async () => {
    const f = fixture([
      seg(1, 'in.mp4', '2026-10-10T09:00:00Z', porte(1)),
      seg(2, 'out.mp4', '2026-10-01T09:00:00Z', porte(2)),
      seg(3, 'other.mp4', '2026-10-10T10:00:00Z', porte(3), {
        commercialId: 4,
      }),
    ]);
    const page = await f.query.coachingJournal({
      dateFrom: at('2026-10-05T00:00:00Z'),
      dateTo: at('2026-10-13T23:59:59Z'),
      commercialId: 3,
    });
    expect(page.rows.map((r) => r.s3Key)).toEqual(['in.mp4']);
    expect(
      f.prisma.recordingSegment.findMany.mock.calls[0][0].where,
    ).toMatchObject({ commercialId: 3 });
  });

  it.each([
    [{ favorisOnly: true }, ['fav.mp4']],
    [{ nonAnalysesOnly: true }, []],
    [{ search: 'FOCH' }, ['foch.mp4']],
    [{ immeubleIds: [2, 5] }, ['foch.mp4']],
    // Adresse comparée sans casse, accents ni ponctuation.
    [{ search: 'avenue-FÔCH' }, ['foch.mp4']],
    [{ statutPorte: ['REFUS'] }, ['refus.mp4']],
    [{ visitResult: ['REFUS_CLIENT'] }, ['refus.mp4']],
    // Analyse antérieure au recalibrage : bande déduite du score (55 → insuffisant).
    [{ band: ['insuffisant'] }, ['refus.mp4']],
    [{ band: ['correct', 'maitrise'] }, ['foch.mp4']],
    // Inexploitable, ou ancienne analyse notée 0 sur un échange court : ⚪.
    [{ band: ['non_evaluable'] }, ['fav.mp4', 'court.mp4']],
    [{ productKey: 'purea' }, ['refus.mp4', 'foch.mp4']],
    [{ productKey: 'purea', productAcceptedOnly: true }, ['foch.mp4']],
  ])('filtre %j', async (filter, expected) => {
    const f = fixture(
      [
        seg(
          1,
          'fav.mp4',
          '2026-10-13T10:00:00Z',
          porte(1, { coachingFavori: true }),
        ),
        seg(
          2,
          'refus.mp4',
          '2026-10-13T09:00:00Z',
          porte(2, { statut: 'REFUS' }),
        ),
        seg(11, 'foch.mp4', '2026-10-13T08:00:00Z', porte(11)),
        seg(12, 'court.mp4', '2026-10-13T07:00:00Z', porte(3)),
      ],
      [
        analysis('refus.mp4', {
          id: 1,
          band: null,
          score: 55,
          visitResult: 'REFUS_CLIENT',
          productStatuses: [{ key: 'purea', status: 'REFUSE' }],
        }),
        analysis('foch.mp4', { id: 2 }),
        analysis('fav.mp4', {
          id: 3,
          quality: 'INEXPLOITABLE',
          score: null,
          band: null,
          productStatuses: [],
        }),
        analysis('court.mp4', {
          id: 4,
          quality: 'LOW_CONFIDENCE',
          score: 0,
          band: null,
          productStatuses: [],
        }),
      ],
    );
    const page = await f.query.coachingJournal(filter as any);
    expect(page.rows.map((r) => r.s3Key)).toEqual(expected);
  });

  it('jour calendaire de Paris', () => {
    expect(parisDay(at('2026-10-12T22:30:00Z'))).toBe('2026-10-13');
    expect(parisDay(at('2026-10-12T21:30:00Z'))).toBe('2026-10-12');
  });

  it('masque les archivés par défaut, ne montre qu’eux avec archived=only', async () => {
    const segments = [
      seg(1, 'garde.mp4', '2026-10-13T10:00:00Z', porte(1)),
      seg(2, 'archive.mp4', '2026-10-13T09:00:00Z', porte(2)),
    ];
    const archives = [
      { s3Key: 'archive.mp4', archivedAt: at('2026-10-13T12:00:00Z') },
    ];
    const f = fixture(segments, [], [], archives);
    const hidden = await f.query.coachingJournal({});
    expect(hidden.rows.map((r) => [r.s3Key, r.archived])).toEqual([
      ['garde.mp4', false],
    ]);
    const only = await f.query.coachingJournal({ archived: 'only' });
    expect(only.rows).toHaveLength(1);
    expect(only.rows[0]).toMatchObject({
      s3Key: 'archive.mp4',
      archived: true,
      archivedAt: '2026-10-13T12:00:00.000Z',
    });
  });

  it('même périmètre que la liste de gestion', () => {
    const roles = (m: string) =>
      Reflect.getMetadata(ROLES_KEY, (CoachingResolver.prototype as any)[m]);
    expect(roles('coachingJournal')).toEqual(roles('coachingManagementList'));
    expect(roles('coachingJournal')).toEqual(['admin', 'directeur']);
    expect(roles('setCoachingArchive')).toEqual(roles('coachingJournal'));
  });
});

describe('setCoachingArchive', () => {
  function fixture(known = true) {
    const prisma: any = {
      recordingSegment: {
        findFirst: jest.fn(async () => (known ? { id: 1 } : null)),
      },
      coachingArchive: {
        upsert: jest.fn(async () => ({})),
        deleteMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const service = new CoachingService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, prisma };
  }

  it('archive en traçant qui, sans écraser une archive existante', async () => {
    const f = fixture();
    await expect(
      f.service.setCoachingArchive('a.mp4', true, {
        id: 2,
        role: 'directeur',
        email: ' dir@prowin.fr ',
      }),
    ).resolves.toBe(true);
    expect(f.prisma.coachingArchive.upsert).toHaveBeenCalledWith({
      where: { s3Key: 'a.mp4' },
      create: { s3Key: 'a.mp4', archivedBy: 'dir@prowin.fr' },
      update: {},
    });
    await f.service.setCoachingArchive('a.mp4', true, { id: 1, role: 'admin' });
    expect(
      f.prisma.coachingArchive.upsert.mock.calls[1][0].create.archivedBy,
    ).toBe('admin#1');
  });

  it('désarchive en supprimant la ligne', async () => {
    const f = fixture();
    await expect(
      f.service.setCoachingArchive('a.mp4', false, { id: 1, role: 'admin' }),
    ).resolves.toBe(false);
    expect(f.prisma.coachingArchive.deleteMany).toHaveBeenCalledWith({
      where: { s3Key: 'a.mp4' },
    });
  });

  it('refuse un audio inconnu du journal', async () => {
    const f = fixture(false);
    await expect(
      f.service.setCoachingArchive('x.mp4', true, { id: 1, role: 'admin' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(f.prisma.coachingArchive.upsert).not.toHaveBeenCalled();
  });
});
