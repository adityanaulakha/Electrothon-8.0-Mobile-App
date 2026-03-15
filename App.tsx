import { StatusBar } from 'expo-status-bar';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { generateLookWithGemini } from './src/services/gemini';

type Screen = 'create' | 'result';

type Outfit = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
};

const outfits: Outfit[] = [
  {
    id: 'shirt',
    title: 'Classic Linen Shirt',
    subtitle: 'Premium White',
    image:
      'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=700&q=80',
  },
  {
    id: 'blazer',
    title: 'Modern Navy Blazer',
    subtitle: 'Tailored Fit',
    image:
      'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=700&q=80',
  },
  {
    id: 'dress',
    title: 'Summer Wrap Dress',
    subtitle: 'Beige Floral',
    image:
      'https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?auto=format&fit=crop&w=700&q=80',
  },
  {
    id: 'coat',
    title: 'Structured Overcoat',
    subtitle: 'Charcoal Grey',
    image:
      'https://images.unsplash.com/photo-1548883354-94bcfe321cbb?auto=format&fit=crop&w=700&q=80',
  },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>('create');
  const [selectedOutfitId, setSelectedOutfitId] = useState('blazer');
  const [customOutfit, setCustomOutfit] = useState<Outfit | null>(null);
  const [productUrlInput, setProductUrlInput] = useState('');
  const [isExtractingProduct, setIsExtractingProduct] = useState(false);

  const [sourceImageUri, setSourceImageUri] = useState('');
  const [sourceImageBase64, setSourceImageBase64] = useState('');
  const [sourceImageMimeType, setSourceImageMimeType] = useState('image/jpeg');

  const [productImageBase64, setProductImageBase64] = useState('');
  const [productImageMimeType, setProductImageMimeType] = useState('image/jpeg');

  const [generatedImageUri, setGeneratedImageUri] = useState('');
  const [geminiNote, setGeminiNote] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const selectedOutfit = useMemo(() => {
    if (selectedOutfitId === 'custom' && customOutfit) {
      return customOutfit;
    }
    return outfits.find((item) => item.id === selectedOutfitId) ?? outfits[1];
  }, [selectedOutfitId, customOutfit]);

  async function onPickPhotoFromGallery() {
    setErrorMessage('');

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage('Photo library permission is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
      base64: true,
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    if (!asset.base64) {
      setErrorMessage('Could not read selected photo. Try another image.');
      return;
    }

    setSourceImageUri(asset.uri);
    setSourceImageBase64(asset.base64);
    setSourceImageMimeType(asset.mimeType || 'image/jpeg');
  }

  async function onCapturePhotoFromCamera() {
    setErrorMessage('');

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage('Camera permission is required.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
      base64: true,
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    if (!asset.base64) {
      setErrorMessage('Could not read captured photo. Please try again.');
      return;
    }

    setSourceImageUri(asset.uri);
    setSourceImageBase64(asset.base64);
    setSourceImageMimeType(asset.mimeType || 'image/jpeg');
  }

  async function onPickProductImage() {
    setErrorMessage('');

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage('Photo library permission is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
      base64: true,
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    if (!asset.base64) {
      setErrorMessage('Could not read selected product image.');
      return;
    }

    setCustomOutfit({
      id: 'custom',
      title: 'Custom Product',
      subtitle: 'Uploaded by you',
      image: asset.uri,
    });
    setProductImageBase64(asset.base64);
    setProductImageMimeType(asset.mimeType || 'image/jpeg');
    setSelectedOutfitId('custom');
  }

  async function onExtractProductFromLink() {
    setErrorMessage('');

    const urlValue = productUrlInput.trim();
    if (!urlValue) {
      setErrorMessage('Please paste a product URL first.');
      return;
    }

    let validatedUrl = '';
    try {
      validatedUrl = new URL(urlValue).toString();
    } catch {
      setErrorMessage('Enter a valid URL (including https://).');
      return;
    }

    setIsExtractingProduct(true);

    try {
      const imageUrl = await extractProductImageUrl(validatedUrl);
      const downloaded = await downloadProductImage(imageUrl, validatedUrl);

      setCustomOutfit({
        id: 'custom',
        title: 'Custom Product',
        subtitle: new URL(validatedUrl).hostname,
        image: downloaded.uri,
      });
      setProductImageBase64(downloaded.base64);
      setProductImageMimeType(downloaded.mimeType);
      setSelectedOutfitId('custom');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Could not extract image from this link.';
      setErrorMessage(message);
    } finally {
      setIsExtractingProduct(false);
    }
  }

  async function onGenerate() {
    setErrorMessage('');

    if (!sourceImageBase64) {
      setErrorMessage('Please upload or capture your photo first.');
      return;
    }

    setIsGenerating(true);

    try {
      const result = await generateLookWithGemini({
        outfitName: selectedOutfit.title,
        sourceImageBase64,
        sourceImageMimeType,
        productImageBase64: productImageBase64 || undefined,
        productImageMimeType: productImageBase64 ? productImageMimeType : undefined,
      });

      setGeminiNote(result.note);

      if (result.generatedImageBase64) {
        setGeneratedImageUri(
          `data:${result.generatedImageMimeType};base64,${result.generatedImageBase64}`
        );
      } else {
        setGeneratedImageUri('');
      }

      setScreen('result');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Generation failed. Please try again.';
      setErrorMessage(message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function onDownloadResult() {
    if (!generatedImageUri) {
      Alert.alert('No image available', 'Generate a result first.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      const fileUri = await saveImageToCache(generatedImageUri);
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!sharingAvailable) {
        throw new Error('Sharing is not available on this device.');
      }

      await Sharing.shareAsync(fileUri, {
        dialogTitle: 'Save generated look',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not save image right now.';
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.appShell}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <Text style={styles.brandIconText}>T</Text>
          </View>
          <Text style={styles.brandName}>Trynex</Text>
        </View>
        <Text style={styles.headerTag}>Gemini API</Text>
      </View>

      {screen === 'create' ? (
        <CreateScreen
          selectedOutfitId={selectedOutfitId}
          selectedOutfit={selectedOutfit}
          onSelectOutfit={setSelectedOutfitId}
          sourceImageUri={sourceImageUri}
          productUrlInput={productUrlInput}
          onProductUrlChange={setProductUrlInput}
          onPickPhoto={onPickPhotoFromGallery}
          onCapturePhoto={onCapturePhotoFromCamera}
          onPickProductImage={onPickProductImage}
          onExtractProductFromLink={onExtractProductFromLink}
          isExtractingProduct={isExtractingProduct}
          onGenerate={onGenerate}
          isGenerating={isGenerating}
          errorMessage={errorMessage}
          hasCustomOutfit={Boolean(customOutfit)}
        />
      ) : (
        <ResultScreen
          sourceImageUri={sourceImageUri}
          generatedImageUri={generatedImageUri}
          hasGeneratedImage={Boolean(generatedImageUri)}
          selectedOutfit={selectedOutfit}
          geminiNote={geminiNote}
          isSaving={isSaving}
          onDownload={onDownloadResult}
          onTryAnother={() => {
            setErrorMessage('');
            setScreen('create');
          }}
        />
      )}
    </SafeAreaView>
  );
}

function CreateScreen({
  selectedOutfitId,
  selectedOutfit,
  onSelectOutfit,
  sourceImageUri,
  productUrlInput,
  onProductUrlChange,
  onPickPhoto,
  onCapturePhoto,
  onPickProductImage,
  onExtractProductFromLink,
  isExtractingProduct,
  onGenerate,
  isGenerating,
  errorMessage,
  hasCustomOutfit,
}: {
  selectedOutfitId: string;
  selectedOutfit: Outfit;
  onSelectOutfit: (id: string) => void;
  sourceImageUri: string;
  productUrlInput: string;
  onProductUrlChange: (value: string) => void;
  onPickPhoto: () => void;
  onCapturePhoto: () => void;
  onPickProductImage: () => void;
  onExtractProductFromLink: () => void;
  isExtractingProduct: boolean;
  onGenerate: () => void;
  isGenerating: boolean;
  errorMessage: string;
  hasCustomOutfit: boolean;
}) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <Text style={styles.mainTitle}>Create Your Look</Text>
      <Text style={styles.mainSubtitle}>
        Upload your photo, select or upload an item, then generate with Gemini.
      </Text>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>1. Upload Your Photo</Text>
        <View style={styles.uploadZone}>
          {sourceImageUri ? (
            <Image source={{ uri: sourceImageUri }} style={styles.previewImage} />
          ) : (
            <>
              <View style={styles.uploadIconWrap}>
                <Feather name="upload-cloud" size={22} color="#f97316" />
              </View>
              <Text style={styles.uploadTitle}>Add a clear front-facing photo</Text>
              <Text style={styles.uploadSub}>JPG or PNG up to 5MB</Text>
            </>
          )}

          <View style={styles.rowButtons}>
            <Pressable style={styles.primaryBtnSmall} onPress={onPickPhoto}>
              <Feather name="image" size={14} color="#fff" />
              <Text style={styles.primaryBtnText}>Gallery</Text>
            </Pressable>
            <Pressable style={styles.primaryBtnSmall} onPress={onCapturePhoto}>
              <Feather name="camera" size={14} color="#fff" />
              <Text style={styles.primaryBtnText}>Camera</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>2. Choose an Item</Text>

        <View style={styles.rowButtons}>
          <Pressable style={styles.secondaryActionBtn} onPress={onPickProductImage}>
            <Feather name="upload" size={14} color="#111827" />
            <Text style={styles.secondaryBtnText}>Upload Item</Text>
          </Pressable>
        </View>

        <View style={styles.linkRow}>
          <TextInput
            value={productUrlInput}
            onChangeText={onProductUrlChange}
            placeholder="Paste product link (https://...)"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.linkInput}
          />
          <Pressable
            style={styles.extractBtn}
            onPress={onExtractProductFromLink}
            disabled={isExtractingProduct}
          >
            {isExtractingProduct ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Extract</Text>
            )}
          </Pressable>
        </View>

        {hasCustomOutfit ? (
          <View style={styles.customItemCard}>
            <Image source={{ uri: selectedOutfit.image }} style={styles.customItemImage} />
            <View style={styles.customItemTextWrap}>
              <Text style={styles.outfitTitle}>{selectedOutfit.title}</Text>
              <Text style={styles.outfitSubtitle}>{selectedOutfit.subtitle}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.outfitGrid}>
          {outfits.map((item) => {
            const selected = item.id === selectedOutfitId;
            return (
              <Pressable
                key={item.id}
                style={[styles.outfitCard, selected && styles.outfitCardSelected]}
                onPress={() => onSelectOutfit(item.id)}
              >
                <Image source={{ uri: item.image }} style={styles.outfitImage} />
                <Text style={styles.outfitTitle}>{item.title}</Text>
                <Text style={styles.outfitSubtitle}>{item.subtitle}</Text>
                <View style={[styles.selectPill, selected && styles.selectPillOn]}>
                  <Text style={[styles.selectPillText, selected && styles.selectPillTextOn]}>
                    {selected ? 'Selected' : 'Select'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <Pressable style={styles.primaryBtnFull} onPress={onGenerate} disabled={isGenerating}>
        {isGenerating ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>Generate Try-On</Text>
        )}
      </Pressable>
      <Text style={styles.helperText}>
        Your Try-On is running.It would take a few moments.
      </Text>
    </ScrollView>
  );
}

function ResultScreen({
  sourceImageUri,
  generatedImageUri,
  hasGeneratedImage,
  selectedOutfit,
  geminiNote,
  isSaving,
  onDownload,
  onTryAnother,
}: {
  sourceImageUri: string;
  generatedImageUri: string;
  hasGeneratedImage: boolean;
  selectedOutfit: Outfit;
  geminiNote: string;
  isSaving: boolean;
  onDownload: () => void;
  onTryAnother: () => void;
}) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.successBanner}>
        <View style={styles.successDot}>
          <Ionicons name="checkmark" size={14} color="#fff" />
        </View>
        <View style={styles.successTextWrap}>
          <Text style={styles.successTitle}>Look generated successfully.</Text>
          <Text style={styles.successBody}>Gemini processed your request.</Text>
        </View>
      </View>

      <View style={styles.compareWrap}>
        <View style={styles.compareCardHalf}>
          <Text style={styles.compareCardTitle}>Original</Text>
          <Image source={{ uri: sourceImageUri }} style={styles.resultImageHalf} />
        </View>
        <View style={styles.compareCardHalf}>
          <Text style={styles.compareCardTitle}>
            {hasGeneratedImage ? 'Generated' : 'Generated (Preview)'}
          </Text>
          <Image
            source={{ uri: generatedImageUri || selectedOutfit.image }}
            style={styles.resultImageHalf}
          />
          {!hasGeneratedImage ? (
            <Text style={styles.previewHint}>
              Model returned text only, showing outfit preview.
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.compareCard}>
        <Text style={styles.compareLabel}>{selectedOutfit.title}</Text>
        {geminiNote ? <Text style={styles.geminiNote}>{geminiNote}</Text> : null}
      </View>

      <View style={styles.resultActions}>
        <Pressable style={styles.primaryBtnWide} onPress={onDownload} disabled={isSaving}>
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="download" size={14} color="#fff" />
          )}
          <Text style={styles.primaryBtnText}>{isSaving ? 'Saving...' : 'Download'}</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtnWide} onPress={onTryAnother}>
          <Feather name="refresh-cw" size={14} color="#111827" />
          <Text style={styles.secondaryBtnText}>Try Another</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: '#f4f4f5',
  },
  header: {
    height: 62,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8f8f8',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandIconText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '700',
  },
  brandName: {
    fontSize: 18,
    color: '#111827',
    fontWeight: '700',
  },
  headerTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#f97316',
    backgroundColor: '#fff7ed',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  page: {
    flex: 1,
  },
  pageContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 24,
  },
  mainTitle: {
    fontSize: 36,
    lineHeight: 38,
    color: '#0f172a',
    fontWeight: '900',
  },
  mainSubtitle: {
    color: '#64748b',
    fontSize: 14,
  },
  panel: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10,
  },
  panelTitle: {
    fontSize: 18,
    color: '#0f172a',
    fontWeight: '800',
  },
  uploadZone: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    padding: 18,
    alignItems: 'center',
    gap: 10,
  },
  uploadIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff1e6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTitle: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '700',
  },
  uploadSub: {
    fontSize: 12,
    color: '#64748b',
  },
  previewImage: {
    width: '100%',
    height: 230,
    borderRadius: 12,
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkRow: {
    flexDirection: 'row',
    gap: 8,
  },
  linkInput: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#111827',
  },
  extractBtn: {
    height: 42,
    minWidth: 82,
    borderRadius: 12,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  customItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
    backgroundColor: '#fff7ed',
    padding: 8,
  },
  customItemImage: {
    width: 52,
    height: 52,
    borderRadius: 8,
  },
  customItemTextWrap: {
    flex: 1,
  },
  outfitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  outfitCard: {
    width: '48.5%',
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
  },
  outfitCardSelected: {
    borderColor: '#f97316',
    backgroundColor: '#fff7ed',
  },
  outfitImage: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    marginBottom: 6,
  },
  outfitTitle: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
  },
  outfitSubtitle: {
    color: '#64748b',
    fontSize: 11,
    marginBottom: 8,
  },
  selectPill: {
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectPillOn: {
    backgroundColor: '#f97316',
  },
  selectPillText: {
    fontSize: 11,
    color: '#111827',
    fontWeight: '700',
  },
  selectPillTextOn: {
    color: '#fff',
  },
  primaryBtnSmall: {
    backgroundColor: '#f97316',
    borderRadius: 20,
    height: 40,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    flexDirection: 'row',
    gap: 7,
  },
  secondaryActionBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    flexDirection: 'row',
    gap: 7,
  },
  primaryBtnFull: {
    backgroundColor: '#f97316',
    borderRadius: 22,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  primaryBtnWide: {
    flex: 1,
    backgroundColor: '#f97316',
    borderRadius: 16,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    flexDirection: 'row',
    gap: 8,
  },
  secondaryBtnWide: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryBtnText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  helperText: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 12,
    textAlign: 'center',
  },
  successBanner: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fdba74',
    backgroundColor: '#fff7ed',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  successDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  successTextWrap: {
    flex: 1,
  },
  successTitle: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '700',
  },
  successBody: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 3,
  },
  compareWrap: {
    flexDirection: 'row',
    gap: 10,
  },
  compareCardHalf: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 8,
  },
  compareCardTitle: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  resultImageHalf: {
    width: '100%',
    height: 260,
    borderRadius: 12,
  },
  previewHint: {
    color: '#92400e',
    fontSize: 11,
    marginTop: 6,
  },
  compareCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 8,
  },
  compareLabel: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
  },
  geminiNote: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
  resultActions: {
    flexDirection: 'row',
    gap: 10,
  },
});

