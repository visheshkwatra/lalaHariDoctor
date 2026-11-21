import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, PermissionsAndroid, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  HMSConfig, HMSException, HMSLocalPeer, HMSPeer, HMSPeerUpdate, HMSRoom, HMSSDK,
  HMSTrack, HMSTrackType, HMSTrackUpdate, HMSUpdateListenerActions,
} from '@100mslive/react-native-hms';
import { RootStackParamList } from '../../navigation/types';
import { Colors } from '../../constants/colors';
import { useDoctorStore } from '../../services/useDoctorStore';
import { getVideoCallStatus, joinVideoAppointment, updateVideoCall, VideoJoin } from '../../services/videoCall';
import { getApiErrorMessage } from '../../services/api';
import { videoDiagnostic, VideoFailureStage } from '../../services/videoDiagnostics';

type Props = NativeStackScreenProps<RootStackParamList, 'VideoCall'>;
type Tile = { peer: HMSPeer; track?: HMSTrack };

export const VideoCallScreen: React.FC<Props> = ({ navigation, route }) => {
  const { appointment } = route.params;
  const doctorName = useDoctorStore((state) => state.profile.fullName) || 'Doctor';
  const [sdk, setSdk] = useState<HMSSDK | null>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [status, setStatus] = useState('Preparing video call...');
  const [error, setError] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const sdkRef = useRef<HMSSDK | null>(null);
  const localRef = useRef<HMSLocalPeer | null>(null);
  const credentials = useRef<VideoJoin | null>(null);
  const connected = useRef(false);
  const ended = useRef(false);
  const startedAt = useRef<string | null>(null);
  const reporting = useRef<Promise<void>>(Promise.resolve());
  const leaveRef = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;
    let cancelled = false;
    let instance: HMSSDK | null = null;
    let joinPromise: Promise<void> | null = null;
    let finishPromise: Promise<void> | null = null;
    let allowNavigation = false;
    let removed = false;
    let reportingFailed = false;
    let stage: VideoFailureStage = 'eligibility';
    connected.current = false;
    ended.current = false;
    startedAt.current = null;
    credentials.current = null;
    setError(null);
    setDiagnostic(null);
    setStatus('Preparing video call...');

    const report = (update: Parameters<typeof updateVideoCall>[2]) => {
      const call = credentials.current;
      if (!call) { return; }
      reporting.current = reporting.current.then(async () => {
        if (reportingFailed) { return; }
        await updateVideoCall(appointment.id, call.call_id, update);
      }).catch(() => {
        reportingFailed = true;
        Alert.alert('Call reporting failed', 'The call event could not be saved to the server. Please contact support.');
      });
    };
    const finish = (reason: string, outcome: 'completed' | 'failed'): Promise<void> => {
      if (finishPromise) { return finishPromise; }
      ended.current = true;
      cancelled = true;
      finishPromise = (async () => {
        if (joinPromise) {
          try { await joinPromise; } catch { /* Join failure is handled by start. */ }
        }
        let leftCleanly = removed;
        if (instance) {
          instance.removeAllListeners();
          try {
            if (joinPromise && !removed) { await instance.leave(); }
            leftCleanly = true;
          } catch {
            Alert.alert('Call error', 'Could not leave the video room cleanly. The call outcome was not recorded.');
          } finally {
            try { await instance.destroy(); } catch {
              Alert.alert('Call error', 'Could not release video call resources.');
            }
            instance = null;
            sdkRef.current = null;
          }
        }
        if (connected.current && leftCleanly) {
          report({ status: outcome, ended_at: new Date().toISOString(), end_reason: reason });
        }
        await reporting.current;
        if (active) { setSdk(null); }
      })();
      return finishPromise;
    };
    leaveRef.current = () => {
      finish('doctor_ended', 'completed').then(() => {
        if (active) { allowNavigation = true; navigation.goBack(); }
      });
    };
    const removeNavigationListener = navigation.addListener('beforeRemove', (event) => {
      if (allowNavigation) { return; }
      event.preventDefault();
      finish('screen_closed', 'completed').then(() => {
        if (active) { allowNavigation = true; navigation.dispatch(event.data.action); }
      });
    });

    const start = async () => {
      try {
        if (appointment.source !== 'live' || appointment.mode !== 'video' || !appointment.canJoin) {
          throw new Error('Video calls are not available for demo or non-video appointments.');
        }
        stage = 'permissions';
        if (Platform.OS === 'android') {
          const permissions = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          ]);
          if (permissions[PermissionsAndroid.PERMISSIONS.CAMERA] !== PermissionsAndroid.RESULTS.GRANTED ||
              permissions[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] !== PermissionsAndroid.RESULTS.GRANTED) {
            throw new Error('Camera and microphone permissions are required. Enable them in device settings and retry.');
          }
        }
        if (!active || cancelled) { return; }
        stage = 'join-api';
        const call = await joinVideoAppointment(appointment.id);
        if (!active || cancelled) { return; }
        credentials.current = call;
        stage = 'call-status-api';
        const existingStatus = await getVideoCallStatus(appointment.id, call.call_id);
        if (!active || cancelled) { return; }
        stage = 'sdk-build';
        instance = await HMSSDK.build();
        if (!active || cancelled) { await instance.destroy(); instance = null; return; }
        sdkRef.current = instance;
        setSdk(instance);
        instance.addEventListener(HMSUpdateListenerActions.ON_JOIN, ({ room }: { room: HMSRoom }) => {
          if (connected.current) { return; }
          connected.current = true;
          startedAt.current = new Date().toISOString();
          localRef.current = room.localPeer;
          if (existingStatus === 'unknown') {
            report({ status: 'in_progress', started_at: startedAt.current });
          }
          if (active && !cancelled) {
            setTiles([{ peer: room.localPeer, track: room.localPeer.videoTrack }]);
            setStatus('Connected');
            setDiagnostic(null);
          }
        });
        instance.addEventListener(HMSUpdateListenerActions.ON_TRACK_UPDATE, ({ peer, track, type }: { peer: HMSPeer; track: HMSTrack; type: HMSTrackUpdate }) => {
          if (!active || track.type !== HMSTrackType.VIDEO) { return; }
          setTiles((current) => {
            const others = current.filter((tile) => tile.peer.peerID !== peer.peerID);
            return [...others, { peer, track: type === HMSTrackUpdate.TRACK_REMOVED ? undefined : track }];
          });
        });
        instance.addEventListener(HMSUpdateListenerActions.ON_PEER_UPDATE, ({ peer, type }: { peer: HMSPeer; type: HMSPeerUpdate }) => {
          if (active && type === HMSPeerUpdate.PEER_LEFT) {
            setTiles((current) => current.filter((tile) => tile.peer.peerID !== peer.peerID));
          }
        });
        instance.addEventListener(HMSUpdateListenerActions.RECONNECTING, () => { if (active) { setStatus('Reconnecting...'); } });
        instance.addEventListener(HMSUpdateListenerActions.RECONNECTED, () => { if (active) { setStatus('Connected'); setDiagnostic(null); } });
        instance.addEventListener(HMSUpdateListenerActions.ON_ERROR, (event: HMSException) => {
          if (active) {
            setError('Video connection error. Check your connection and camera and microphone permissions in device settings.');
            setDiagnostic(videoDiagnostic('sdk-event', event));
            if (event.isTerminal) { finish('connection_failed', 'failed'); }
          }
        });
        instance.addEventListener(HMSUpdateListenerActions.ON_REMOVED_FROM_ROOM, () => {
          removed = true;
          if (active) { setError('You were removed from the video room.'); finish('removed_from_room', 'failed'); }
        });
        setStatus('Connecting...');
        stage = 'sdk-join';
        joinPromise = instance.join(new HMSConfig({ username: doctorName, authToken: call.auth_token }));
        await joinPromise;
      } catch (failure) {
        if (cancelled) { return; }
        if (active) {
          setError(getApiErrorMessage(failure));
          setDiagnostic(videoDiagnostic(stage, failure));
          setStatus('Could not join');
        }
        await finish('join_failed', 'failed');
      }
    };
    start();
    const back = BackHandler.addEventListener('hardwareBackPress', () => { leaveRef.current(); return true; });
    return () => {
      active = false;
      back.remove();
      removeNavigationListener();
      finish('screen_closed', 'completed');
    };
  }, [appointment.id, appointment.mode, appointment.source, appointment.canJoin, doctorName, navigation, attempt]);

  const toggleAudio = () => {
    const track = localRef.current?.localAudioTrack();
    if (!track) { setError('Microphone is unavailable.'); return; }
    track.setMute(!audioMuted);
    setAudioMuted(!audioMuted);
  };
  const toggleVideo = () => {
    const track = localRef.current?.localVideoTrack();
    if (!track) { setError('Camera is unavailable.'); return; }
    track.setMute(!videoMuted);
    setVideoMuted(!videoMuted);
  };
  const switchCamera = () => {
    const track = localRef.current?.localVideoTrack();
    if (!track) {
      setError('Camera is unavailable.');
      return;
    }
    try {
      track.switchCamera();
      setError(null);
    } catch {
      setError('Could not switch cameras. Please try again.');
    }
  };
  const HmsView = sdk?.HmsView;
  const remote = tiles.find((tile) => !tile.peer.isLocal);
  const local = tiles.find((tile) => tile.peer.isLocal);
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.remote}>
        {HmsView && remote?.track && !remote.track.isMute() ?
          <HmsView trackId={remote.track.trackId} style={styles.video} /> :
          <Text style={styles.text}>Waiting for patient video</Text>}
        <Text style={styles.text}>{status}</Text>
      </View>
      {HmsView && local?.track && !local.track.isMute() ?
        <HmsView trackId={local.track.trackId} style={styles.local} mirror /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {diagnostic ? <Text selectable style={styles.error}>Diagnostic: {diagnostic}</Text> : null}
      {!sdk && !error ? <ActivityIndicator color={Colors.white} /> : null}
      <View style={styles.controls}>
        {sdk && !ended.current ? (
          <>
            <TouchableOpacity onPress={toggleAudio}><Text style={styles.text}>{audioMuted ? 'Unmute' : 'Mute'}</Text></TouchableOpacity>
            <TouchableOpacity onPress={toggleVideo}><Text style={styles.text}>{videoMuted ? 'Camera on' : 'Camera off'}</Text></TouchableOpacity>
            <TouchableOpacity
              onPress={switchCamera}
              accessibilityLabel="Switch camera"
              accessibilityRole="button"
              disabled={videoMuted}
              style={[styles.controlButton, videoMuted && styles.controlButtonDisabled]}
            >
              <Text style={styles.text}>Switch camera</Text>
            </TouchableOpacity>
          </>
        ) : null}
        {error && !sdk && !connected.current ? <TouchableOpacity onPress={() => setAttempt((n) => n + 1)}><Text style={styles.text}>Retry</Text></TouchableOpacity> : null}
        <TouchableOpacity onPress={() => leaveRef.current()}><Text style={styles.text}>Leave</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.textPrimary },
  remote: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  video: { width: '100%', height: '90%' },
  local: { position: 'absolute', top: 24, right: 20, width: 100, height: 150 },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', flexWrap: 'wrap', padding: 16 },
  controlButton: { backgroundColor: Colors.primaryDark, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  controlButtonDisabled: { opacity: 0.5 },
  text: { color: Colors.white, fontSize: 16 },
  error: { color: Colors.white, textAlign: 'center', padding: 12 },
});
