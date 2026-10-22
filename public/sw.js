self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    const payload = { type: 'rest-open', sessionId: data.sessionId, dayId: data.dayId, id: data.id || event.notification.tag };
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clients.find((client) => 'focus' in client);
    if (existing) {
      existing.postMessage(payload);
      await existing.focus();
      return;
    }
    const opened = await self.clients.openWindow('/');
    opened?.postMessage(payload);
  })());
});
