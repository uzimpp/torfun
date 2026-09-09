import { describe, expect, test } from 'bun:test';
import type { Env } from '../../config/env';
import { credentialsFromEnv } from './vertex-ai';

const key = {
  type: 'service_account',
  project_id: 'torfun-676767',
  client_email: 'torfun-api@torfun-676767.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIB...\n-----END PRIVATE KEY-----\n',
};

const env = (value?: string) => ({ GOOGLE_SERVICE_ACCOUNT_JSON: value }) as Env;

describe('credentialsFromEnv', () => {
  test('unset means ADC — the client must be left to resolve it itself', () => {
    // Returning an empty object here would override the Cloud Run runtime
    // service account with nothing, which is worse than not setting it.
    expect(credentialsFromEnv(env(undefined))).toBeUndefined();
    expect(credentialsFromEnv(env(''))).toBeUndefined();
    expect(credentialsFromEnv(env('   '))).toBeUndefined();
  });

  test('accepts the key as raw JSON', () => {
    expect(credentialsFromEnv(env(JSON.stringify(key)))?.credentials.client_email).toBe(
      key.client_email,
    );
  });

  test('accepts the key base64-encoded, which is what survives a .env file', () => {
    // A service-account key holds a multi-line PEM; raw JSON in a .env is why
    // this form exists.
    const encoded = Buffer.from(JSON.stringify(key)).toString('base64');
    expect(credentialsFromEnv(env(encoded))?.credentials.private_key).toBe(key.private_key);
  });

  test('tolerates the line breaks base64 tools insert', () => {
    const wrapped = Buffer.from(JSON.stringify(key)).toString('base64').replace(/(.{40})/g, '$1\n');
    expect(credentialsFromEnv(env(wrapped))?.credentials.client_email).toBe(key.client_email);
  });

  test('rubbish fails loudly at startup, not silently at the first TOR', () => {
    expect(() => credentialsFromEnv(env('not json and not base64 !!'))).toThrow(
      /neither JSON nor base64/,
    );
  });

  test('valid JSON that is not a service-account key is rejected by name', () => {
    expect(() => credentialsFromEnv(env(JSON.stringify({ hello: 'world' })))).toThrow(
      /client_email/,
    );
  });

  test('a key missing its private_key is rejected', () => {
    const { private_key: _omitted, ...rest } = key;
    expect(() => credentialsFromEnv(env(JSON.stringify(rest)))).toThrow(/private_key/);
  });
});
