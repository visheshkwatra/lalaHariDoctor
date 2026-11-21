import { api } from './api';

export interface VideoJoin {
  provider: '100ms';
  appointment_id: number;
  room_id: string;
  role: 'doctor';
  user_id: string;
  auth_token: string;
  expires_in: number;
  expires_at: string;
  call_id: number;
  mode: 'video';
}

export const joinVideoAppointment = async (id: string): Promise<VideoJoin> => {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    throw new Error('Only real appointments can start a video consultation.');
  }
  const { data } = await api.post<VideoJoin>(`/doctors/me/appointments/${id}/video/join/`, {});
  if (data?.provider !== '100ms' || data.mode !== 'video' || data.role !== 'doctor' ||
      data.appointment_id !== Number(id) || !Number.isSafeInteger(data.call_id) || data.call_id <= 0 ||
      typeof data.auth_token !== 'string' || !data.auth_token.trim() ||
      typeof data.room_id !== 'string' || !data.room_id.trim() ||
      typeof data.user_id !== 'string' || !data.user_id.trim() ||
      !Number.isFinite(data.expires_in) || data.expires_in <= 0 ||
      !Number.isFinite(Date.parse(data.expires_at)) || Date.parse(data.expires_at) <= Date.now()) {
    throw new Error('The server returned invalid or expired video call credentials.');
  }
  return data;
};

export const updateVideoCall = async (
  appointmentId: string,
  callId: number,
  update: { status: 'in_progress' | 'completed' | 'failed'; started_at?: string; ended_at?: string; end_reason?: string },
): Promise<void> => {
  await api.patch(`/doctors/me/appointments/${appointmentId}/calls/${callId}/`, update);
};

export const getVideoCallStatus = async (appointmentId: string, callId: number): Promise<'unknown' | 'in_progress'> => {
  const { data } = await api.get<{ calls: Array<{ id: number; status: string }> }>(
    `/doctors/me/appointments/${appointmentId}/`,
  );
  const call = Array.isArray(data?.calls) ? data.calls.find((item) => item.id === callId) : undefined;
  if (!call || (call.status !== 'unknown' && call.status !== 'in_progress')) {
    throw new Error('The video call attempt is no longer available. Please retry.');
  }
  return call.status;
};
