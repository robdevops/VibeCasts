import { fireEvent, render, screen } from '@testing-library/react-native';

import { Counter } from './counter';

test('increments the count when pressed', async () => {
  await render(<Counter />);
  expect(screen.getByTestId('count')).toHaveTextContent('0');
  await fireEvent.press(screen.getByText('Increment'));
  expect(screen.getByTestId('count')).toHaveTextContent('1');
});
