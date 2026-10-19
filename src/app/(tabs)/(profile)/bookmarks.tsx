import { ScrollView, StyleSheet } from 'react-native';

import { BookmarkList } from '@/components/podcast/bookmark-list';
import { ThemedView } from '@/components/themed-view';
import { ScreenHeader } from '@/components/ui/screen-header';

export default function BookmarksScreen() {
  return (
    <ThemedView style={styles.fill}>
      <ScreenHeader title="Bookmarks" back />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <BookmarkList emptyText="Bookmarks you add while listening will show up here." />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
