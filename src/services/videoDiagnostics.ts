import axios from 'axios';

export type VideoFailureStage = 'eligibility' | 'permissions' | 'join-api' | 'call-status-api' | 'sdk-build' | 'sdk-join' | 'sdk-event';

export const videoDiagnostic = (stage: VideoFailureStage, failure: unknown): string => {
  const details = [`Stage: ${stage}`];
  if (axios.isAxiosError(failure)) {
    const status = failure.response?.status;
    if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599) {
      details.push(`HTTP: ${status}`);
    } else {
      details.push('HTTP: no response');
    }
    if (failure.code === 'ECONNABORTED' || failure.code === 'ETIMEDOUT') {
      details.push('Network: timeout');
    } else if (failure.code === 'ERR_NETWORK') {
      details.push('Network: unavailable');
    }
  } else if (stage === 'sdk-event' && failure && typeof failure === 'object' && 'code' in failure) {
    const code = failure.code;
    if (typeof code === 'number' && Number.isSafeInteger(code)) {
      details.push(`SDK code: ${code}`);
    }
    if ('isTerminal' in failure && typeof failure.isTerminal === 'boolean') {
      details.push(`Terminal: ${failure.isTerminal ? 'yes' : 'no'}`);
    }
  }
  return details.join(' | ');
};
