import { render, screen } from '@testing-library/react-native';

import { Badge } from './badge';

it('shows the unplayed count', async () => {
  await render(<Badge count={7} />);
  expect(screen.getByText('7')).toBeOnTheScreen();
});

it('caps at 99', async () => {
  await render(<Badge count={250} />);
  expect(screen.getByText('99')).toBeOnTheScreen();
});

it('renders nothing for zero', async () => {
  await render(<Badge count={0} />);
  expect(screen.queryByLabelText('0 unplayed')).toBeNull();
  expect(screen.queryByText('0')).toBeNull();
});
