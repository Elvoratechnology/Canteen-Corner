'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckCircle2,
  DollarSign,
  Package,
  Info,
  Check,
  CheckCheck,
  ArrowLeft,
  Loader2,
  ArrowRight,
  Wallet,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { getNotificationDestination } from '@/components/inmate/InmateNotificationDropdown';

interface NotificationMessage {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export default function InmateMessagesPage() {
  const router = useRouter();
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

  const markAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await fetch(`/api/inmate/messages/${id}/read`, { method: 'PATCH' });
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, read: true } : m))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch('/api/inmate/messages', { method: 'PATCH' });
      setMessages((prev) => prev.map((m) => ({ ...m, read: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const deleteMessage = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/inmate/messages/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const clearAllMessages = async () => {
    if (!window.confirm('Are you sure you want to delete all notifications?')) {
      return;
    }
    try {
      const res = await fetch('/api/inmate/messages', { method: 'DELETE' });
      if (res.ok) {
        setMessages([]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Click handler: Mark as read and navigate DIRECTLY to destination!
  const handleCardClick = (msg: NotificationMessage) => {
    if (!msg.read) {
      markAsRead(msg.id);
    }
    const dest = getNotificationDestination(msg);
    router.push(dest.href);
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

  const unreadCount = messages.filter((m) => !m.read).length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/inmate"
              className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-neutral-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Home</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Messages & Notifications
            </h1>
            {unreadCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs font-bold border border-red-200 dark:border-red-900/40">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Official institutional notifications. Click any notification to navigate directly to its destination.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50 text-xs font-bold transition-all min-h-[40px] cursor-pointer"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Mark All as Read</span>
            </button>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearAllMessages}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#2a2a2a] text-slate-600 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-200 dark:hover:border-red-900/40 text-xs font-bold transition-all min-h-[40px] cursor-pointer"
              title="Clear all notifications"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear All</span>
            </button>
          )}
        </div>
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
            const dest = getNotificationDestination(msg);
            const DestIcon = dest.icon;
            const dateStr = new Date(msg.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <button
                type="button"
                key={msg.id}
                onClick={() => handleCardClick(msg)}
                className={`w-full text-left p-4 sm:p-5 rounded-2xl border transition-all flex items-start gap-4 cursor-pointer group active:scale-[0.99] select-none ${
                  msg.read
                    ? 'bg-white dark:bg-[#121212] border-slate-200 dark:border-[#262626] hover:bg-slate-50 dark:hover:bg-[#181818]'
                    : 'bg-teal-50/60 dark:bg-teal-950/30 border-teal-500/40 shadow-sm hover:bg-teal-100/50 dark:hover:bg-teal-900/40'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#181818] border border-slate-200 dark:border-slate-700/60 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                  {getMessageIcon(msg.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                        {msg.title}
                      </h3>
                      {!msg.read && (
                        <span className="w-2.5 h-2.5 rounded-full bg-teal-500 shrink-0" />
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                      {dateStr}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                    {msg.message}
                  </p>

                  {/* Direct Destination Pill */}
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-[#202020] text-teal-600 dark:text-teal-400 border border-slate-200/60 dark:border-[#2c2c2c] group-hover:bg-teal-50 dark:group-hover:bg-teal-950/40 transition-colors">
                      <DestIcon className="w-3.5 h-3.5" />
                      <span>{dest.actionText}</span>
                      <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-center">
                  {!msg.read && (
                    <button
                      type="button"
                      onClick={(e) => markAsRead(msg.id, e)}
                      className="p-2 rounded-xl bg-white dark:bg-[#181818] hover:bg-slate-100 dark:hover:bg-slate-700 text-teal-600 dark:text-teal-400 border border-slate-200 dark:border-slate-700 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
                      title="Mark as read without opening"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => deleteMessage(msg.id, e)}
                    className="p-2 rounded-xl bg-white dark:bg-[#181818] hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-400 hover:text-red-500 dark:hover:text-red-400 border border-slate-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-900/40 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
                    title="Delete notification"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
