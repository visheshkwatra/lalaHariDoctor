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
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  findNodeHandle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary } from 'react-native-image-picker';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { Colors } from '../../constants/colors';
import { RootStackParamList } from '../../navigation/types';
import { useDoctorStore, Gender } from '../../services/useDoctorStore';
import {
  saveDoctorProfile,
  uploadDoctorDocument,
  getApiErrorMessage,
} from '../../services/api';
import { showToast } from '../../services/toast';
import { documentFromPicker, photoFromAsset, UploadFile } from '../../services/media';

type Props = NativeStackScreenProps<RootStackParamList, 'DoctorDetails'>;

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const REGISTRATION_CERTIFICATE = 'Medical Council Registration Certificate';
const QUALIFICATIONS = [
  'MBBS', 'BDS', 'BAMS', 'BHMS', 'BUMS', 'BSMS', 'BNYS', 'BVSc & AH',
  'MD', 'MS', 'DNB', 'DrNB', 'DM', 'MCh', 'MDS', 'PhD', 'Diploma',
  'DGO', 'DCH', 'DNB (Family Medicine)', 'MPH', 'MSc (Nursing)',
  'BPT', 'MPT', 'BSc Nursing', 'GNM', 'BOT', 'MOT', 'BASLP', 'MASLP',
  'BPharm', 'MPharm', 'PharmD', 'AuD', 'Other',
];

const SPECIALIZATIONS = [
  'General Practice', 'Family Medicine', 'Internal Medicine', 'Emergency Medicine',
  'Preventive Medicine', 'Community Medicine', 'Geriatric Medicine', 'Sports Medicine',
  'Cardiology', 'Cardiothoracic Surgery', 'Neurology', 'Neurosurgery', 'Dermatology',
  'Pediatrics', 'Neonatology', 'Pediatric Surgery', 'Obstetrics and Gynecology',
  'Reproductive Medicine', 'Orthopedics', 'Spine Surgery', 'Rheumatology',
  'Gastroenterology', 'Hepatology', 'Surgical Gastroenterology', 'Nephrology',
  'Urology', 'Endocrinology', 'Diabetology', 'Pulmonology', 'Respiratory Medicine',
  'ENT (Otorhinolaryngology)', 'Ophthalmology', 'Oncology', 'Surgical Oncology',
  'Radiation Oncology', 'Hematology', 'Pathology', 'Radiology', 'Nuclear Medicine',
  'Anesthesiology', 'Critical Care', 'Psychiatry', 'Clinical Psychology',
  'Dentistry', 'Oral and Maxillofacial Surgery', 'Periodontics', 'Prosthodontics',
  'Endodontics', 'Pedodontics', 'Public Health', 'Occupational Medicine',
  'Ayurveda', 'Homeopathy', 'Unani Medicine', 'Siddha Medicine', 'Naturopathy',
  'Physiotherapy', 'Occupational Therapy', 'Nutrition and Dietetics', 'Speech Therapy',
  'Other',
];

