import { pointsErrorMessage } from './points';

it('traduce los errores de la base', () => {
  expect(pointsErrorMessage('outside_window')).toBe(
    'Los puntos se suman desde que empieza la función hasta 7 días después.',
  );
  expect(pointsErrorMessage('otro')).toBe('No se pudo completar: otro');
});
