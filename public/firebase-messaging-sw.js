importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  projectId: "yogo-teacher",
  appId: "1:413762145369:web:1a2fdaac0edb80f25c7548",
  apiKey: "AIzaSyAt3Iv3Vb71SFXjPmJ8X6zgaRZucb9LU8s",
  authDomain: "yogo-teacher.firebaseapp.com",
  messagingSenderId: "413762145369",
  storageBucket: "yogo-teacher.firebasestorage.app"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // If the push notification payload already contains a 'notification' object,
  // the browser / FCM client automatically displays a notification.
  // Calling showNotification here will cause DUPLICATE notifications.
  if (payload.notification) {
    console.log('[firebase-messaging-sw.js] Notification already handled by browser natively.');
    return;
  }

  // Fallback for data-only messages
  const notificationTitle = payload.data?.title || '新しい通知';
  const notificationOptions = {
    body: payload.data?.body || '',
    icon: '/vite.svg',
    tag: 'daily-reminder',
    renotify: false
  };

  try {
    return self.registration.showNotification(notificationTitle, notificationOptions);
  } catch (error) {
    console.error('[firebase-messaging-sw.js] Error showing notification:', error);
  }
});
