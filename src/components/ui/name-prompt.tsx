import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { FOLDER_COLORS } from '@/store/library';

type Props = {
  visible: boolean;
  title: string;
  confirmLabel: string;
  initialName?: string;
  initialColor?: string;
  onCancel: () => void;
  onSubmit: (name: string, color: string) => void;
};

export function NamePrompt(props: Props) {
  // Remount the body each time it opens so the fields reset to the initial values.
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onCancel}>
      {props.visible ? <PromptBody {...props} /> : null}
    </Modal>
  );
}

function PromptBody({ title, confirmLabel, initialName = '', initialColor, onCancel, onSubmit }: Props) {
  const theme = useTheme();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor ?? FOLDER_COLORS[0]);
  const valid = name.trim().length > 0;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Cancel" />
      <View style={[styles.card, { backgroundColor: theme.background }]}>
        <ThemedText type="subtitle" style={styles.heading}>
          {title}
        </ThemedText>
        <TextInput
          autoFocus
          value={name}
          onChangeText={setName}
          placeholder="Folder name"
          placeholderTextColor={theme.textSecondary}
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={() => valid && onSubmit(name.trim(), color)}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          accessibilityLabel="Folder name"
        />
        <View style={styles.swatches}>
          {FOLDER_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              accessibilityRole="radio"
              accessibilityState={{ selected: c === color }}
              accessibilityLabel={`Colour ${c}`}
              style={[styles.swatch, { backgroundColor: c, borderColor: c === color ? theme.text : 'transparent' }]}
            />
          ))}
        </View>
        <View style={styles.actions}>
          <Pressable onPress={onCancel} style={styles.action} accessibilityRole="button">
            <ThemedText type="smallBold" themeColor="textSecondary">
              Cancel
            </ThemedText>
          </Pressable>
          <Pressable
            disabled={!valid}
            onPress={() => onSubmit(name.trim(), color)}
            style={[styles.action, { opacity: valid ? 1 : 0.4 }]}
            accessibilityRole="button">
            <ThemedText type="smallBold" themeColor="accent">
              {confirmLabel}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  card: { borderRadius: 16, padding: 20, gap: 16, maxWidth: 420, width: '100%', alignSelf: 'center' },
  heading: { fontSize: 22, lineHeight: 28 },
  input: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  swatches: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 3 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  action: { paddingHorizontal: 14, paddingVertical: 10 },
});
