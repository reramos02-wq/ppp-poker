// PPP Poker — Firebase Cloud Messaging Service Worker
// Handles push notifications while the app is closed or in background.

importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyA-VcO_q6mvXIUh4Vbt1hStmQnnar2kKM4",
  authDomain: "pppoker-c5f0d.firebaseapp.com",
  projectId: "pppoker-c5f0d",
  storageBucket: "pppoker-c5f0d.firebasestorage.app",
  messagingSenderId: "768897236923",
  appId: "1:768897236923:web:7dfa0b74354b47ca4"
});

const messaging = firebase.messaging();

// Background message handler — fires when the app/tab is closed or not focused.
// Notifications sent with a "notification" payload from the server are shown
// automatically by the browser; this handler covers "data-only" payloads too,
// giving us full control over title/body/icon/click behavior.
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || (payload.notification && payload.notification.title) || "PPP Poker";
  const body  = data.body  || (payload.notification && payload.notification.body)  || "";
  const url   = data.url || "/";

  const options = {
    body,
    icon: data.icon || undefined,
    badge: data.icon || undefined,
    data: { url },
    tag: data.tag || "ppp-poker-notification"
  };

  self.registration.showNotification(title, options);
});

// Clicking the notification opens (or focuses) the app at the relevant URL.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
