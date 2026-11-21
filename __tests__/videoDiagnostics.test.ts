import { AxiosError, AxiosHeaders } from 'axios';
import { videoDiagnostic } from '../src/services/videoDiagnostics';

test('shows only stage and HTTP status, never response content or request credentials', () => {
  const error = new AxiosError('sensitive-token', 'ERR_BAD_RESPONSE',
    { headers: new AxiosHeaders({ Authorization: 'Bearer sensitive-token' }) },
    undefined, {
      status: 503, statusText: 'Unavailable',
      data: { detail: 'sensitive patient data', auth_token: 'sensitive-token' },
      headers: {}, config: { headers: new AxiosHeaders() },
    });
  expect(videoDiagnostic('join-api', error)).toBe('Stage: join-api | HTTP: 503');
});

test('distinguishes network errors and safe SDK error codes', () => {
  expect(videoDiagnostic('join-api', new AxiosError('private', 'ERR_NETWORK')))
    .toBe('Stage: join-api | HTTP: no response | Network: unavailable');
  expect(videoDiagnostic('sdk-event', { code: 1234, isTerminal: true, description: 'private' }))
    .toBe('Stage: sdk-event | SDK code: 1234 | Terminal: yes');
  expect(videoDiagnostic('sdk-event', { code: 'secret', isTerminal: false }))
    .toBe('Stage: sdk-event | Terminal: no');
});
