import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary } from 'react-native-image-picker';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { Colors } from '../../constants/colors';
import { getPushTokenForLogout, startPushNotifications } from '../../services/pushNotifications';
import { RootStackParamList } from '../../navigation/types';
import { useDoctorStore, Gender } from '../../services/useDoctorStore';
import {
  saveDoctorProfile,
  uploadDoctorDocument,
  deleteDoctorDocument,
  deleteDoctorPhoto,
  getApiErrorMessage,
  logoutDoctor,
} from '../../services/api';
import { showToast } from '../../services/toast';
import { signOutFirebase } from '../../services/firebaseAuth';
import { documentFromPicker, photoFromAsset, UploadFile } from '../../services/media';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const DOCUMENT_SLOTS = [
  'Medical Council Registration Certificate',
  'Qualification Degree',
  'Government ID Proof',
];

export const ProfileScreen: React.FC<Props> = ({ navigation }) => {
  const {
    profile,
    setProfile,
    documents,
    addDocument,
    removeDocument,
    phone,
  } = useDoctorStore();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [deletingDocument, setDeletingDocument] = useState(false);
  const [photo, setPhoto] = useState<UploadFile | undefined>();

  const pickPhoto = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
      if (result.errorMessage) {
        throw new Error(result.errorMessage);
      }
      if (result.assets?.[0]) {
        setPhoto(photoFromAsset(result.assets[0]));
      }
    } catch (error) {
      showToast(getApiErrorMessage(error));
    }
  };

  const handleSave = async () => {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      await saveDoctorProfile(profile, photo);
      setPhoto(undefined);
      setIsEditing(false);
      showToast('Profile updated.');
    } catch (e) {
      showToast(getApiErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpload = async (label: string) => {
    if (uploadingSlot || deletingDocument) {
      return;
    }
    try {
      const [file] = await pick({ type: [types.pdf, types.images] });
      if (!file?.uri || !file?.name) {
        return;
      }
      setUploadingSlot(label);
      const doc = await uploadDoctorDocument(label, documentFromPicker(file));
      const previous = documents.find((item) => item.label === label);
      if (previous && label !== 'Other') {
        removeDocument(previous.id);
      }
      addDocument(doc);
      showToast(`${label} uploaded.`);
    } catch (e) {
      if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) {
        return;
      }
      showToast(getApiErrorMessage(e));
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleDeletePhoto = () => {
    Alert.alert('Remove photo', 'Remove your profile photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            if (profile.photoUri) {
              await deleteDoctorPhoto();
            }
            setPhoto(undefined);
            showToast('Photo removed.');
          } catch (error) {
            showToast(getApiErrorMessage(error));
          }
        },
      },
    ]);
  };

  const handleDeleteDocument = async (id: string) => {
    if (deletingDocument || uploadingSlot) {
      return;
    }
    setDeletingDocument(true);
    try {
      await deleteDoctorDocument(id);
      removeDocument(id);
      showToast('Document removed.');
    } catch (error) {
      showToast(getApiErrorMessage(error));
    } finally {
      setDeletingDocument(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            try {
              const token = await getPushTokenForLogout();
              await logoutDoctor(token);
            } catch (error) {
              startPushNotifications();
              throw error;
            }
            await signOutFirebase();
            navigation.reset({ index: 0, routes: [{ name: 'PhoneInput' }] });
          } catch (error) {
            Alert.alert('Could not log out', getApiErrorMessage(error));
          }
        },
      },
    ]);
  };

  const documentFor = (label: string) => documents.find((d) => d.label === label);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.cardBg} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <TouchableOpacity onPress={() => (isEditing ? handleSave() : setIsEditing(true))}>
          {isSaving ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <Text style={styles.editAction}>{isEditing ? 'Save' : 'Edit'}</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Photo */}
        <TouchableOpacity
          style={styles.photoPicker}
          activeOpacity={0.8}
          onPress={pickPhoto}
          disabled={!isEditing}
        >
          {photo?.uri || profile.photoUri ? (
            <Image source={{ uri: photo?.uri ?? profile.photoUri ?? undefined }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <MaterialIcon name="account" size={48} color={Colors.primary} />
            </View>
          )}
          {isEditing && (
            <View style={styles.photoEditBadge}>
              <Icon name="pencil" size={12} color={Colors.white} />
            </View>
          )}
        </TouchableOpacity>
        {isEditing && (photo || profile.photoUri) ? (
          <TouchableOpacity onPress={handleDeletePhoto} disabled={isSaving}>
            <Text style={styles.removePhoto}>Remove photo</Text>
          </TouchableOpacity>
        ) : null}

        {/* Details */}
        <View style={styles.card}>
          <ProfileField label="Full Name" editing={isEditing} value={profile.fullName}
            onChange={(v) => setProfile({ fullName: v })} />
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <ProfileField label="Age" editing={isEditing} value={profile.age}
                keyboardType="number-pad"
                onChange={(v) => setProfile({ age: v.replace(/\D/g, '') })} />
            </View>
            <View style={styles.rowItem}>
              <Text style={styles.fieldLabel}>Gender</Text>
              {isEditing ? (
                <View style={styles.chipRow}>
                  {GENDERS.map((g) => (
                    <TouchableOpacity
                      key={g.value}
                      style={[styles.chip, profile.gender === g.value && styles.chipSelected]}
                      onPress={() => setProfile({ gender: g.value })}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          profile.gender === g.value && styles.chipTextSelected,
                        ]}
                      >
                        {g.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={styles.fieldValue}>
                  {profile.gender
                    ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1)
                    : '—'}
                </Text>
              )}
            </View>
          </View>
          <ProfileField label="Medical Council Registration Number" editing={isEditing}
            value={profile.medicalCouncilRegNumber} autoCapitalize="characters"
            onChange={(v) => setProfile({ medicalCouncilRegNumber: v })} />
          <ProfileField label="Qualification" editing={isEditing} value={profile.qualification}
            onChange={(v) => setProfile({ qualification: v })} />
          <ProfileField label="Specialization" editing={isEditing} value={profile.specialization}
            onChange={(v) => setProfile({ specialization: v })} />
          <Text style={styles.fieldLabel}>Registered Mobile</Text>
          <Text style={styles.fieldValue}>{phone ?? '—'}</Text>
        </View>

        <TouchableOpacity style={styles.uploadButton} onPress={() => navigation.navigate('Availability')}>
          <Text style={styles.uploadButtonText}>Edit weekly availability</Text>
        </TouchableOpacity>

        {/* Verification documents */}
        <Text style={styles.sectionTitle}>Verification Documents</Text>
        <Text style={styles.sectionHint}>
          Upload real documents for admin verification. Accepted: PDF or image.
        </Text>
        {DOCUMENT_SLOTS.map((label) => {
          const doc = documentFor(label);
          return (
            <View key={label} style={styles.docCard}>
              <MaterialIcon
                name={doc ? 'file-check-outline' : 'file-upload-outline'}
                size={26}
                color={doc ? Colors.success : Colors.primary}
              />
              <View style={styles.docBody}>
                <Text style={styles.docLabel}>{label}</Text>
                {doc ? (
                  <Text style={styles.docFileName} numberOfLines={1}>
                    {doc.fileName}
                  </Text>
                ) : (
                  <Text style={styles.docMissing}>Not uploaded</Text>
                )}
              </View>
              {doc && (
                <TouchableOpacity onPress={() => handleDeleteDocument(doc.id)} disabled={uploadingSlot !== null || deletingDocument}>
                  <MaterialIcon name="trash-can-outline" size={22} color={Colors.danger} />
                </TouchableOpacity>
              )}
                <TouchableOpacity
                  style={styles.uploadButton}
                  onPress={() => handleUpload(label)}
                  disabled={uploadingSlot !== null || deletingDocument}
                >
                  {uploadingSlot === label ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <Text style={styles.uploadButtonText}>{doc ? 'Replace' : 'Upload'}</Text>
                  )}
                </TouchableOpacity>
            </View>
          );
        })}
        {documents.filter((document) => document.label === 'Other').map((doc) => (
          <View key={doc.id} style={styles.docCard}>
            <MaterialIcon name="file-check-outline" size={26} color={Colors.success} />
            <View style={styles.docBody}>
              <Text style={styles.docLabel}>Other</Text>
              <Text style={styles.docFileName} numberOfLines={1}>{doc.fileName}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDeleteDocument(doc.id)} disabled={uploadingSlot !== null || deletingDocument}>
              <MaterialIcon name="trash-can-outline" size={22} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={() => handleUpload('Other')}
          disabled={uploadingSlot !== null || deletingDocument || documents.filter((document) => document.label === 'Other').length >= 5}
        >
          {uploadingSlot === 'Other' ? <ActivityIndicator size="small" color={Colors.white} /> :
            <Text style={styles.uploadButtonText}>Upload other document (max 5)</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} activeOpacity={0.85} onPress={handleLogout}>
          <MaterialIcon name="logout" size={18} color={Colors.danger} />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const ProfileField: React.FC<{
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  keyboardType?: 'default' | 'number-pad';
  autoCapitalize?: 'none' | 'characters';
}> = ({ label, value, editing, onChange, keyboardType = 'default', autoCapitalize = 'none' }) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {editing ? (
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    ) : (
      <Text style={styles.fieldValue}>{value || '—'}</Text>
    )}
  </View>
);

const styles = StyleSheet.create({
  removePhoto: { color: Colors.danger, textAlign: 'center', marginBottom: 12 },
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
  editAction: { fontSize: 15, fontWeight: '700', color: Colors.primary, padding: 6 },
  content: { padding: 20, paddingBottom: 40 },
  photoPicker: { alignSelf: 'center', marginBottom: 20 },
  photo: { width: 96, height: 96, borderRadius: 48 },
  photoPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEditBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 24,
  },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
  fieldValue: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
  row: { flexDirection: 'row', marginHorizontal: -6 },
  rowItem: { flex: 1, paddingHorizontal: 6 },
  chipRow: { flexDirection: 'row' },
  chip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: Colors.cardBg,
    marginRight: 6,
  },
  chipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextSelected: { color: Colors.white },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  sectionHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 4, marginBottom: 12 },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 10,
  },
  docBody: { flex: 1, marginLeft: 12 },
  docLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  docFileName: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  docMissing: { fontSize: 12, color: Colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  uploadButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 76,
    alignItems: 'center',
  },
  uploadButtonText: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 24,
  },
  logoutText: { color: Colors.danger, fontSize: 15, fontWeight: '700', marginLeft: 8 },
});
