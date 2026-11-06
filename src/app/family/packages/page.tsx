'use client';

import React, { useState, useEffect } from 'react';
import {
  Gift,
  Plus,
  Minus,
  CheckCircle2,
  Clock,
  AlertCircle,
  Truck,
  Loader2,
  X,
} from 'lucide-react';

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
}

interface GiftPackageItem {
  id: string;
  packageName: string;
  totalValue: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SHIPPED';
  itemsJson: string;
  createdAt: string;
  offender: {
    id: string;
    name: string;
    unit: string;
  };
}

export default function FamilyGiftPackagesPage() {
  const [packages, setPackages] = useState<GiftPackageItem[]>([]);
  const [approvedProducts, setApprovedProducts] = useState<Product[]>([]);
  const [giftPackagesEnabled, setGiftPackagesEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  // New package modal state
  const [showModal, setShowModal] = useState(false);
  const [offenderIdInput, setOffenderIdInput] = useState('A1234567');
  const [packageNameInput, setPackageNameInput] = useState('Quarterly Care Package');
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetchPackages();
  }, []);

  const fetchPackages = () => {
    fetch('/api/family/gift-packages')
      .then((res) => res.json())
      .then((data) => {
        if (data?.packages) setPackages(data.packages);
        if (data?.approvedProducts) setApprovedProducts(data.approvedProducts);
        if (data?.giftPackagesEnabled !== undefined) setGiftPackagesEnabled(data.giftPackagesEnabled);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  const handleQuantityChange = (productId: string, delta: number) => {
    setSelectedItems((prev) => {
      const current = prev[productId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
  };

  const calculatePackageTotal = () => {
    return Object.entries(selectedItems).reduce((sum, [pId, qty]) => {
      const prod = approvedProducts.find((p) => p.id === pId);
      return sum + (prod ? prod.price * qty : 0);
    }, 0);
  };

  const handleSubmitPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const itemsArray = Object.entries(selectedItems).map(([productId, quantity]) => ({
      productId,
      quantity,
    }));

    if (itemsArray.length === 0) {
      setSubmitError('Please select at least one approved item for this package.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/family/gift-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offenderId: offenderIdInput.trim().toUpperCase(),
          packageName: packageNameInput.trim(),
          items: itemsArray,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit package');
      }

      setShowModal(false);
      setSelectedItems({});
      fetchPackages();
    } catch (err: any) {
      setSubmitError(err.message || 'Submission error');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: GiftPackageItem['status']) => {
    switch (status) {
      case 'SHIPPED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800">
            <Truck className="w-3 h-3 text-teal-500" />
            Shipped
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-[#181818] text-teal-600 dark:text-teal-400 border border-slate-300 dark:border-slate-700">
            <CheckCircle2 className="w-3 h-3 text-teal-500" />
            Approved
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <Clock className="w-3 h-3" />
            Pending Facility Review
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Secure Care Packages
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Build and submit pre-approved gift packages subject to facility inspection rules.
          </p>
        </div>

        {giftPackagesEnabled && (
          <button
            onClick={() => setShowModal(true)}
            className="btn-teal inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-sm self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Send Care Package</span>
          </button>
        )}
      </div>

      {!giftPackagesEnabled && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3 text-amber-800 dark:text-amber-300 text-xs">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <strong className="block text-sm text-slate-900 dark:text-white">Facility Notice</strong>
            Care gift package submissions are temporarily suspended per facility security policy. You may still make trust fund deposits.
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
        </div>
      ) : packages.length === 0 ? (
        <div className="bg-white dark:bg-[#121212] p-10 rounded-3xl text-center border border-slate-200 dark:border-[#262626] shadow-sm">
          <Gift className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No Gift Packages Sent</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
            You have not submitted any gift packages for review yet.
          </p>
          {giftPackagesEnabled && (
            <button
              onClick={() => setShowModal(true)}
              className="btn-teal px-5 py-2.5 rounded-2xl text-xs font-bold"
            >
              Build Care Package
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {packages.map((pkg) => {
            const dateStr = new Date(pkg.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            let items: any[] = [];
            try {
              items = JSON.parse(pkg.itemsJson);
            } catch {}

            return (
              <div
                key={pkg.id}
                className="bg-white dark:bg-[#121212] p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-[#262626] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:border-teal-500/40 transition-all"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white text-base">{pkg.packageName}</span>
                    {getStatusBadge(pkg.status)}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                    Beneficiary: <strong className="text-slate-900 dark:text-white">{pkg.offender.name}</strong> ({pkg.offender.id}) &bull; {pkg.offender.unit}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    {items.length} item kinds &bull; Submitted {dateStr}
                  </div>
                </div>

                <div className="text-left sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-[#262626]">
                  <div className="font-mono font-black text-teal-600 dark:text-teal-400 text-lg">
                    ${pkg.totalValue.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Facility Inspected
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Build Package Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121212] w-full max-w-xl p-6 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-xl max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#262626]">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-teal-500" />
                <h3 className="font-bold text-slate-900 dark:text-white text-base">Build Care Package</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-[#181818] text-slate-400 hover:text-black dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submitError && (
              <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitPackage} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Offender ID
                  </label>
                  <input
                    type="text"
                    required
                    value={offenderIdInput}
                    onChange={(e) => setOffenderIdInput(e.target.value.toUpperCase())}
                    placeholder="e.g. A1234567"
                    className="w-full px-3 py-2 rounded-2xl bg-slate-50 dark:bg-[#181818]/40 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Package Name
                  </label>
                  <input
                    type="text"
                    required
                    value={packageNameInput}
                    onChange={(e) => setPackageNameInput(e.target.value)}
                    placeholder="e.g. Snack Pack"
                    className="w-full px-3 py-2 rounded-2xl bg-slate-50 dark:bg-[#181818]/40 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm"
                  />
                </div>
              </div>

              {/* Select approved items */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Select Approved Items
                </label>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-[#262626] rounded-2xl bg-slate-50/50 dark:bg-[#181818]/20 max-h-56 overflow-y-auto">
                  {approvedProducts.map((prod) => {
                    const qty = selectedItems[prod.id] || 0;
                    return (
                      <div key={prod.id} className="p-2.5 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-white block">{prod.name}</span>
                          <span className="text-slate-500 text-[11px]">
                            ${prod.price.toFixed(2)} &bull; {prod.category}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 bg-white dark:bg-[#181818] rounded-xl p-1 border border-slate-200 dark:border-slate-700">
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(prod.id, -1)}
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center font-mono font-bold text-teal-600 dark:text-teal-400">
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(prod.id, 1)}
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total & Submit */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#181818]/40 border border-slate-200 dark:border-[#262626] flex justify-between items-center text-sm font-bold">
                <span className="text-slate-600 dark:text-slate-400">Package Value:</span>
                <span className="font-mono text-teal-600 dark:text-teal-400">${calculatePackageTotal().toFixed(2)}</span>
              </div>

              <button
                type="submit"
                disabled={submitting || calculatePackageTotal() <= 0}
                className="btn-teal w-full py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting for Facility Review...</span>
                  </>
                ) : (
                  <span>Submit for Facility Inspection (${calculatePackageTotal().toFixed(2)})</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
