export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
};

export const sendNotification = async (title, body, icon = '/icon-192.png') => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  
  // Only notify if the tab is hidden (running in background)
  if (document.visibilityState === 'visible') return;

  const options = {
    body,
    icon,
    badge: '/icon-192.png',
    vibrate: [200, 100, 200]
  };

  try {
    const registration = await navigator.serviceWorker.ready;
    if (registration && registration.showNotification) {
      await registration.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
  } catch (e) {
    console.warn("ServiceWorker notification failed, fallback to Notification API:", e);
    new Notification(title, options);
  }
};
