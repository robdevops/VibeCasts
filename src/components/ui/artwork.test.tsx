import { fireEvent, render, screen } from '@testing-library/react-native';

import { Artwork } from './artwork';

jest.mock('@/artwork/thumbs', () => ({ tileThumbPx: () => 300, useThumb: () => undefined, thumbFailed: jest.fn() }));
jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native');
  return { Image: (props: object) => <View testID="img" {...props} /> };
});

describe('Artwork placeholder letter', () => {
  it('hides once its picture has loaded, and comes back when the same instance is given a different picture', async () => {
    const { rerender } = await render(<Artwork uri="https://a.example/1.jpg" title="Zed" size={100} />);
    expect(screen.getByText('Z')).toBeTruthy();
    await fireEvent(screen.getByTestId('img'), 'load');
    expect(screen.queryByText('Z')).toBeNull();
    await rerender(<Artwork uri="https://a.example/2.jpg" title="Yan" size={100} />);
    expect(screen.getByText('Y')).toBeTruthy();
  });
});
