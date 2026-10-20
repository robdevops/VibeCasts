import { ScrollView, StyleSheet } from 'react-native';

import { ELASTIC_SCROLL } from '@/constants/scroll';
import { BookmarkList } from '@/components/podcast/bookmark-list';
import { ThemedView } from '@/components/themed-view';
import { ScreenHeader } from '@/components/ui/screen-header';

export default function BookmarksScreen() {
  return (
    <ThemedView style={styles.fill}>
      <ScreenHeader title="Bookmarks" back />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} {...ELASTIC_SCROLL}>
        <BookmarkList emptyText="Bookmarks you add while listening will show up here." />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
