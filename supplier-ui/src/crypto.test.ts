import { describe, it, expect } from 'vitest';
import nacl from 'tweetnacl';
import { canonicalize, signPayload } from './crypto';

describe('canonicalize', () => {
  it('sorts object keys alphabetically', () => {
    const input = { z: 1, a: 2, m: 3 };
    const result = new TextDecoder().decode(canonicalize(input));
    expect(result).toBe('{"a":2,"m":3,"z":1}');
  });

  it('deep-sorts nested object keys', () => {
    const input = { b: { z: 1, a: 2 }, a: 1 };
    const result = new TextDecoder().decode(canonicalize(input));
    expect(result).toBe('{"a":1,"b":{"a":2,"z":1}}');
  });

  it('preserves array element order', () => {
    const input = { items: [3, 1, 2] };
    const result = new TextDecoder().decode(canonicalize(input));
    expect(result).toBe('{"items":[3,1,2]}');
  });

  it('sorts keys inside array objects', () => {
    const input = { arr: [{ z: 1, a: 2 }] };
    const result = new TextDecoder().decode(canonicalize(input));
    expect(result).toBe('{"arr":[{"a":2,"z":1}]}');
  });

  it('removes whitespace (produces compact JSON)', () => {
    const input = { hello: 'world', nested: { foo: 'bar' } };
    const result = new TextDecoder().decode(canonicalize(input));
    expect(result).not.toContain(' ');
    expect(result).not.toContain('\n');
  });

  it('returns UTF-8 encoded Uint8Array', () => {
    const input = { emoji: '🍁' };
    const result = canonicalize(input);
    expect(result).toBeInstanceOf(Uint8Array);
    // UTF-8 encoding of 🍁 is 4 bytes
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toBe('{"emoji":"🍁"}');
  });

  it('handles null values', () => {
    const input = { a: null, b: 1 };
    const result = new TextDecoder().decode(canonicalize(input));
    expect(result).toBe('{"a":null,"b":1}');
  });

  it('handles boolean values', () => {
    const input = { isTrue: true, isFalse: false };
    const result = new TextDecoder().decode(canonicalize(input));
    expect(result).toBe('{"isFalse":false,"isTrue":true}');
  });

  it('produces identical output regardless of input key order', () => {
    const a = { x: 1, y: 2, z: 3 };
    const b = { z: 3, x: 1, y: 2 };
    expect(canonicalize(a)).toEqual(canonicalize(b));
  });
});

describe('signPayload', () => {
  it('returns hex-encoded signature of 128 characters (64 bytes)', () => {
    const payload = { test: 'data' };
    const { signature } = signPayload(payload);
    expect(signature).toHaveLength(128);
    expect(signature).toMatch(/^[0-9a-f]+$/);
  });

  it('returns hex-encoded publicKey of 64 characters (32 bytes)', () => {
    const payload = { test: 'data' };
    const { publicKey } = signPayload(payload);
    expect(publicKey).toHaveLength(64);
    expect(publicKey).toMatch(/^[0-9a-f]+$/);
  });

  it('generates a different keypair on each call', () => {
    const payload = { test: 'data' };
    const result1 = signPayload(payload);
    const result2 = signPayload(payload);
    expect(result1.publicKey).not.toBe(result2.publicKey);
  });

  it('produces a valid Ed25519 signature verifiable with the returned publicKey', () => {
    const payload = { hello: 'world', num: 42 };
    const { signature, publicKey } = signPayload(payload);

    // Convert hex back to bytes
    const sigBytes = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      sigBytes[i] = parseInt(signature.substring(i * 2, i * 2 + 2), 16);
    }
    const pubBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      pubBytes[i] = parseInt(publicKey.substring(i * 2, i * 2 + 2), 16);
    }

    // Verify the signature against the canonicalized payload
    const message = canonicalize(payload);
    const valid = nacl.sign.detached.verify(message, sigBytes, pubBytes);
    expect(valid).toBe(true);
  });

  it('signature verification fails if payload is modified', () => {
    const payload = { hello: 'world' };
    const { signature, publicKey } = signPayload(payload);

    const sigBytes = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      sigBytes[i] = parseInt(signature.substring(i * 2, i * 2 + 2), 16);
    }
    const pubBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      pubBytes[i] = parseInt(publicKey.substring(i * 2, i * 2 + 2), 16);
    }

    // Verify against a different payload
    const differentMessage = canonicalize({ hello: 'modified' });
    const valid = nacl.sign.detached.verify(differentMessage, sigBytes, pubBytes);
    expect(valid).toBe(false);
  });
});
