import { confirm, currentConfirm, dismissConfirm, subscribeConfirm } from '@/ui/confirm';

test('keeps a confirmation requested before the host mounts', () => {
  const seen: string[] = [];
  confirm({ title: 'Archivar', actions: [{ text: 'Cancelar', style: 'cancel' }] });
  const stop = subscribeConfirm((request) => { seen.push(request?.title ?? 'cerrado'); });
  expect(seen).toEqual(['Archivar']);
  expect(currentConfirm()?.title).toBe('Archivar');
  dismissConfirm();
  expect(seen).toEqual(['Archivar', 'cerrado']);
  stop();
});