async function saveImageToCache(imageUri: string): Promise<string> {
  if (!FileSystem.cacheDirectory) {
    throw new Error('Cache directory is unavailable.');
  }

  const timestamp = Date.now();

  if (imageUri.startsWith('data:')) {
    const match = imageUri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
    if (!match) {
      throw new Error('Unsupported image format.');
    }

    const mimeType = match[1];
    const base64 = match[2];
    const extension = mimeType.includes('png') ? 'png' : 'jpg';
    const fileUri = `${FileSystem.cacheDirectory}gemini-look-${timestamp}.${extension}`;

    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return fileUri;
  }

  const fileUri = `${FileSystem.cacheDirectory}gemini-look-${timestamp}.jpg`;
  await FileSystem.copyAsync({ from: imageUri, to: fileUri });
  return fileUri;
}

async function extractProductImageUrl(pageUrl: string): Promise<string> {
  if (isLikelyImageUrl(pageUrl)) {
    return pageUrl;
  }

  const host = new URL(pageUrl).hostname.toLowerCase();
  const html = await fetchPageHtmlWithFallback(pageUrl);

  const platformImage = extractPlatformImageUrl(host, html, pageUrl);
  if (platformImage) {
    return platformImage;
  }

  const candidates = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i,
    /"image"\s*:\s*"([^"]+)"/i,
    /"image"\s*:\s*\[\s*"([^"]+)"/i,
    /<img[^>]+srcset=["']([^"']+)["']/i,
    /<img[^>]+src=["']([^"']+)["'][^>]*class=["'][^"']*(product|main|hero)[^"']*["']/i,
    /<img[^>]+src=["']([^"']+)["'][^>]*alt=["'][^"']*(product|dress|shirt|blazer|coat)[^"']*["']/i,
  ];

  for (const regex of candidates) {
    const match = html.match(regex);
    const raw = match?.[1]?.trim();
    if (raw) {
      const firstCandidate = raw.includes(',') ? raw.split(',')[0].trim().split(' ')[0] : raw;
      const cleaned = decodeHtmlEntities(firstCandidate).replace(/\\\//g, '/');
      return new URL(cleaned, pageUrl).toString();
    }
  }

  // Wide-net fallback: find any absolute image URL in the HTML content.
  const absoluteImageMatches = html.match(/https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp|avif)(?:\?[^\s"'<>]*)?/gi);
  if (absoluteImageMatches?.length) {
    const preferred = absoluteImageMatches.find((url) =>
      /assets\.myntassets\.com|rukminim\d*\.flixcart\.com/i.test(url)
    );
    return preferred || absoluteImageMatches[0];
  }

  throw new Error('Could not extract a product image from this link. Try a direct product image URL or use Upload Item.');
}

function extractPlatformImageUrl(host: string, html: string, pageUrl: string): string | null {
  const decodedHtml = html.replace(/\\\//g, '/');

  if (host.includes('myntra.com')) {
    const myntraPatterns = [
      /https?:\/\/assets\.myntassets\.com\/[^\s"'<>]+\.(?:png|jpe?g|webp|avif)(?:\?[^\s"'<>]*)?/i,
      /"imageURL"\s*:\s*"([^"]*assets\.myntassets\.com[^"]+)"/i,
      /"searchImage"\s*:\s*"([^"]*assets\.myntassets\.com[^"]+)"/i,
    ];

    for (const pattern of myntraPatterns) {
      const match = decodedHtml.match(pattern);
      const value = (match?.[1] || match?.[0] || '').trim();
      if (value) {
        return new URL(decodeHtmlEntities(value), pageUrl).toString();
      }
    }
  }

  if (host.includes('flipkart.com')) {
    const flipkartPatterns = [
      /https?:\/\/rukminim\d*\.flixcart\.com\/[^\s"'<>]+\.(?:png|jpe?g|webp|avif)(?:\?[^\s"'<>]*)?/i,
      /"imageUrl"\s*:\s*"([^"]*rukminim\d*\.flixcart\.com[^"]+)"/i,
      /"url"\s*:\s*"([^"]*rukminim\d*\.flixcart\.com[^"]+)"/i,
    ];

    for (const pattern of flipkartPatterns) {
      const match = decodedHtml.match(pattern);
      const value = (match?.[1] || match?.[0] || '').trim();
      if (value) {
        return new URL(decodeHtmlEntities(value), pageUrl).toString();
      }
    }
  }

  return null;
}

async function fetchPageHtmlWithFallback(pageUrl: string): Promise<string> {
  const direct = await fetch(pageUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (direct.ok) {
    return direct.text();
  }

  const stripped = pageUrl.replace(/^https?:\/\//i, '');
  const proxyUrl = `https://r.jina.ai/http://${stripped}`;
  const proxied = await fetch(proxyUrl);
  if (proxied.ok) {
    return proxied.text();
  }

  throw new Error('Unable to fetch this product page. This website may block scraping.');
}

async function downloadProductImage(
  imageUrl: string,
  sourcePageUrl: string
): Promise<{ uri: string; base64: string; mimeType: string }> {
  if (!FileSystem.cacheDirectory) {
    throw new Error('Cache directory unavailable.');
  }

  const mimeType = inferMimeTypeFromUrl(imageUrl);
  const extension = extensionFromMimeType(mimeType);
  const localUri = `${FileSystem.cacheDirectory}product-${Date.now()}.${extension}`;

  try {
    const downloaded = await FileSystem.downloadAsync(imageUrl, localUri, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
        Referer: sourcePageUrl,
      },
    });
    const base64 = await FileSystem.readAsStringAsync(downloaded.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return { uri: downloaded.uri, base64, mimeType };
  } catch {
    const proxied = await FileSystem.downloadAsync(
      `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl.replace(/^https?:\/\//i, ''))}`,
      localUri
    );
    const base64 = await FileSystem.readAsStringAsync(proxied.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return { uri: proxied.uri, base64, mimeType: 'image/jpeg' };
  }
}

function isLikelyImageUrl(url: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp|avif)(\?|$)/i.test(url);
}

function inferMimeTypeFromUrl(url: string): string {
  if (/\.png(\?|$)/i.test(url)) {
    return 'image/png';
  }
  if (/\.webp(\?|$)/i.test(url)) {
    return 'image/webp';
  }
  if (/\.gif(\?|$)/i.test(url)) {
    return 'image/gif';
  }
  if (/\.avif(\?|$)/i.test(url)) {
    return 'image/avif';
  }
  return 'image/jpeg';
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === 'image/png') {
    return 'png';
  }
  if (mimeType === 'image/webp') {
    return 'webp';
  }
  if (mimeType === 'image/gif') {
    return 'gif';
  }
  if (mimeType === 'image/avif') {
    return 'avif';
  }
  return 'jpg';
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