export const DoctorDetailsScreen: React.FC<Props> = ({ navigation }) => {
  const { profile, setProfile, documents, addDocument, removeDocument } = useDoctorStore();
  const scrollViewRef = React.useRef<ScrollView>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingCertificate, setIsUploadingCertificate] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<UploadFile | undefined>();
  const registrationCertificate = documents.find(
    (document) => document.label === REGISTRATION_CERTIFICATE,
  );

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

  const handleUploadCertificate = async () => {
    if (isUploadingCertificate) {
      return;
    }
    try {
      const [file] = await pick({ type: [types.pdf, types.images] });
      if (!file?.uri || !file?.name) {
        return;
      }
      setIsUploadingCertificate(true);
      const document = await uploadDoctorDocument(REGISTRATION_CERTIFICATE, documentFromPicker(file));
      if (registrationCertificate) {
        removeDocument(registrationCertificate.id);
      }
      addDocument(document);
      setErrors((current) => {
        const next = { ...current };
        delete next.registrationCertificate;
        return next;
      });
      showToast('Registration certificate uploaded.');
    } catch (e) {
      if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) {
        return;
      }
      showToast(getApiErrorMessage(e));
    } finally {
      setIsUploadingCertificate(false);
    }
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!profile.fullName.trim()) {
      next.fullName = 'Name is required.';
    }
    const age = Number(profile.age);
    if (!profile.age.trim() || Number.isNaN(age) || age < 21 || age > 100) {
      next.age = 'Enter a valid age (21–100).';
    }
    if (!profile.gender) {
      next.gender = 'Select your gender.';
    }
    if (!profile.medicalCouncilRegNumber.trim()) {
      next.medicalCouncilRegNumber = 'Registration number is required.';
    }
    if (!registrationCertificate) {
      next.registrationCertificate = 'Upload your medical council registration certificate.';
    }
    if (!profile.qualification) {
      next.qualification = 'Select your qualification.';
    }
    if (!profile.specialization) {
      next.specialization = 'Select your specialization.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleContinue = async () => {
    if (!validate() || isSaving || isUploadingCertificate) {
      return;
    }
    setIsSaving(true);
    try {
      await saveDoctorProfile(profile, photo);
      navigation.navigate('Availability');
    } catch (e) {
      showToast(getApiErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  const scrollInputIntoView = (input: TextInput | null) => {
    const nodeHandle = input ? findNodeHandle(input) : null;
    if (nodeHandle === null) {
      return;
    }
    setTimeout(() => {
      scrollViewRef.current?.scrollResponderScrollNativeHandleToKeyboard(
        nodeHandle,
        140,
        true,
      );
    }, 250);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.stepLabel}>Step 2 of 3</Text>
          <Text style={styles.title}>Your Professional Details</Text>
          <Text style={styles.subtitle}>
            We use these details to match you with the right patients and route appointment
            requests to you. They are not shown to patients.
          </Text>

          {/* Photo (optional) */}
          <TouchableOpacity style={styles.photoPicker} activeOpacity={0.8} onPress={pickPhoto}>
            {photo?.uri || profile.photoUri ? (
              <Image source={{ uri: photo?.uri ?? profile.photoUri ?? undefined }} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <MaterialIcon name="camera-plus-outline" size={30} color={Colors.primary} />
              </View>
            )}
            <View style={styles.photoEditBadge}>
              <Icon name="pencil" size={12} color={Colors.white} />
            </View>
          </TouchableOpacity>
          <Text style={styles.photoHint}>Profile photo (optional)</Text>

          <Field label="Full Name" error={errors.fullName}>
            <TextInput
              style={styles.input}
              placeholder="Enter your full name, e.g. Dr. Ram Goel"
              placeholderTextColor={Colors.textMuted}
              value={profile.fullName}
              onChangeText={(v) => setProfile({ fullName: v })}
            />
          </Field>

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Field label="Age" error={errors.age}>
                <TextInput
                  style={styles.input}
                  placeholder="35"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={3}
                  value={profile.age}
                  onChangeText={(v) => setProfile({ age: v.replace(/\D/g, '') })}
                />
              </Field>
            </View>
            <View style={styles.rowItem}>
              <Field label="Gender" error={errors.gender}>
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
              </Field>
            </View>
          </View>

          <Field
            label="Medical Council Registration Number"
            error={errors.medicalCouncilRegNumber}
          >
            <TextInput
              style={styles.input}
              placeholder="e.g. MCI-12345 / State MC Reg. No."
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              value={profile.medicalCouncilRegNumber}
              onChangeText={(v) => setProfile({ medicalCouncilRegNumber: v })}
            />
          </Field>

          <Field
            label="Medical Council Registration Certificate *"
            error={errors.registrationCertificate}
          >
            <TouchableOpacity
              style={styles.documentPicker}
              activeOpacity={0.8}
              onPress={handleUploadCertificate}
              disabled={isUploadingCertificate}
            >
              {isUploadingCertificate ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <MaterialIcon
                  name={registrationCertificate ? 'file-check-outline' : 'file-upload-outline'}
                  size={24}
                  color={registrationCertificate ? Colors.success : Colors.primary}
                />
              )}
              <View style={styles.documentPickerText}>
                <Text style={styles.documentPickerTitle}>
                  {registrationCertificate ? 'Certificate uploaded' : 'Upload certificate'}
                </Text>
                <Text style={styles.documentPickerHint} numberOfLines={1}>
                  {registrationCertificate?.fileName ?? 'Required · PDF or image'}
                </Text>
              </View>
              <Text style={styles.documentPickerAction}>
                {registrationCertificate ? 'Replace' : 'Choose'}
              </Text>
            </TouchableOpacity>
          </Field>

          <Field label="Qualification" error={errors.qualification}>
            <SearchableSelect
              value={profile.qualification}
              options={QUALIFICATIONS}
              placeholder="Search or enter a qualification"
              onFocus={scrollInputIntoView}
              onChange={(qualification) => setProfile({ qualification })}
            />
          </Field>

          <Field label="Specialization" error={errors.specialization}>
            <SearchableSelect
              value={profile.specialization}
              options={SPECIALIZATIONS}
              placeholder="Search or enter a specialization"
              onFocus={scrollInputIntoView}
              onChange={(specialization) => setProfile({ specialization })}
            />
          </Field>

          <TouchableOpacity
            style={[
              styles.primaryButton,
              (isSaving || isUploadingCertificate) && styles.buttonDisabled,
            ]}
            activeOpacity={0.85}
            disabled={isSaving || isUploadingCertificate}
            onPress={handleContinue}
          >
            {isSaving ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const Field: React.FC<{ label: string; error?: string; children: React.ReactNode }> = ({
  label,
  error,
  children,
}) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {children}
    {error ? <Text style={styles.fieldError}>{error}</Text> : null}
  </View>
);

const SearchableSelect: React.FC<{
  value: string;
  options: string[];
  placeholder: string;
  onFocus: (input: TextInput | null) => void;
  onChange: (value: string) => void;
}> = ({ value, options, placeholder, onFocus, onChange }) => {
  const [isFocused, setIsFocused] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = React.useRef<TextInput>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = options
    .filter((option) => option.toLowerCase().includes(normalizedQuery))
    .slice(0, 5);
  const hasExactMatch = options.some((option) => option.toLowerCase() === normalizedQuery);

  const select = (selection: string) => {
    onChange(selection);
    setQuery(selection);
    setIsFocused(false);
    Keyboard.dismiss();
  };

  return (
    <View>
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={isFocused ? query : value}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        onFocus={() => {
          setQuery(value);
          setIsFocused(true);
          onFocus(inputRef.current);
        }}
        onBlur={() => setIsFocused(false)}
        onChangeText={setQuery}
        autoCapitalize="words"
      />
      {isFocused && matches.length > 0 ? (
        <View style={styles.optionList}>
          {matches.map((option) => (
            <TouchableOpacity
              key={option}
              style={styles.optionRow}
              onPressIn={() => select(option)}
            >
              <Text style={styles.optionText}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {isFocused && normalizedQuery && !hasExactMatch ? (
        <TouchableOpacity
          style={[styles.optionRow, styles.customOption]}
          onPressIn={() => select(query.trim())}
        >
          <Text style={styles.optionText}>Use “{query.trim()}”</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  content: { padding: 24, paddingBottom: 40 },
  stepLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 21,
  },
  photoPicker: { alignSelf: 'center' },
  photo: { width: 100, height: 100, borderRadius: 50 },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
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
  photoHint: {
    textAlign: 'center',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 8,
    marginBottom: 20,
  },
  field: { marginBottom: 18 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  fieldError: { fontSize: 12, color: Colors.danger, marginTop: 6 },
  documentPicker: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: Colors.cardBg,
  },
  documentPickerText: { flex: 1, marginHorizontal: 10 },
  documentPickerTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  documentPickerHint: { fontSize: 12, color: Colors.textMuted, marginTop: 3 },
  documentPickerAction: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
  optionList: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: Colors.cardBg,
    marginTop: 4,
    overflow: 'hidden',
  },
  optionRow: { paddingHorizontal: 14, paddingVertical: 11 },
  optionText: { fontSize: 14, color: Colors.textPrimary },
  customOption: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.textPrimary,
    backgroundColor: Colors.cardBg,
  },
  row: { flexDirection: 'row', marginHorizontal: -6 },
  rowItem: { flex: 1, paddingHorizontal: 6 },
  chipRow: { flexDirection: 'row' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', margin: -4 },
  chip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Colors.cardBg,
    marginRight: 8,
    margin: 4,
  },
  chipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chipTextSelected: { color: Colors.white },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
