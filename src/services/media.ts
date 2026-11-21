import { Asset } from 'react-native-image-picker';

export interface UploadFile {
  uri: string;
  name: string;
  type: string;
  size?: number | null;
}

const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const documentTypes = ['application/pdf', 'image/jpeg', 'image/png'];

export const validateUpload = (file: UploadFile, kind: 'photo' | 'document'): void => {
  const allowed = kind === 'photo' ? imageTypes : documentTypes;
  const maxBytes = (kind === 'photo' ? 5 : 10) * 1024 * 1024;
  if (!file.uri || !file.name || !allowed.includes(file.type.toLowerCase())) {
    throw new Error(kind === 'photo' ? 'Choose a JPG, PNG or WEBP photo.' : 'Choose a PDF, JPG or PNG document.');
  }
  if (file.size != null && (!Number.isFinite(file.size) || file.size < 0 || file.size > maxBytes)) {
    throw new Error(kind === 'photo' ? 'The photo must be at most 5 MB.' : 'The document must be at most 10 MB.');
  }
};

export const photoFromAsset = (asset: Asset): UploadFile => {
  const extension = asset.fileName?.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  };
  const type = asset.type ?? mimeTypes[extension ?? ''] ?? '';
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  };
  const file = {
    uri: asset.uri ?? '',
    name: asset.fileName ?? `photo.${extensions[type] ?? 'unknown'}`,
    type,
    size: asset.fileSize,
  };
  validateUpload(file, 'photo');
  return file;
};

export const documentFromPicker = (file: {
  uri: string;
  name: string | null;
  type: string | null;
  size?: number | null;
}): UploadFile => {
  const extension = file.name?.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  };
  const selected: UploadFile = {
    uri: file.uri,
    name: file.name ?? '',
    type: file.type && file.type !== 'application/octet-stream' ? file.type : types[extension ?? ''] ?? '',
    size: file.size,
  };
  validateUpload(selected, 'document');
  return selected;
};
