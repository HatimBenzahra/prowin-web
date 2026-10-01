/** Read only the authenticated HTTP request header; never store the credential. */
export interface BearerRequestContext {
  req?: { headers?: { authorization?: string | string[] } };
}

export function requestBearer(context?: BearerRequestContext): string | undefined {
  const header = context?.req?.headers?.authorization;
  return typeof header === 'string' ? /^Bearer\s+(\S+)$/i.exec(header.trim())?.[1] : undefined;
}
