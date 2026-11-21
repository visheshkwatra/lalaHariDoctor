import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Alert, PermissionsAndroid, Text, TouchableOpacity } from 'react-native';
import { HMSSDK } from '@100mslive/react-native-hms';
import { VideoCallScreen } from '../src/screens/appointment/videoCallScreen';
import * as calls from '../src/services/videoCall';
import { RootStackParamList } from '../src/navigation/types';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AxiosError, AxiosHeaders } from 'axios';

type Props = NativeStackScreenProps<RootStackParamList, 'VideoCall'>;
const appointment: RootStackParamList['VideoCall']['appointment'] = {
  id: '18', source: 'live', canJoin: true, mode: 'video', status: 'scheduled',
  appointmentNumber: 'A18', date: '2026-10-18', startTime: '09:00', endTime: '09:30',
  consultationFee: '', patient: { name: 'Patient', age: null, gender: '', phone: '', symptoms: '' },
};

const credentials: calls.VideoJoin = {
  provider: '100ms', appointment_id: 18, room_id: 'room', role: 'doctor',
  user_id: 'user', auth_token: 'test-token', expires_in: 300,
  expires_at: '2099-01-01T00:00:00Z', call_id: 5, mode: 'video',
};

afterEach(() => jest.restoreAllMocks());

test('displays the safe stage and HTTP status when the join API fails', async () => {
  jest.spyOn(PermissionsAndroid, 'requestMultiple').mockImplementation(async (permissions) =>
    Object.fromEntries(permissions.map((permission) => [permission, PermissionsAndroid.RESULTS.GRANTED])) as
      Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>);
  jest.spyOn(calls, 'joinVideoAppointment').mockRejectedValue(new AxiosError(
    'Request failed', 'ERR_BAD_RESPONSE', { headers: new AxiosHeaders() }, undefined,
    { status: 503, statusText: 'Unavailable', data: { detail: 'Unavailable' }, headers: {}, config: { headers: new AxiosHeaders() } },
  ));
  const navigation = { addListener: jest.fn(() => jest.fn()), goBack: jest.fn() };
  const props = { navigation, route: { params: { appointment } } } as unknown as Props;
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { renderer = ReactTestRenderer.create(<VideoCallScreen {...props} />); });
  expect(renderer!.root.findAllByType(Text).some((text) =>
    JSON.stringify(text.props.children).includes('Stage: join-api | HTTP: 503'))).toBe(true);
  expect(HMSSDK.build).not.toHaveBeenCalled();
  await act(async () => { renderer!.unmount(); });
});

test('reports one start after SDK join and one end after successful leave', async () => {
  const listeners: Record<string, (event: never) => void> = {};
  const sdk = {
    addEventListener: jest.fn((name: string, callback: (event: never) => void) => { listeners[name] = callback; }),
    removeAllListeners: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
  };
  jest.mocked(HMSSDK.build).mockResolvedValue(sdk as unknown as HMSSDK);
  jest.spyOn(PermissionsAndroid, 'requestMultiple').mockImplementation(async (permissions) =>
    Object.fromEntries(permissions.map((permission) => [permission, PermissionsAndroid.RESULTS.GRANTED])) as
      Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>);
  jest.spyOn(calls, 'joinVideoAppointment').mockResolvedValue(credentials);
  jest.spyOn(calls, 'getVideoCallStatus').mockResolvedValue('unknown');
  const update = jest.spyOn(calls, 'updateVideoCall').mockResolvedValue(undefined);
  const navigation = { addListener: jest.fn(() => jest.fn()), goBack: jest.fn() };
  const props = { navigation, route: { params: { appointment } } } as unknown as Props;
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { renderer = ReactTestRenderer.create(<VideoCallScreen {...props} />); });
  expect(update).not.toHaveBeenCalled();
  const switchCamera = jest.fn();
  const localVideoTrack = { switchCamera, setMute: jest.fn(), isMute: () => false };
  const peer = {
    peerID: 'local', isLocal: true,
    localVideoTrack: () => localVideoTrack,
  };
  await act(async () => {
    listeners.ON_JOIN({ room: { localPeer: peer } } as never);
    listeners.ON_JOIN({ room: { localPeer: peer } } as never);
    listeners.RECONNECTING(undefined as never);
    listeners.RECONNECTED(undefined as never);
  });
  expect(update).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith('18', 5, expect.objectContaining({ status: 'in_progress' }));
  await act(async () => {
    renderer!.root.findByProps({ accessibilityLabel: 'Switch camera' }).props.onPress();
  });
  expect(switchCamera).toHaveBeenCalledTimes(1);
  const leave = renderer!.root.findAllByType(TouchableOpacity).find((button) =>
    button.findAllByType(Text).some((text) => text.props.children === 'Leave'));
  await act(async () => { leave!.props.onPress(); });
  expect(sdk.leave).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledTimes(2);
  expect(update).toHaveBeenLastCalledWith('18', 5, expect.objectContaining({ status: 'completed' }));
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
  await act(async () => { renderer!.unmount(); });
});

test('waiting to leave during join prevents a leaked session and does not report a failed leave as completed', async () => {
  const listeners: Record<string, (event: never) => void> = {};
  let resolveJoin: () => void = () => {};
  const joining = new Promise<void>((resolve) => { resolveJoin = resolve; });
  const sdk = {
    addEventListener: jest.fn((name: string, callback: (event: never) => void) => { listeners[name] = callback; }),
    removeAllListeners: jest.fn(),
    join: jest.fn().mockReturnValue(joining),
    leave: jest.fn().mockRejectedValue(new Error('leave failed')),
    destroy: jest.fn().mockResolvedValue(undefined),
  };
  jest.mocked(HMSSDK.build).mockResolvedValue(sdk as unknown as HMSSDK);
  jest.spyOn(PermissionsAndroid, 'requestMultiple').mockImplementation(async (permissions) =>
    Object.fromEntries(permissions.map((permission) => [permission, PermissionsAndroid.RESULTS.GRANTED])) as
      Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(calls, 'joinVideoAppointment').mockResolvedValue(credentials);
  jest.spyOn(calls, 'getVideoCallStatus').mockResolvedValue('unknown');
  const update = jest.spyOn(calls, 'updateVideoCall').mockResolvedValue(undefined);
  const navigation = { addListener: jest.fn(() => jest.fn()), goBack: jest.fn() };
  const props = { navigation, route: { params: { appointment } } } as unknown as Props;
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { renderer = ReactTestRenderer.create(<VideoCallScreen {...props} />); });
  const leave = renderer!.root.findAllByType(TouchableOpacity).find((button) =>
    button.findAllByType(Text).some((text) => text.props.children === 'Leave'));
  await act(async () => { leave!.props.onPress(); });
  expect(sdk.destroy).not.toHaveBeenCalled();
  await act(async () => {
    listeners.ON_JOIN({ room: { localPeer: { peerID: 'local', isLocal: true } } } as never);
    resolveJoin();
    await joining;
  });
  expect(sdk.leave).toHaveBeenCalledTimes(1);
  expect(sdk.destroy).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith('18', 5, expect.objectContaining({ status: 'in_progress' }));
  expect(Alert.alert).toHaveBeenCalledWith('Call error', expect.stringContaining('not recorded'));
  await act(async () => { renderer!.unmount(); });
});
