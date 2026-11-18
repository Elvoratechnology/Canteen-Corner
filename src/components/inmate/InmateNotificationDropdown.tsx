'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Check,
  CheckCheck,
  DollarSign,
  Package,
  Info,
  ExternalLink,
  Loader2,
  X,
  ChevronRight,
  ArrowRight,
  Wallet,
  ShoppingBag,
  Trash2,
} from 'lucide-react';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

interface InmateNotificationDropdownProps {
  initialUnreadCount?: number;
  onUnreadCountChange?: (count: number) => void;
}

export function getNotificationDestination(msg: {
  type: string;
  title?: string;
  message?: string;
}) {
  const type = msg.type?.toUpperCase() || '';
  const text = ((msg.title || '') + ' ' + (msg.message || '')).toLowerCase();

  // 1. Deposits & Trust balance
  if (
    type === 'DEPOSIT_RECEIVED' ||
    type.includes('DEPOSIT') ||
    text.includes('deposit') ||
    text.includes('paypal') ||
    text.includes('stripe') ||
    text.includes('trust account') ||
    text.includes('funds')
  ) {
    return {
      href: '/inmate/balance',
      label: 'Trust Balance',
      actionText: 'View in Balance & Deposits',
      icon: Wallet,
    };
  }

  // 2. Orders & Deliveries
  if (
    type === 'ORDER_STATUS' ||
    type === 'ORDER_RECEIVED' ||
    type.includes('ORDER') ||
    text.includes('order') ||
    text.includes('delivery') ||
    text.includes('delivered')
  ) {
    return {
      href: '/inmate/orders',
      label: 'Order History',
      actionText: 'View in Orders Queue',
      icon: Package,
    };
  }

  // 3. Catalog / Schedule Reminder
  if (
    text.includes('schedule') ||
    text.includes('commissary order') ||
    text.includes('catalog')
  ) {
    return {
      href: '/inmate/catalog',
      label: 'Commissary Catalog',
      actionText: 'Go to Commissary Catalog',
      icon: ShoppingBag,
    };
  }

  // 4. Default: Messages Inbox
  return {
    href: '/inmate/messages',
    label: 'Official Messages',
    actionText: 'View in Messages',
    icon: Info,
  };
}

