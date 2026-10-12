import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

/**
 * Client vLLM local (OpenAI-compatible). Appel backend-only.
 * Config via env : VLLM_BASE_URL (…/v1), VLLM_MODEL, VLLM_API_KEY, VLLM_TIMEOUT_MS.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  private readonly baseUrl = (process.env.VLLM_BASE_URL ?? '').replace(/\/+$/, '');
  private readonly model = process.env.VLLM_MODEL ?? '';
  private readonly apiKey = process.env.VLLM_API_KEY ?? '';
  // Public : entre dans le calcul du seuil de requeue "job bloqué" du coaching.
  readonly timeoutMs = Number(process.env.VLLM_TIMEOUT_MS ?? 120000);
  private readonly maxTokens = Number(process.env.VLLM_MAX_TOKENS ?? 4000);

  private readonly http: AxiosInstance = axios.create();

  isConfigured(): boolean {
    return this.baseUrl.length > 0 && this.model.length > 0;
  }

  /**
   * Envoie une conversation system/user et renvoie le contenu texte brut.
   * temperature 0 + response_format json_object pour un JSON stable.
   */
  async chatJson(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('vLLM non configuré (VLLM_BASE_URL / VLLM_MODEL absents)');
    }

    const url = `${this.baseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const body = {
      model: this.model,
      temperature: 0,
      max_tokens: this.maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    };

    this.logger.debug(`Appel vLLM model=${this.model} timeout=${this.timeoutMs}ms`);
    const resp = await this.http.post(url, body, {
      headers,
      timeout: this.timeoutMs,
    });

    const content: unknown = resp.data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('Réponse vLLM vide ou malformée');
    }
    return content;
  }
}
