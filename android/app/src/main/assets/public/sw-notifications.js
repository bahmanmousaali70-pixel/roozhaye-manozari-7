self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const scheduleId = event.notification.data?.scheduleId || '';
  const targetUrl = scheduleId ? `/?playSchedule=${encodeURIComponent(scheduleId)}` : '/';

  event.waitUntil(
    self.clients.matchAll({type: 'window', includeUncontrolled: true}).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({type: 'PLAY_SCHEDULE', scheduleId});
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