export function InmateNotificationDropdown({
  initialUnreadCount = 0,
  onUnreadCountChange,
}: InmateNotificationDropdownProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync internal unreadCount when prop updates
  useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Fetch messages when opened
  useEffect(() => {
    if (isOpen) {
      fetchMessages();
    }
  }, [isOpen]);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inmate/messages');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.messages)) {
          setMessages(data.messages);
          const count = data.messages.filter((m: NotificationItem) => !m.read).length;
          setUnreadCount(count);
          onUnreadCountChange?.(count);
        }
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/inmate/messages/${id}/read`, { method: 'PATCH' });
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, read: true } : m))
        );
        setUnreadCount((prev) => {
          const newCount = Math.max(0, prev - 1);
          onUnreadCountChange?.(newCount);
          return newCount;
        });
      }
    } catch (err) {
      console.error('Error marking message read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch('/api/inmate/messages', { method: 'PATCH' });
      if (res.ok) {
        setMessages((prev) => prev.map((m) => ({ ...m, read: true })));
        setUnreadCount(0);
        onUnreadCountChange?.(0);
      }
    } catch (err) {
      console.error('Error marking all messages read:', err);
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/inmate/messages/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const deletedMsg = messages.find((m) => m.id === id);
        setMessages((prev) => prev.filter((m) => m.id !== id));
        if (deletedMsg && !deletedMsg.read) {
          setUnreadCount((prev) => {
            const newCount = Math.max(0, prev - 1);
            onUnreadCountChange?.(newCount);
            return newCount;
          });
        }
      }
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  const handleClearAll = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch('/api/inmate/messages', { method: 'DELETE' });
      if (res.ok) {
        setMessages([]);
        setUnreadCount(0);
        onUnreadCountChange?.(0);
      }
    } catch (err) {
      console.error('Error clearing all notifications:', err);
    }
  };

  // User clicks a notification -> Mark as read, close dropdown, navigate DIRECTLY to destination!
  const handleNotificationClick = (msg: NotificationItem) => {
    if (!msg.read) {
      handleMarkAsRead(msg.id);
    }
    setIsOpen(false);
    const destination = getNotificationDestination(msg);
    router.push(destination.href);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'DEPOSIT_RECEIVED':
        return <DollarSign className="w-4 h-4 text-emerald-500" />;
      case 'ORDER_RECEIVED':
      case 'ORDER_STATUS':
        return <Package className="w-4 h-4 text-teal-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="View notifications"
        aria-expanded={isOpen}
        className={`relative p-2 rounded-xl transition-all cursor-pointer ${
          isOpen
            ? 'bg-teal-500 text-white shadow-sm ring-2 ring-teal-500/30'
            : 'bg-slate-100 dark:bg-[#141414] text-slate-700 dark:text-neutral-300 hover:text-teal-500 hover:bg-slate-200/70 dark:hover:bg-[#1f1f1f]'
        }`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Floating Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-32px)] sm:w-96 max-w-sm rounded-3xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Dropdown Header */}
          <div className="p-4 border-b border-slate-100 dark:border-[#222222] flex items-center justify-between bg-slate-50/50 dark:bg-[#161616]/50">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Notifications</h3>
              {unreadCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-[11px] font-bold border border-red-200 dark:border-red-900/40">
                  {unreadCount} new
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#202020] text-slate-500 dark:text-neutral-400 text-[11px] font-medium">
                  All caught up
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline px-2 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-[11px] font-semibold text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:underline px-2 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                  title="Clear all notifications"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear all</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notifications List Body */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 dark:divide-[#1f1f1f]">
            {loading && messages.length === 0 ? (
              <div className="p-8 flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
                <span className="text-xs">Loading notifications...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-[#1a1a1a] flex items-center justify-center mx-auto mb-2 text-slate-400">
                  <Bell className="w-6 h-6" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-neutral-300">No notifications yet</p>
                <p className="text-[11px] text-slate-400 dark:text-neutral-500 mt-0.5">
                  Deposit confirmations and order alerts will appear here.
                </p>
              </div>
            ) : (
              messages.slice(0, 10).map((msg) => {
                const dest = getNotificationDestination(msg);
                const DestIcon = dest.icon;

                return (
                  <button
                    type="button"
                    key={msg.id}
                    onClick={() => handleNotificationClick(msg)}
                    className={`w-full text-left p-3.5 sm:p-4 flex items-start gap-3 transition-all cursor-pointer group active:scale-[0.99] select-none ${
                      !msg.read
                        ? 'bg-teal-50/60 dark:bg-teal-950/30 hover:bg-teal-100/70 dark:hover:bg-teal-900/40'
                        : 'hover:bg-slate-100/80 dark:hover:bg-[#1c1c1c]'
                    }`}
                  >
                    {/* Icon */}
                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-[#202020] flex items-center justify-center shrink-0 mt-0.5 border border-slate-200/60 dark:border-[#2c2c2c] group-hover:scale-105 transition-transform">
                      {getNotificationIcon(msg.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                            {msg.title}
                          </h4>
                          {!msg.read && (
                            <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 dark:text-neutral-500 shrink-0 font-mono">
                          {formatTimestamp(msg.createdAt)}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-600 dark:text-neutral-300 mt-1 line-clamp-2 leading-relaxed">
                        {msg.message}
                      </p>

                      {/* Direct Destination Pill */}
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-[#222222] text-teal-600 dark:text-teal-400 border border-slate-200/60 dark:border-[#2f2f2f] group-hover:bg-teal-50 dark:group-hover:bg-teal-950/40 transition-colors">
                          <DestIcon className="w-3 h-3" />
                          <span>{dest.actionText}</span>
                          <ArrowRight className="w-2.5 h-2.5 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </div>
                    </div>

                    {/* Item Actions: Mark Read & Delete */}
                    <div className="flex items-center gap-1 shrink-0 self-start">
                      {!msg.read && (
                        <button
                          type="button"
                          onClick={(e) => handleMarkAsRead(msg.id, e)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-white dark:hover:bg-[#252525] border border-transparent hover:border-slate-200 dark:hover:border-neutral-700 transition-colors"
                          title="Mark as read without opening"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => handleDelete(msg.id, e)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-transparent hover:border-red-200 dark:hover:border-red-900/40 transition-colors"
                        title="Delete notification"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Dropdown Footer Link to Full Page */}
          <div className="p-3 border-t border-slate-100 dark:border-[#222222] bg-slate-50/80 dark:bg-[#161616]/80 text-center">
            <Link
              href="/inmate/messages"
              onClick={() => setIsOpen(false)}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline min-h-[36px] w-full cursor-pointer"
            >
              <span>View All Messages & Alerts</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
