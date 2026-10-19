import { fireEvent, render, screen } from '@testing-library/react-native';
import type { EventSummary } from '@/api/types';
import { EventMap } from './EventMap';
import type { VenuePin } from './venues';

// react-native-maps es nativo: en el test, MapView y Marker son vistas con sus props.
const mockAnimateToRegion = jest.fn();
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MapView = React.forwardRef((props: object, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ animateToRegion: mockAnimateToRegion }));
    return <View testID="map" {...props} />;
  });
  const Marker = (props: object) => <View {...props} />;
  return { __esModule: true, default: MapView, Marker, PROVIDER_GOOGLE: 'google' };
});

const pin = (key: string, name: string, n: number, lat = -34.6): VenuePin => ({
  key,
  name,
  lat,
  lng: -58.38,
  distance: null,
  events: Array.from({ length: n }, (_, i) => ({ id: `${key}${i}` }) as EventSummary),
});
const pins = [pin('a', 'Teatro Colón', 3), pin('b', 'Usina del Arte', 1, -34.63)];

describe('EventMap (nativo)', () => {
  beforeEach(() => mockAnimateToRegion.mockClear());

  it('nombra cada sala con su cantidad y la elige al tocarla', async () => {
    const onSelect = jest.fn();
    await render(
      <EventMap pins={pins} me={null} selected={null} onSelect={onSelect} height={500} />,
    );
    await fireEvent.press(screen.getByLabelText('Usina del Arte · 1 evento'));
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(screen.getByLabelText('Teatro Colón · 3 eventos')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('tocar el mapa cierra la hoja, salvo que el toque sea sobre un punto', async () => {
    const onSelect = jest.fn();
    await render(<EventMap pins={pins} me={null} selected="a" onSelect={onSelect} height={500} />);
    const map = screen.getByTestId('map');
    await fireEvent(map, 'press', { nativeEvent: { action: 'marker-press' } });
    expect(onSelect).not.toHaveBeenCalled();
    await fireEvent(map, 'press', { nativeEvent: { action: 'press' } });
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('lleva la sala elegida arriba del centro', async () => {
    const { rerender } = await render(
      <EventMap pins={pins} me={null} selected={null} onSelect={jest.fn()} height={500} />,
    );
    await rerender(
      <EventMap pins={pins} me={null} selected="b" onSelect={jest.fn()} height={500} />,
    );
    const [region] = mockAnimateToRegion.mock.calls.at(-1) ?? [];
    expect(region.longitude).toBe(-58.38);
    expect(region.latitude).toBeLessThan(-34.63);
  });
});
