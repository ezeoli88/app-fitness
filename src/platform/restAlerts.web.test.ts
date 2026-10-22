/** @jest-environment jsdom */

import { restAlerts } from '@/platform/restAlerts';

test('cuenta el descanso en el título y lo restaura', () => {
  document.title = 'Entrenar';
  restAlerts.countdown(65);
  expect(document.title).toBe('1:05 · Descanso · Rutina');
  restAlerts.countdown(null);
  expect(document.title).toBe('Entrenar');
});

test('programa y cancela un aviso', async () => {
  jest.useFakeTimers();
  const id = await restAlerts.schedule({ sessionId: 4, dayId: 2, fireAt: Date.now() + 5_000 });
  expect(id).toBeTruthy();
  expect(await restAlerts.listScheduled()).toEqual([{ id, sessionId: 4 }]);
  await restAlerts.cancel(id);
  expect(await restAlerts.listScheduled()).toEqual([]);
  jest.useRealTimers();
});
