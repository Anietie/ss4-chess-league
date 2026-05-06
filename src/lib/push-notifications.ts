const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export async function subscribeToPush(
  playerId: string,
): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("[push] Push notifications not supported");
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    const existingSubscription =
      await registration.pushManager.getSubscription();
    if (existingSubscription) {
      await saveSubscription(playerId, existingSubscription);
      return existingSubscription;
    }

    if (!VAPID_PUBLIC_KEY) {
      console.error("[push] VAPID_PUBLIC_KEY not configured");
      return null;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        VAPID_PUBLIC_KEY,
      ) as BufferSource,
    });

    await saveSubscription(playerId, subscription);
    return subscription;
  } catch (error) {
    console.error("[push] Subscription failed:", error);
    return null;
  }
}

export async function unsubscribeFromPush(playerId: string): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: playerId,
          endpoint: subscription.endpoint,
        }),
      });
    }
  } catch (error) {
    console.error("[push] Unsubscribe failed:", error);
  }
}

export async function checkNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";

  let permission = Notification.permission;

  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  return permission;
}

async function saveSubscription(
  playerId: string,
  subscription: PushSubscription,
): Promise<void> {
  const key = subscription.getKey("p256dh");
  const auth = subscription.getKey("auth");

  if (!key || !auth) return;

  try {
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_id: playerId,
        endpoint: subscription.endpoint,
        p256dh: btoa(String.fromCharCode(...new Uint8Array(key))),
        auth: btoa(String.fromCharCode(...new Uint8Array(auth))),
      }),
    });
  } catch (error) {
    console.error("[push] Failed to save subscription:", error);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
