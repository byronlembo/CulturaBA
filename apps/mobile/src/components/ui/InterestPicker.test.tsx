import { render, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { InterestPicker, interestsHint, toggleInterest } from './InterestPicker';

describe('toggleInterest / interestsHint', () => {
  it('adds, removes and respects the maximum', () => {
    expect(toggleInterest([], 'cine')).toEqual(['cine']);
    expect(toggleInterest(['cine'], 'cine')).toEqual([]);
    expect(toggleInterest(['a', 'b', 'c'], 'd', 3)).toEqual(['a', 'b', 'c']);
    expect(toggleInterest(['a', 'b', 'c'], 'a', 3)).toEqual(['b', 'c']);
  });

  it('explains the rules', () => {
    expect(interestsHint(0, 2, 3)).toBe('Elegí al menos 2 (hasta 3)');
    expect(interestsHint(2, 2, 3)).toBe('2 de 3');
    expect(interestsHint(3, 2, 3)).toBe('Máximo 3. Podés cambiarlos después en tu perfil.');
    expect(interestsHint(4, 1)).toBe('4 seleccionados');
  });
});

function Harness() {
  const [value, setValue] = useState<string[]>([]);
  return <InterestPicker value={value} onChange={setValue} min={2} max={3} />;
}

describe('<InterestPicker />', () => {
  it('renders the 9 categories and enforces the 2–3 rule through taps', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    expect(screen.getAllByRole('button')).toHaveLength(10);
    expect(screen.getByText('Elegí al menos 2 (hasta 3)')).toBeTruthy();

    await user.press(screen.getByText('Cine'));
    await user.press(screen.getByText('Danza'));
    expect(screen.getByText('2 de 3')).toBeTruthy();

    await user.press(screen.getByText('Teatro y artes escénicas'));
    expect(screen.getByText('Máximo 3. Podés cambiarlos después en tu perfil.')).toBeTruthy();

    // A fourth tap is ignored.
    await user.press(screen.getByText('Ópera y música clásica'));
    expect(screen.getByText('Máximo 3. Podés cambiarlos después en tu perfil.')).toBeTruthy();
    expect(screen.getAllByRole('button', { selected: true })).toHaveLength(3);
  });
});
