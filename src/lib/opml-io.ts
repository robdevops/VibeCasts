import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export const OPML_FILE_NAME = 'podcasts.opml';

/** Let the user choose an OPML file and return its text, or null if they backed out. */
export async function pickOpmlText(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  if (Platform.OS === 'web') {
    const file = asset.file ?? (await (await fetch(asset.uri)).blob());
    return file.text();
  }
  return new File(asset.uri).text();
}

/** Hand the OPML text to the user: a download on web, the share sheet elsewhere. */
export async function shareOpml(xml: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([xml], { type: 'text/x-opml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = OPML_FILE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new File(Paths.cache, OPML_FILE_NAME);
  if (file.exists) file.delete();
  file.create();
  file.write(xml);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/x-opml', UTI: 'public.xml', dialogTitle: 'Export podcasts' });
}
