import axios from 'axios';
import { CoachingApiClient, CoachingStageError } from '../coaching-api.client';
jest.mock('axios');

describe('stage client transport boundary', () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; jest.resetAllMocks(); });
  it.each(['Infinity', 'NaN', '-1', '0', '999999999'])('bounds invalid timeout %s', value => {
    process.env.COACHING_TRANSCRIBE_TIMEOUT_MS = value;
    process.env.COACHING_EVALUATE_TIMEOUT_MS = value;
    const api = new CoachingApiClient();
    expect(api.timeoutMs).toBe(5_880_000); expect(api.evaluationTimeoutMs).toBe(600_000);
  });
  it('maps admission and timeout to precise codes without signed URLs or headers', async () => {
    const api = new CoachingApiClient();
    const secret = { message: 'https://signed.invalid/?secret=credential', config: { headers: { Authorization: 'secret' } } };
    jest.mocked(axios.isAxiosError).mockReturnValue(true);
    jest.mocked(axios.post).mockRejectedValueOnce({ ...secret, response: { status: 429, headers: { 'retry-after': '60' } } });
    await expect(api.transcribe({} as any)).rejects.toMatchObject({ code: 'STT_BUSY', retryAfterMs: 60_000 });
    jest.mocked(axios.post).mockRejectedValueOnce({ ...secret, code: 'ECONNABORTED' });
    try { await api.transcribe({} as any); throw new Error('Expected timeout'); }
    catch (error) { expect(error).toBeInstanceOf(CoachingStageError); expect((error as CoachingStageError).code).toBe('STT_TIMEOUT'); expect(String(error)).not.toContain('secret'); }
  });
});
