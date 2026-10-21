import { fireEvent, render, screen } from '@testing-library/react-native';

import { MenuSheet } from './menu-sheet';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }) }));

const items = [{ label: 'One', onPress: () => {} }, { label: 'Two', onPress: () => {} }];

describe('MenuSheet height', () => {
  it('is as tall as its measured rows (a wrapped label makes them taller), and does not scroll', async () => {
    await render(<MenuSheet visible items={items} onClose={() => {}} />);
    await fireEvent(screen.getByTestId('menu-content'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 240, height: 190 } } });
    const scroll = screen.getByTestId('menu-scroll');
    expect(scroll.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ height: 190 })]));
    expect(scroll.props.scrollEnabled).toBe(false);
  });

  it('only scrolls, at a capped height, when the rows are taller than the screen allows', async () => {
    await render(<MenuSheet visible items={items} onClose={() => {}} />);
    await fireEvent(screen.getByTestId('menu-content'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 240, height: 5000 } } });
    const scroll = screen.getByTestId('menu-scroll');
    expect(scroll.props.scrollEnabled).toBe(true);
    const height = (scroll.props.style as { height?: number }[]).find((x) => x && x.height)?.height ?? 0;
    expect(height).toBeGreaterThan(0);
    expect(height).toBeLessThan(5000);
  });
});
