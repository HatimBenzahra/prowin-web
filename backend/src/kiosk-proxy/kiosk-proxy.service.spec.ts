import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { KioskProxyService } from './kiosk-proxy.service';

/** Ce que le faux serveur kiosk a reçu. */
interface KioskEcho {
  method: string;
  url: string;
  authorization: string | null;
  cookie: string | null;
  body: unknown;
}

/** Faux serveur kiosk : renvoie ce qu'il a reçu, pour vérifier le relais. */
function startFakeKiosk(): Promise<Server> {
  const kiosk = express();
  kiosk.use(express.json());
  kiosk.all('/{*path}', (req, res) => {
    const echo: KioskEcho = {
      method: req.method,
      url: req.originalUrl,
      authorization: req.headers.authorization ?? null,
      cookie: req.headers.cookie ?? null,
      body: req.body as unknown,
    };
    res.json(echo);
  });
  return new Promise((resolve) => {
    const server = kiosk.listen(0, () => resolve(server));
  });
}

/** Application ProWin minimale : body-parser JSON global, comme `main.ts`. */
function prowinApp(service: KioskProxyService) {
  const app = express();
  app.use(express.json());
  app.all('/kiosk-api/{*path}', (req, res, next) =>
    service.forward(req, res, next),
  );
  return app;
}

describe('KioskProxyService', () => {
  const env = { ...process.env };
  let kiosk: Server;

  beforeAll(async () => {
    kiosk = await startFakeKiosk();
    const { port } = kiosk.address() as AddressInfo;
    process.env.KIOSK_API_URL = `http://127.0.0.1:${port}`;
    process.env.KIOSK_API_USER = 'admin-kiosk';
    process.env.KIOSK_API_PASS = 'secret';
  });

  afterAll(() => {
    process.env = env;
    kiosk.close();
  });

  it('retire le préfixe et remplace le jeton ProWin par l’accès admin du kiosk', async () => {
    const app = prowinApp(new KioskProxyService());
    const res = await request(app)
      .get('/kiosk-api/api/devices?online=1')
      .set('Authorization', 'Bearer jeton-prowin')
      .set('Cookie', 'session=abc');
    const echo = res.body as KioskEcho;

    expect(res.status).toBe(200);
    expect(echo.url).toBe('/api/devices?online=1');
    expect(echo.authorization).toBe(
      `Basic ${Buffer.from('admin-kiosk:secret').toString('base64')}`,
    );
    expect(echo.cookie).toBeNull();
  });

  it('relaie un corps JSON déjà lu par le body-parser global', async () => {
    const app = prowinApp(new KioskProxyService());
    const res = await request(app)
      .post('/kiosk-api/api/devices/abc/command')
      .send({ action: 'lock' });
    const echo = res.body as KioskEcho;

    expect(echo.method).toBe('POST');
    expect(echo.body).toEqual({ action: 'lock' });
  });

  it('refuse proprement quand le serveur kiosk n’est pas configuré', () => {
    delete process.env.KIOSK_API_PASS;
    const service = new KioskProxyService();
    expect(() =>
      service.forward({} as never, {} as never, () => undefined),
    ).toThrow('Serveur kiosk non configuré');
    process.env.KIOSK_API_PASS = 'secret';
  });
});
