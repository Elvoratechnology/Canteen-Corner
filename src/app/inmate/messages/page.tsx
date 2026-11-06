'use client';

import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCircle2,
  DollarSign,
  Package,
  Info,
  Check,
} from 'lucide-react';

interface NotificationMessage {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export default function InmateMessagesPage() {
  const [messages, setMessages] = useState<NotificationMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = () => {
    fetch('/api/inmate/messages')
      .then((res) => res.json())
      .then((data) => {
        if (data?.messages) {
          setMessages(data.messages);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/inmate/messages/${id}/read`, { method: 'PATCH' });
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, read: true } : m))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'DEPOSIT_RECEIVED':
        return <DollarSign className="w-5 h-5 text-emerald-500" />;
      case 'ORDER_RECEIVED':
      case 'ORDER_STATUS':
        return <Package className="w-5 h-5 text-teal-500" />;
      default:
        return <Info className="w-5 h-5 text-teal-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          Messages & Notifications
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Official institutional notifications regarding commissary orders, deposits, and schedule alerts.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : messages.length === 0 ? (
        <div className="bg-white dark:bg-[#121212] p-10 rounded-3xl text-center border border-slate-200 dark:border-[#262626] shadow-sm">
          <Bell className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No Messages</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Your notifications inbox is currently clear.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => {
            const dateStr = new Date(msg.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={msg.id}
                className={`p-4 sm:p-5 rounded-2xl border transition-all flex items-start gap-4 ${
                  msg.read
                    ? 'bg-white dark:bg-[#121212] border-slate-200 dark:border-[#262626] opacity-90'
                    : 'bg-teal-50/60 dark:bg-teal-950/30 border-teal-500/40 shadow-sm'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#181818] border border-slate-200 dark:border-slate-700/60 flex items-center justify-center shrink-0 mt-0.5">
                  {getMessageIcon(msg.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base truncate">
                      {msg.title}
                    </h3>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                      {dateStr}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    {msg.message}
                  </p>
                </div>

                {!msg.read && (
                  <button
                    onClick={() => markAsRead(msg.id)}
                    className="p-2 rounded-xl bg-white dark:bg-[#181818] hover:bg-slate-100 dark:hover:bg-slate-700 text-teal-600 dark:text-teal-400 border border-slate-200 dark:border-slate-700 shrink-0 self-center transition-colors"
                    title="Mark as read"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

