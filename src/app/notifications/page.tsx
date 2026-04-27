"use client";
import { ArrowLeft, Bell, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function NotificationsPage() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = localStorage.getItem("player_id");
    if (!id) {
      window.location.href = "/auth/login";
      return;
    }
    setPlayerId(id);

    fetch(`/api/notifications?player_id=${id}`)
      .then((r) => r.json())
      .then((d) => {
        setNotifications(d.notifications ?? []);
        setLoading(false);
      });
  }, []);

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_read: true }),
    });
    setNotifications((n) =>
      n.map((x) => (x.id === id ? { ...x, is_read: true } : x)),
    );
  };

  const deleteNotification = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    setNotifications((n) => n.filter((x) => x.id !== id));
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.is_read);
    for (const notif of unread) {
      await markRead(notif.id);
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin text-gold text-2xl">♟</div>
      </div>
    );

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-ink-400 hover:text-chalk transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="font-display text-2xl font-bold text-chalk">
              Notifications
            </h1>
            <p className="text-sm text-ink-400 mt-1">{unread} unread</p>
          </div>
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="text-sm text-gold hover:text-chalk transition-colors"
          >
            Mark all as read
          </button>
        )}
      </div>

      <div className="space-y-2">
        {notifications.length === 0 ? (
          <div className="text-center py-12 text-ink-400">
            <Bell size={32} className="mx-auto mb-3 opacity-50" />
            <p>No notifications yet</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`card p-4 flex items-start justify-between gap-4 cursor-pointer transition-colors ${
                n.is_read ? "bg-ink-800" : "bg-ink-700 border-l-2 border-gold"
              }`}
              onClick={() => !n.is_read && markRead(n.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-chalk">{n.title}</h3>
                  {!n.is_read && (
                    <span className="w-2 h-2 bg-gold rounded-full flex-shrink-0" />
                  )}
                </div>
                <p className="text-sm text-ink-300 mt-1">{n.message}</p>
                <p className="text-xs text-ink-500 mt-2">
                  {new Date(n.created_at).toLocaleDateString()} at{" "}
                  {new Date(n.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteNotification(n.id);
                }}
                className="text-ink-400 hover:text-red-400 transition-colors flex-shrink-0"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
