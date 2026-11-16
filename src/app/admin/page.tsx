'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  Building,
  Package,
  ClipboardList,
  DollarSign,
  TrendingUp,
  RefreshCw,
  Search,
  Plus,
  Lock,
  Unlock,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Sliders,
  History,
  UserPlus,
  ArrowUpCircle,
  ArrowDownCircle,
  Check,
  UserCheck,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'staff' | 'inmates' | 'products' | 'facilities'>('overview');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [inmates, setInmates] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  // Search queries per tab
  const [userSearch, setUserSearch] = useState('');
  const [inmateSearch, setInmateSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');

  // Modals state
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [showAddInmateModal, setShowAddInmateModal] = useState(false);
  const [showInmateModal, setShowInmateModal] = useState(false);
  const [selectedInmate, setSelectedInmate] = useState<any | null>(null);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showFacilityModal, setShowFacilityModal] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState<any | null>(null);

  // Form states
  const [staffForm, setStaffForm] = useState({
    name: '',
    email: '',
    staffId: '',
    role: 'WAREHOUSE_PICKER',
    password: '',
    facilityId: '',
  });

  const [newInmateForm, setNewInmateForm] = useState({
    id: '',
    name: '',
    facilityId: '',
    unit: '',
    housing: '',
    pin: '',
    weeklyLimit: '100',
    initialBalance: '0',
  });

  const [inmateAdjForm, setInmateAdjForm] = useState({
    action: 'ADJUST_BALANCE',
    amount: '',
    newWeeklyLimit: '',
    reason: '',
  });

  const [productForm, setProductForm] = useState({
    sku: '',
    name: '',
    category: 'Snacks',
    price: '',
    stock: '',
    reorderLevel: '15',
    description: '',
  });

  const [facilityForm, setFacilityForm] = useState({
    maxWeeklySpend: '',
    maxDepositAmount: '',
    weeklyResetDay: 0,
    giftPackagesEnabled: true,
  });

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, inmatesRes, prodsRes, facRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/users'),
        fetch('/api/admin/inmates'),
        fetch('/api/admin/products'),
        fetch('/api/admin/facilities'),
      ]);

      const [statsData, usersData, inmatesData, prodsData, facData] = await Promise.all([
        statsRes.json(),
        usersRes.json(),
        inmatesRes.json(),
        prodsRes.json(),
        facRes.json(),
      ]);

      if (statsData?.stats) setStats(statsData.stats);
      if (statsData?.recentAuditLogs) setAuditLogs(statsData.recentAuditLogs);
      if (usersData?.users) setUsers(usersData.users);
      if (inmatesData?.offenders) setInmates(inmatesData.offenders);
      if (prodsData?.products) setProducts(prodsData.products);
      if (facData?.facilities) setFacilities(facData.facilities);
    } catch (err) {
      console.error('Error loading admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Staff creation
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staffForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');

      setFeedback({ type: 'success', msg: `Created staff user ${data.user.name} (${data.user.role})` });
      setShowAddStaffModal(false);
      setStaffForm({ name: '', email: '', staffId: '', role: 'WAREHOUSE_PICKER', password: '', facilityId: '' });
      loadAllData();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddInmate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const payload = {
        ...newInmateForm,
        facilityId: newInmateForm.facilityId || facilities[0]?.id || 'FACILITY_CC_01',
        weeklyLimit: parseFloat(newInmateForm.weeklyLimit) || 100,
        initialBalance: parseFloat(newInmateForm.initialBalance) || 0,
      };

      const res = await fetch('/api/admin/inmates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to register inmate');

      setFeedback({ type: 'success', msg: `Registered inmate ${data.offender.name} (${data.offender.id})` });
      setShowAddInmateModal(false);
      setNewInmateForm({ id: '', name: '', facilityId: '', unit: '', housing: '', pin: '', weeklyLimit: '100', initialBalance: '0' });
      loadAllData();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  // User lock / unlock / role change
  const handleUserAction = async (userId: string, action: 'UNLOCK' | 'LOCK') => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'User update failed');

      setFeedback({ type: 'success', msg: `User ${action === 'UNLOCK' ? 'unlocked' : 'locked'} successfully.` });
      loadAllData();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    }
  };

  // Inmate adjustment
  const handleInmateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInmate) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const payload: any = {
        offenderId: selectedInmate.id,
        action: inmateAdjForm.action,
        reason: inmateAdjForm.reason,
      };

      if (inmateAdjForm.action === 'ADJUST_BALANCE') {
        payload.amount = parseFloat(inmateAdjForm.amount);
      } else if (inmateAdjForm.action === 'UPDATE_LIMIT') {
        payload.newWeeklyLimit = parseFloat(inmateAdjForm.newWeeklyLimit);
      }

      const res = await fetch('/api/admin/inmates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Inmate adjustment failed');

      setFeedback({ type: 'success', msg: `Successfully updated account for ${selectedInmate.name}.` });
      setShowInmateModal(false);
      loadAllData();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Add Product
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...productForm,
          price: parseFloat(productForm.price),
          stock: parseInt(productForm.stock, 10),
          reorderLevel: parseInt(productForm.reorderLevel, 10),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add product');

      setFeedback({ type: 'success', msg: `Product ${data.product.name} (${data.product.sku}) created.` });
      setShowAddProductModal(false);
      setProductForm({ sku: '', name: '', category: 'Snacks', price: '', stock: '', reorderLevel: '15', description: '' });
      loadAllData();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Update Facility
  const handleUpdateFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacility) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/facilities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedFacility.id,
          maxWeeklySpend: parseFloat(facilityForm.maxWeeklySpend),
          maxDepositAmount: parseFloat(facilityForm.maxDepositAmount),
          weeklyResetDay: parseInt(String(facilityForm.weeklyResetDay), 10),
          giftPackagesEnabled: facilityForm.giftPackagesEnabled,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Facility update failed');

      setFeedback({ type: 'success', msg: `Facility policies for ${selectedFacility.name} updated.` });
      setShowFacilityModal(false);
      loadAllData();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const navTabs = [
    { id: 'overview', label: 'Operational Overview', icon: TrendingUp },
    { id: 'staff', label: `Staff & RBAC (${users.length})`, icon: Users },
    { id: 'inmates', label: `Inmate Trust Accounts (${inmates.length})`, icon: UserCheck },
    { id: 'products', label: `Catalog & Stock (${products.length})`, icon: Package },
    { id: 'facilities', label: `Facility Rules (${facilities.length})`, icon: Building },
  ];

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Administration &amp; Oversight Console
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              Super Admin
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            System-wide operational controls, user management, inmate ledgers, and institutional policies.
          </p>
        </div>

        <button
          type="button"
          onClick={loadAllData}
          className="px-4 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2 self-start sm:self-auto shadow-sm min-h-[44px] touch-manipulation"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh System Data</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between shadow-sm ${
            feedback.type === 'success'
              ? 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-200'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-600 dark:text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
            <span className="font-medium">{feedback.msg}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="Dismiss feedback"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 6 Key Performance Indicators Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-[#121212] p-4 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Inmates</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {stats?.inmatesCount ?? '...'}
          </div>
          <span className="text-[10px] text-teal-600 dark:text-teal-400 font-medium">All Units Active</span>
        </div>

        <div className="bg-white dark:bg-[#121212] p-4 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Facilities</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {stats?.facilitiesCount ?? '...'}
          </div>
          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">Active Institutions</span>
        </div>

        <div className="bg-white dark:bg-[#121212] p-4 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Catalog SKUs</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {stats?.productsCount ?? '...'}
          </div>
          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Commissary Items</span>
        </div>

        <div className="bg-white dark:bg-[#121212] p-4 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Pending Orders</span>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {stats?.pendingOrdersCount ?? '...'}
          </div>
          <span className="text-[10px] text-slate-400 font-medium font-mono">Of {stats?.ordersCount ?? '0'} Total</span>
        </div>

        <div className="bg-white dark:bg-[#121212] p-4 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Trust Deposits</span>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
            ${stats?.totalDepositsVolume ? stats.totalDepositsVolume.toFixed(0) : '0'}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Stripe &amp; PayPal</span>
        </div>

        <div className="bg-white dark:bg-[#121212] p-4 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Staff Users</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {stats?.staffCount ?? '...'}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Pickers &amp; Staff</span>
        </div>
      </div>

      {/* Navigation Segmented Tab Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar border-b border-slate-200 dark:border-[#262626]">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all min-h-[44px] touch-manipulation ${
                isActive
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-white dark:bg-[#121212] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#262626]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW & SYSTEM AUDIT TRAIL */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-purple-600" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Institutional Security &amp; Audit Log
                </h2>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">Immutable System Records</span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-[#262626] border border-slate-200 dark:border-[#262626] rounded-2xl overflow-hidden bg-slate-50/40 dark:bg-[#181818]">
              {auditLogs.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">No audit events recorded yet.</div>
              ) : (
                auditLogs.map((log) => {
                  let meta: any = null;
                  try {
                    meta = log.metadata ? JSON.parse(log.metadata) : null;
                  } catch {}

                  return (
                    <div key={log.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
                            {log.action}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-[#202020] text-slate-700 dark:text-slate-300">
                            {log.actorRole}
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 text-[11px] mt-0.5">
                          Actor: <strong className="font-mono">{log.actorId}</strong> &bull; Resource: {log.resourceType}{' '}
                          {log.resourceId ? `(${log.resourceId})` : ''}
                        </p>
                        {meta && (
                          <p className="text-slate-400 text-[10px] font-mono mt-0.5 truncate max-w-xl">
                            {JSON.stringify(meta)}
                          </p>
                        )}
                      </div>

                      <div className="text-[11px] font-mono text-slate-400 shrink-0">
                        {new Date(log.createdAt).toLocaleString()}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STAFF & RBAC MANAGEMENT */}
      {activeTab === 'staff' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search staff by name, email, or staff ID..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white placeholder-slate-400 text-base sm:text-sm focus:outline-none focus:border-purple-500 min-h-[44px]"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowAddStaffModal(true)}
              className="px-4 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2 shadow-sm min-h-[44px] touch-manipulation"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Staff Member</span>
            </button>
          </div>

          {/* Mobile Staff Cards */}
          <div className="md:hidden space-y-3">
            {users
              .filter((u) => !userSearch.trim() || u.name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase()) || u.staffId?.toLowerCase().includes(userSearch.toLowerCase())).length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-[#121212] rounded-3xl border border-slate-200 dark:border-[#262626]">
                <Users className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">No staff accounts found</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">Create your first staff account to manage warehouse operations.</p>
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(true)}
                  className="px-4 py-2 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add Staff Member</span>
                </button>
              </div>
            ) : (
              users
                .filter((u) => !userSearch.trim() || u.name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase()) || u.staffId?.toLowerCase().includes(userSearch.toLowerCase()))
                .map((u) => {
                  const isLocked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                  return (
                    <div key={u.id} className="bg-white dark:bg-[#121212] p-4 rounded-3xl border border-slate-200 dark:border-[#262626] space-y-3 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white">{u.name}</h3>
                          <p className="text-xs text-slate-500">{u.email || 'No email'}</p>
                          <p className="text-[11px] font-mono text-purple-600 dark:text-purple-400">
                            ID: {u.staffId || 'N/A'} &bull; {u.facility?.name || 'All Facilities'}
                          </p>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-purple-600 dark:text-purple-400">
                          {u.role}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-[#262626]">
                        <span className="text-[11px] text-slate-400">
                          Status: <strong className={isLocked ? 'text-red-500' : 'text-emerald-500'}>{isLocked ? 'LOCKED' : 'ACTIVE'}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUserAction(u.id, isLocked ? 'UNLOCK' : 'LOCK')}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#181818] text-xs font-bold border border-slate-200 dark:border-[#262626] min-h-[44px] touch-manipulation inline-flex items-center gap-1.5"
                        >
                          {isLocked ? <Unlock className="w-3.5 h-3.5 text-emerald-500" /> : <Lock className="w-3.5 h-3.5 text-amber-500" />}
                          <span>{isLocked ? 'Unlock' : 'Lock'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })
            )}
          </div>

          {/* Desktop Staff Table */}
          <div className="hidden md:block bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#262626] text-slate-500 uppercase text-[10px]">
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">Staff ID</th>
                  <th className="py-2.5 px-3">Assigned Role</th>
                  <th className="py-2.5 px-3">Facility</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Access Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#262626]">
                {users.filter((u) => !userSearch.trim() || u.name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase()) || u.staffId?.toLowerCase().includes(userSearch.toLowerCase())).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No staff accounts found. Click &quot;Add Staff Member&quot; above to create one.
                    </td>
                  </tr>
                ) : (
                  users
                    .filter((u) => !userSearch.trim() || u.name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase()) || u.staffId?.toLowerCase().includes(userSearch.toLowerCase()))
                    .map((u) => {
                      const isLocked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                      return (
                        <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-[#181818]">
                          <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">{u.name}</td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{u.email || '-'}</td>
                          <td className="py-3 px-3 font-mono text-purple-600 dark:text-purple-400 font-bold">{u.staffId || '-'}</td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-[#181818] border border-slate-200 dark:border-[#262626]">
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-500">{u.facility?.name || 'All Facilities'}</td>
                          <td className="py-3 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isLocked ? 'bg-red-100 text-red-700 dark:bg-red-950/60' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60'}`}>
                              {isLocked ? 'LOCKED' : 'ACTIVE'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleUserAction(u.id, isLocked ? 'UNLOCK' : 'LOCK')}
                              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#181818] hover:bg-slate-200 dark:hover:bg-[#202020] text-xs font-semibold border border-slate-200 dark:border-[#262626] transition-colors"
                            >
                              {isLocked ? 'Unlock Shift' : 'Lock Account'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: INMATE ACCOUNTS & LEDGER CONTROLS */}
      {activeTab === 'inmates' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
              <input
                type="text"
                value={inmateSearch}
                onChange={(e) => setInmateSearch(e.target.value)}
                placeholder="Search inmate by name, ID, or housing unit..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white placeholder-slate-400 text-base sm:text-sm focus:outline-none focus:border-purple-500 min-h-[44px]"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowAddInmateModal(true)}
              className="px-4 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2 shadow-sm min-h-[44px] touch-manipulation"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Inmate</span>
            </button>
          </div>

          {/* Mobile Inmate Cards */}
          <div className="md:hidden space-y-3">
            {inmates
              .filter((i) => !inmateSearch.trim() || i.name.toLowerCase().includes(inmateSearch.toLowerCase()) || i.id.toLowerCase().includes(inmateSearch.toLowerCase()) || i.unit.toLowerCase().includes(inmateSearch.toLowerCase())).length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-[#121212] rounded-3xl border border-slate-200 dark:border-[#262626]">
                <UserCheck className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">No inmates registered yet</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">Register an inmate record to enable commissary orders and trust deposits.</p>
                <button
                  type="button"
                  onClick={() => setShowAddInmateModal(true)}
                  className="px-4 py-2 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add Inmate</span>
                </button>
              </div>
            ) : (
              inmates
                .filter((i) => !inmateSearch.trim() || i.name.toLowerCase().includes(inmateSearch.toLowerCase()) || i.id.toLowerCase().includes(inmateSearch.toLowerCase()) || i.unit.toLowerCase().includes(inmateSearch.toLowerCase()))
                .map((i) => {
                  const isPinLocked = i.pinLockedUntil && new Date(i.pinLockedUntil) > new Date();
                  return (
                    <div key={i.id} className="bg-white dark:bg-[#121212] p-4 rounded-3xl border border-slate-200 dark:border-[#262626] space-y-3 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white">{i.name}</h3>
                          <p className="text-xs font-mono text-purple-600 dark:text-purple-400">ID: {i.id} &bull; {i.unit}</p>
                          <p className="text-[11px] text-slate-400">{i.housing} &bull; {i.facility?.name}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 uppercase block">Balance</span>
                          <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                            ${i.balance.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-xs flex justify-between font-mono">
                        <span>Weekly Limit: ${i.weeklyLimit.toFixed(2)}</span>
                        <span>Spent: ${i.currentWeeklySpent.toFixed(2)}</span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-[#262626]">
                        <span className="text-[11px]">
                          PIN Status: <strong className={isPinLocked ? 'text-red-500' : 'text-emerald-500'}>{isPinLocked ? 'LOCKED' : 'ACTIVE'}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedInmate(i);
                            setInmateAdjForm({ action: 'ADJUST_BALANCE', amount: '', newWeeklyLimit: String(i.weeklyLimit), reason: '' });
                            setShowInmateModal(true);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-xs font-bold border border-purple-200 dark:border-purple-800 min-h-[44px] touch-manipulation inline-flex items-center gap-1.5"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span>Manage Account</span>
                        </button>
                      </div>
                    </div>
                  );
                })
            )}
          </div>

          {/* Desktop Inmate Table */}
          <div className="hidden md:block bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#262626] text-slate-500 uppercase text-[10px]">
                  <th className="py-2.5 px-3">Offender ID</th>
                  <th className="py-2.5 px-3">Full Legal Name</th>
                  <th className="py-2.5 px-3">Unit / Housing</th>
                  <th className="py-2.5 px-3">Facility</th>
                  <th className="py-2.5 px-3 text-right">Trust Balance</th>
                  <th className="py-2.5 px-3 text-right">Weekly Limit</th>
                  <th className="py-2.5 px-3 text-center">PIN Lock</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#262626]">
                {inmates.filter((i) => !inmateSearch.trim() || i.name.toLowerCase().includes(inmateSearch.toLowerCase()) || i.id.toLowerCase().includes(inmateSearch.toLowerCase()) || i.unit.toLowerCase().includes(inmateSearch.toLowerCase())).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No inmates registered yet. Click &quot;Add Inmate&quot; above to register one.
                    </td>
                  </tr>
                ) : (
                  inmates
                    .filter((i) => !inmateSearch.trim() || i.name.toLowerCase().includes(inmateSearch.toLowerCase()) || i.id.toLowerCase().includes(inmateSearch.toLowerCase()) || i.unit.toLowerCase().includes(inmateSearch.toLowerCase()))
                    .map((i) => {
                      const isPinLocked = i.pinLockedUntil && new Date(i.pinLockedUntil) > new Date();
                      return (
                        <tr key={i.id} className="hover:bg-slate-50 dark:hover:bg-[#181818]">
                          <td className="py-3 px-3 font-mono font-bold text-purple-600 dark:text-purple-400">{i.id}</td>
                          <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">{i.name}</td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{i.unit} &bull; {i.housing}</td>
                          <td className="py-3 px-3 text-slate-500">{i.facility?.name}</td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            ${i.balance.toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                            ${i.weeklyLimit.toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isPinLocked ? 'bg-red-100 text-red-700 dark:bg-red-950/60' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60'}`}>
                              {isPinLocked ? 'LOCKED' : 'ACTIVE'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedInmate(i);
                                setInmateAdjForm({ action: 'ADJUST_BALANCE', amount: '', newWeeklyLimit: String(i.weeklyLimit), reason: '' });
                                setShowInmateModal(true);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#181818] hover:bg-slate-200 dark:hover:bg-[#202020] text-xs font-semibold border border-slate-200 dark:border-[#262626] transition-colors"
                            >
                              Manage Account
                            </button>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PRODUCT CATALOG & INVENTORY */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search catalog by SKU, name, or category..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white placeholder-slate-400 text-base sm:text-sm focus:outline-none focus:border-purple-500 min-h-[44px]"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowAddProductModal(true)}
              className="px-4 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2 shadow-sm min-h-[44px] touch-manipulation"
            >
              <Plus className="w-4 h-4" />
              <span>Create Catalog SKU</span>
            </button>
          </div>

          {/* Mobile Product Cards */}
          <div className="md:hidden space-y-3">
            {products
              .filter((p) => !productSearch.trim() || p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku.toLowerCase().includes(productSearch.toLowerCase()) || p.category.toLowerCase().includes(productSearch.toLowerCase())).length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-[#121212] rounded-3xl border border-slate-200 dark:border-[#262626]">
                <Package className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">No catalog products available</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">Add your first commissary SKU to build the product catalog.</p>
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(true)}
                  className="px-4 py-2 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Catalog SKU</span>
                </button>
              </div>
            ) : (
              products
                .filter((p) => !productSearch.trim() || p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku.toLowerCase().includes(productSearch.toLowerCase()) || p.category.toLowerCase().includes(productSearch.toLowerCase()))
                .map((p) => (
                  <div key={p.id} className="bg-white dark:bg-[#121212] p-4 rounded-3xl border border-slate-200 dark:border-[#262626] space-y-2.5 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono text-xs font-bold text-purple-600 dark:text-purple-400">{p.sku}</span>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-0.5">{p.name}</h3>
                        <p className="text-[11px] text-slate-400">{p.category} &bull; {p.facility?.name || 'Global Catalog'}</p>
                      </div>
                      <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                        ${p.price.toFixed(2)}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-xs flex justify-between font-mono">
                      <span>Stock: <strong className={p.stock <= p.reorderLevel ? 'text-amber-500' : 'text-slate-900 dark:text-white'}>{p.stock}</strong></span>
                      <span>Reorder Level: {p.reorderLevel}</span>
                    </div>
                  </div>
                ))
            )}
          </div>

          {/* Desktop Product Table */}
          <div className="hidden md:block bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#262626] text-slate-500 uppercase text-[10px]">
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Scope</th>
                  <th className="py-2.5 px-3 text-right">Price</th>
                  <th className="py-2.5 px-3 text-center">Stock</th>
                  <th className="py-2.5 px-3 text-center">Reorder Threshold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#262626]">
                {products.filter((p) => !productSearch.trim() || p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku.toLowerCase().includes(productSearch.toLowerCase()) || p.category.toLowerCase().includes(productSearch.toLowerCase())).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No catalog products available. Click &quot;Create Catalog SKU&quot; above to add one.
                    </td>
                  </tr>
                ) : (
                  products
                    .filter((p) => !productSearch.trim() || p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku.toLowerCase().includes(productSearch.toLowerCase()) || p.category.toLowerCase().includes(productSearch.toLowerCase()))
                    .map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-[#181818]">
                        <td className="py-3 px-3 font-mono font-bold text-purple-600 dark:text-purple-400">{p.sku}</td>
                        <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">{p.name}</td>
                        <td className="py-3 px-3 text-slate-500">{p.category}</td>
                        <td className="py-3 px-3 text-slate-500">{p.facility?.name || 'Global Catalog'}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                          ${p.price.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-center font-mono">
                          <span className={`font-bold ${p.stock <= p.reorderLevel ? 'text-amber-500' : 'text-slate-900 dark:text-white'}`}>
                            {p.stock}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-slate-500">{p.reorderLevel}</td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: FACILITY RULES & POLICIES */}
      {activeTab === 'facilities' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {facilities.map((f) => (
              <div key={f.id} className="bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] space-y-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-base text-slate-900 dark:text-white">{f.name}</h3>
                    <p className="text-xs text-slate-500 font-mono">Facility ID: {f.id}</p>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${f.giftPackagesEnabled ? 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400'}`}>
                    {f.giftPackagesEnabled ? 'Care Packages Enabled' : 'Packages Suspended'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono p-3 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626]">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Max Weekly Spend</span>
                    <strong className="text-slate-900 dark:text-white text-sm">${f.maxWeeklySpend.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Max Single Deposit</span>
                    <strong className="text-slate-900 dark:text-white text-sm">${f.maxDepositAmount.toFixed(2)}</strong>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-[#262626] text-xs">
                  <span className="text-slate-500">
                    {f._count?.offenders || 0} Inmates &bull; {f._count?.products || 0} Facility SKUs
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFacility(f);
                      setFacilityForm({
                        maxWeeklySpend: String(f.maxWeeklySpend),
                        maxDepositAmount: String(f.maxDepositAmount),
                        weeklyResetDay: f.weeklyResetDay,
                        giftPackagesEnabled: f.giftPackagesEnabled,
                      });
                      setShowFacilityModal(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-xs font-bold border border-purple-200 dark:border-purple-800 min-h-[44px] touch-manipulation inline-flex items-center gap-1.5"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Edit Policies</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: ADD STAFF USER */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md p-6 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-xl space-y-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#262626]">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Provision New Staff Account</h3>
              <button
                type="button"
                onClick={() => setShowAddStaffModal(false)}
                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#181818] flex items-center justify-center text-slate-500 hover:text-black dark:hover:text-white min-w-[44px] min-h-[44px]"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  value={staffForm.name}
                  onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                  placeholder="e.g. Officer John Davis"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Official Email</label>
                <input
                  type="email"
                  required
                  value={staffForm.email}
                  onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                  placeholder="jdavis@canteen.local"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Staff ID</label>
                  <input
                    type="text"
                    value={staffForm.staffId}
                    onChange={(e) => setStaffForm({ ...staffForm, staffId: e.target.value.toUpperCase() })}
                    placeholder="e.g. STF-05"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm font-mono min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Role</label>
                  <select
                    value={staffForm.role}
                    onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm min-h-[44px]"
                  >
                    <option value="WAREHOUSE_PICKER">Warehouse Picker</option>
                    <option value="WAREHOUSE_SUPERVISOR">Warehouse Supervisor</option>
                    <option value="ADMIN">System Administrator</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Temporary Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={staffForm.password}
                  onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                  placeholder="Min 8 characters"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm min-h-[44px]"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm min-h-[48px] touch-manipulation disabled:opacity-50"
                >
                  {submitting ? 'Creating Staff Account...' : 'Provision Staff Member'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="px-4 py-3.5 rounded-2xl bg-slate-100 dark:bg-[#181818] text-xs font-semibold min-h-[48px] touch-manipulation hover:bg-slate-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1B: ADD INMATE */}
      {showAddInmateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md p-6 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-xl space-y-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#262626]">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Register Inmate Record</h3>
              <button
                type="button"
                onClick={() => setShowAddInmateModal(false)}
                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#181818] flex items-center justify-center text-slate-500 hover:text-black dark:hover:text-white min-w-[44px] min-h-[44px]"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddInmate} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Offender ID</label>
                <input
                  type="text"
                  required
                  value={newInmateForm.id}
                  onChange={(e) => setNewInmateForm({ ...newInmateForm, id: e.target.value.toUpperCase() })}
                  placeholder="e.g. A1234567"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm font-mono min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  value={newInmateForm.name}
                  onChange={(e) => setNewInmateForm({ ...newInmateForm, name: e.target.value })}
                  placeholder="e.g. John Doe"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Housing Unit</label>
                  <input
                    type="text"
                    required
                    value={newInmateForm.unit}
                    onChange={(e) => setNewInmateForm({ ...newInmateForm, unit: e.target.value })}
                    placeholder="e.g. Unit 4"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Cell Location</label>
                  <input
                    type="text"
                    required
                    value={newInmateForm.housing}
                    onChange={(e) => setNewInmateForm({ ...newInmateForm, housing: e.target.value })}
                    placeholder="e.g. Block B - 101"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">4-Digit PIN</label>
                  <input
                    type="password"
                    required
                    maxLength={4}
                    pattern="[0-9]{4}"
                    value={newInmateForm.pin}
                    onChange={(e) => setNewInmateForm({ ...newInmateForm, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    placeholder="1234"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm font-mono tracking-widest min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Weekly Limit ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newInmateForm.weeklyLimit}
                    onChange={(e) => setNewInmateForm({ ...newInmateForm, weeklyLimit: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm font-mono min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Facility</label>
                <select
                  value={newInmateForm.facilityId || facilities[0]?.id || ''}
                  onChange={(e) => setNewInmateForm({ ...newInmateForm, facilityId: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm min-h-[44px]"
                >
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm min-h-[48px] touch-manipulation disabled:opacity-50"
                >
                  {submitting ? 'Registering Inmate...' : 'Register Inmate'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddInmateModal(false)}
                  className="px-4 py-3.5 rounded-2xl bg-slate-100 dark:bg-[#181818] text-xs font-semibold min-h-[48px] touch-manipulation hover:bg-slate-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: MANAGE INMATE ACCOUNT */}
      {showInmateModal && selectedInmate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md p-6 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-xl space-y-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#262626]">
              <div>
                <span className="text-[10px] font-mono font-bold text-purple-600 dark:text-purple-400 uppercase">
                  MANAGE INMATE TRUST ACCOUNT
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {selectedInmate.name} ({selectedInmate.id})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInmateModal(false)}
                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#181818] flex items-center justify-center text-slate-500 hover:text-black dark:hover:text-white min-w-[44px] min-h-[44px]"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-xs flex justify-between font-mono">
              <span>Current Balance: <strong className="text-emerald-600">${selectedInmate.balance.toFixed(2)}</strong></span>
              <span>Weekly Limit: <strong>${selectedInmate.weeklyLimit.toFixed(2)}</strong></span>
            </div>

            <form onSubmit={handleInmateAdjustment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Administrative Action</label>
                <select
                  value={inmateAdjForm.action}
                  onChange={(e) => setInmateAdjForm({ ...inmateAdjForm, action: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm min-h-[44px]"
                >
                  <option value="ADJUST_BALANCE">Credit / Debit Account Balance</option>
                  <option value="UPDATE_LIMIT">Adjust Weekly Spending Limit</option>
                  <option value="RESET_PIN_LOCK">Reset PIN Attempt Lockout</option>
                </select>
              </div>

              {inmateAdjForm.action === 'ADJUST_BALANCE' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Adjustment Amount (+ for Credit, - for Debit)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={inmateAdjForm.amount}
                    onChange={(e) => setInmateAdjForm({ ...inmateAdjForm, amount: e.target.value })}
                    placeholder="e.g. 25.00 or -10.00"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm font-mono min-h-[44px]"
                  />
                </div>
              )}

              {inmateAdjForm.action === 'UPDATE_LIMIT' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    New Weekly Spend Cap ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={inmateAdjForm.newWeeklyLimit}
                    onChange={(e) => setInmateAdjForm({ ...inmateAdjForm, newWeeklyLimit: e.target.value })}
                    placeholder="e.g. 150.00"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm font-mono min-h-[44px]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mandatory Audit Reason
                </label>
                <input
                  type="text"
                  required
                  value={inmateAdjForm.reason}
                  onChange={(e) => setInmateAdjForm({ ...inmateAdjForm, reason: e.target.value })}
                  placeholder="e.g. Court ordered restitution refund or disciplinary hold"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm min-h-[44px]"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm min-h-[48px] touch-manipulation disabled:opacity-50"
                >
                  {submitting ? 'Applying Adjustment...' : 'Confirm Account Action'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowInmateModal(false)}
                  className="px-4 py-3.5 rounded-2xl bg-slate-100 dark:bg-[#181818] text-xs font-semibold min-h-[48px] touch-manipulation hover:bg-slate-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ADD PRODUCT */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md p-6 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-xl space-y-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#262626]">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Create Commissary Catalog Item</h3>
              <button
                type="button"
                onClick={() => setShowAddProductModal(false)}
                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#181818] flex items-center justify-center text-slate-500 hover:text-black dark:hover:text-white min-w-[44px] min-h-[44px]"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">SKU</label>
                  <input
                    type="text"
                    required
                    value={productForm.sku}
                    onChange={(e) => setProductForm({ ...productForm, sku: e.target.value.toUpperCase() })}
                    placeholder="e.g. SNK-010"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm font-mono min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Category</label>
                  <select
                    value={productForm.category}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm min-h-[44px]"
                  >
                    <option value="Snacks">Snacks</option>
                    <option value="Beverages">Beverages</option>
                    <option value="Personal Care">Personal Care</option>
                    <option value="Stationery">Stationery</option>
                    <option value="Health & Wellness">Health &amp; Wellness</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  placeholder="e.g. Honey Roasted Peanuts"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={productForm.price}
                    onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                    placeholder="2.50"
                    className="w-full px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm font-mono min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Initial Stock</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={productForm.stock}
                    onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                    placeholder="50"
                    className="w-full px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm font-mono min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Reorder Lvl</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={productForm.reorderLevel}
                    onChange={(e) => setProductForm({ ...productForm, reorderLevel: e.target.value })}
                    placeholder="15"
                    className="w-full px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm font-mono min-h-[44px]"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm min-h-[48px] touch-manipulation disabled:opacity-50"
                >
                  {submitting ? 'Creating Product...' : 'Create Catalog Item'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="px-4 py-3.5 rounded-2xl bg-slate-100 dark:bg-[#181818] text-xs font-semibold min-h-[48px] touch-manipulation hover:bg-slate-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: FACILITY POLICIES */}
      {showFacilityModal && selectedFacility && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md p-6 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-xl space-y-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#262626]">
              <div>
                <span className="text-[10px] font-mono font-bold text-purple-600 dark:text-purple-400 uppercase">
                  FACILITY SECURITY RULES
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {selectedFacility.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFacilityModal(false)}
                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#181818] flex items-center justify-center text-slate-500 hover:text-black dark:hover:text-white min-w-[44px] min-h-[44px]"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateFacility} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Maximum Weekly Spend per Inmate ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={facilityForm.maxWeeklySpend}
                  onChange={(e) => setFacilityForm({ ...facilityForm, maxWeeklySpend: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm font-mono min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Maximum Single Trust Deposit ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={facilityForm.maxDepositAmount}
                  onChange={(e) => setFacilityForm({ ...facilityForm, maxDepositAmount: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm font-mono min-h-[44px]"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] min-h-[44px] touch-manipulation">
                  <input
                    type="checkbox"
                    checked={facilityForm.giftPackagesEnabled}
                    onChange={(e) => setFacilityForm({ ...facilityForm, giftPackagesEnabled: e.target.checked })}
                    className="w-5 h-5 rounded text-purple-600 focus:ring-purple-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-900 dark:text-white block">Allow Care Gift Packages</span>
                    <span className="text-slate-500 text-[11px]">When disabled, families can only make financial trust deposits.</span>
                  </div>
                </label>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm min-h-[48px] touch-manipulation disabled:opacity-50"
                >
                  {submitting ? 'Saving Policies...' : 'Update Facility Policies'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowFacilityModal(false)}
                  className="px-4 py-3.5 rounded-2xl bg-slate-100 dark:bg-[#181818] text-xs font-semibold min-h-[48px] touch-manipulation hover:bg-slate-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

