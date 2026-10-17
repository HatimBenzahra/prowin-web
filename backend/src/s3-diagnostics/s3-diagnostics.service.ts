import { Injectable } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { AsyncLocalStorage } from 'async_hooks';
import { S3DiagnosticsSnapshot } from './s3-diagnostics.dto';

type OperationStats = {
  source: string;
  operation: string;
  command: string;
  total: number;
  succeeded: number;
  failed: number;
  lastDurationMs?: number;
  lastAt?: Date;
};

@Injectable()
export class S3DiagnosticsService {
  private readonly operationContext = new AsyncLocalStorage<string>();
  private readonly operations = new Map<string, OperationStats>();
  private startedAt?: Date;
  private updatedAt?: Date;

  instrument(client: S3Client, source: string): S3Client {
    client.middlewareStack.add(
      (next, context) => async (args) => {
        const command = context.commandName || 'UnknownS3Command';
        const started = Date.now();
        const operation = this.operationContext.getStore() ?? source;

        try {
          const result = await next(args);
          this.record(source, operation, command, true, Date.now() - started);
          return result;
        } catch (error) {
          this.record(source, operation, command, false, Date.now() - started);
          throw error;
        }
      },
      {
        name: `s3Diagnostics${source.replace(/[^A-Za-z0-9_]/g, '')}`,
        step: 'finalizeRequest',
      },
    );

    return client;
  }

  runWithOperation<T>(
    operation: string,
    callback: () => Promise<T>,
  ): Promise<T> {
    return this.operationContext.run(operation, callback);
  }

  snapshot(): S3DiagnosticsSnapshot {
    const operations = Array.from(this.operations.values())
      .sort((a, b) =>
        a.source === b.source
          ? a.operation === b.operation
            ? a.command.localeCompare(b.command)
            : a.operation.localeCompare(b.operation)
          : a.source.localeCompare(b.source),
      )
      .map((operation) => ({ ...operation }));

    return {
      total: operations.reduce((sum, item) => sum + item.total, 0),
      succeeded: operations.reduce((sum, item) => sum + item.succeeded, 0),
      failed: operations.reduce((sum, item) => sum + item.failed, 0),
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
      operations,
    };
  }

  reset(): S3DiagnosticsSnapshot {
    this.operations.clear();
    this.startedAt = undefined;
    this.updatedAt = undefined;
    return this.snapshot();
  }

  private record(
    source: string,
    operation: string,
    command: string,
    succeeded: boolean,
    durationMs: number,
  ): void {
    const now = new Date();
    this.startedAt ??= now;
    this.updatedAt = now;

    const key = `${source}:${operation}:${command}`;
    const existing = this.operations.get(key) ?? {
      source,
      operation,
      command,
      total: 0,
      succeeded: 0,
      failed: 0,
    };

    existing.total += 1;
    if (succeeded) {
      existing.succeeded += 1;
    } else {
      existing.failed += 1;
    }
    existing.lastDurationMs = durationMs;
    existing.lastAt = now;

    this.operations.set(key, existing);
  }
}
