import { SafeAreaView } from 'react-native-safe-area-context';

import { Counter } from '@/components/counter';

export default function CounterScreen() {
  return (
    <SafeAreaView style={{ flex: 1, justifyContent: 'center' }}>
      <Counter />
    </SafeAreaView>
  );
}
