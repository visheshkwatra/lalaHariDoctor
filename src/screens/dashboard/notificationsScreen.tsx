import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors } from '../../constants/colors';
import { RootStackParamList } from '../../navigation/types';
import { useDoctorStore, AppNotification } from '../../services/useDoctorStore';
import {
  getNotifications,
  markNotificationRead as markNotificationReadApi,
  markAllNotificationsRead,
  getUnreadNotificationCount,
  getApiErrorMessage,
} from '../../services/api';
import { showToast } from '../../services/toast';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const TYPE_ICONS: Record<AppNotification['type'], string> = {
  appointment: 'calendar-clock-outline',
  payment: 'cash-check',
  system: 'information-outline',
};

const timeAgo = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) {
    return 'Just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export const NotificationsScreen: React.FC<Props> = ({ navigation }) => {
  const { notifications, setNotifications, setUnreadCount } = useDoctorStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failedPage, setFailedPage] = useState(1);
  const sequence = useRef(0);

  const load = useCallback(async (nextPage: number) => {
    const request = ++sequence.current;
      setIsLoading(true);
      setError(null);
      try {
        const [result, count] = await Promise.all([getNotifications(nextPage), getUnreadNotificationCount()]);
        if (sequence.current !== request) { return; }
        const existing = nextPage === 1 ? [] : useDoctorStore.getState().notifications;
        const combined = new Map(existing.map((item) => [item.id, item]));
        result.results.forEach((item) => combined.set(item.id, item));
        setNotifications([...combined.values()]);
        setUnreadCount(count);
        setPage(nextPage);
        setHasNext(result.hasNext);
      } catch (failure) {
        if (sequence.current === request) { setFailedPage(nextPage); setError(getApiErrorMessage(failure)); }
      } finally {
        if (sequence.current === request) { setIsLoading(false); }
      }
  }, [setNotifications, setUnreadCount]);

  useEffect(() => {
    setNotifications([]);
    load(1);
    return () => { sequence.current += 1; };
  }, [load, setNotifications]);

  const handlePress = async (item: AppNotification) => {
    if (busy || isLoading) { return; }
    setBusy(true);
    try {
      if (!item.read) {
        const updated = await markNotificationReadApi(item.id);
        setNotifications(useDoctorStore.getState().notifications.map((value) => value.id === item.id ? updated : value));
        setUnreadCount(Math.max(0, useDoctorStore.getState().unreadCount - 1));
      }
      if (item.appointmentId) {
        navigation.navigate('AppointmentDetail', { appointmentId: String(item.appointmentId) });
      }
    } catch (failure) {
      showToast(getApiErrorMessage(failure));
    } finally { setBusy(false); }
  };

  const handleReadAll = async () => {
    if (busy || isLoading) { return; }
    setBusy(true);
    try {
      await markAllNotificationsRead();
      await load(1);
    } catch (failure) {
      showToast(getApiErrorMessage(failure));
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.cardBg} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity onPress={handleReadAll} disabled={busy || isLoading} accessibilityLabel="Mark all notifications read">
          <Text style={styles.action}>Read all</Text>
        </TouchableOpacity>
      </View>

      {isLoading && notifications.length === 0 ? (
        <ActivityIndicator style={styles.loader} color={Colors.primary} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={isLoading && page === 1}
          onRefresh={() => { if (!busy) { load(1); } }}
          ListHeaderComponent={error ? (
            <TouchableOpacity onPress={() => load(failedPage)}>
              <Text style={styles.action}>{error} — Tap to retry</Text>
            </TouchableOpacity>
          ) : null}
          ListFooterComponent={hasNext ? (
            <TouchableOpacity disabled={isLoading || busy} onPress={() => load(page + 1)} accessibilityLabel="Load more notifications">
              <Text style={styles.action}>{isLoading ? 'Loading...' : 'Load more'}</Text>
            </TouchableOpacity>
          ) : null}
          ListEmptyComponent={
            !error ? <View style={styles.emptyState}>
              <MaterialIcon name="bell-off-outline" size={44} color={Colors.textMuted} />
              <Text style={styles.emptyText}>You're all caught up</Text>
            </View> : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, !item.read && styles.cardUnread]}
              activeOpacity={0.8}
              accessibilityLabel={`Notification: ${item.title}`}
              onPress={() => handlePress(item)}
            >
              <View style={styles.cardIcon}>
                <MaterialIcon
                  name={TYPE_ICONS[item.type]}
                  size={22}
                  color={item.read ? Colors.textMuted : Colors.primary}
                />
              </View>
              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, !item.read && styles.cardTitleUnread]}>
                  {item.title}
                </Text>
                <Text style={styles.cardText}>{item.body}</Text>
                <Text style={styles.cardTime}>{timeAgo(item.createdAt)}</Text>
              </View>
              {!item.read && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: { padding: 6 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  action: { color: Colors.primary, fontWeight: '700', padding: 8 },
  loader: { marginTop: 60 },
  listContent: { padding: 16, flexGrow: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { marginTop: 12, fontSize: 14, color: Colors.textMuted },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 10,
  },
  cardUnread: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  cardIcon: { marginRight: 12, marginTop: 2 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  cardTitleUnread: { color: Colors.textPrimary, fontWeight: '800' },
  cardText: { fontSize: 13, color: Colors.textSecondary, marginTop: 3, lineHeight: 19 },
  cardTime: { fontSize: 11, color: Colors.textMuted, marginTop: 6 },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.primary,
    alignSelf: 'center',
    marginLeft: 8,
  },
});
