'use client';

import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  Printer,
  Plus,
  CheckSquare,
  Square,
  Calendar,
  Truck,
  Loader2,
  X,
  CheckCircle2,
} from 'lucide-react';

interface EligibleOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  barcode: string;
  offender: {
    id: string;
    name: string;
    unit: string;
    housing: string;
  };
  items: Array<{
    quantity: number;
    product: { name: string; sku: string };
  }>;
}

interface ManifestRecord {
  id: string;
  manifestNumber: string;
  unit: string;
  housing?: string;
  deliveryDate: string;
  status: string;
  totalOrders: number;
  totalItems: number;
  createdAt: string;
  facility: { name: string };
  orders: EligibleOrder[];
}

export default function WarehouseManifestsPage() {
  const [manifests, setManifests] = useState<ManifestRecord[]>([]);
  const [eligibleOrders, setEligibleOrders] = useState<EligibleOrder[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [unit, setUnit] = useState('Unit 4');
  const [housing, setHousing] = useState('Cell Block B');
  const [deliveryDate, setDeliveryDate] = useState(
    new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Active manifest for print view
  const [activePrintManifest, setActivePrintManifest] = useState<ManifestRecord | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [manRes, ordRes] = await Promise.all([
        fetch('/api/warehouse/manifests'),
        fetch('/api/warehouse/orders?status=PACKED'),
      ]);

      const manData = await manRes.json();
      const ordData = await ordRes.json();

      if (manData?.manifests) setManifests(manData.manifests);
      if (ordData?.orders) setEligibleOrders(ordData.orders);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleOrderSelection = (id: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((oId) => oId !== id) : [...prev, id]
    );
  };

  const handleGenerateManifest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOrderIds.length === 0) {
      setFeedback({ type: 'error', msg: 'Please select at least 1 packed order for this manifest.' });
      return;
    }

    setGenerating(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/warehouse/manifests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit,
          housing,
          deliveryDate,
          orderIds: selectedOrderIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate manifest');
      }

      setSelectedOrderIds([]);
      setFeedback({
        type: 'success',
        msg: `Generated Delivery Manifest ${data.manifest.manifestNumber} with ${data.manifest.totalOrders} order(s).`,
      });
      fetchData();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    } finally {
      setGenerating(false);
    }
  };

  const exportManifestCSV = (manifest: ManifestRecord) => {
    const headers = [
      'Manifest Number',
      'Delivery Date',
      'Unit',
      'Housing Area',
      'Order Number',
      'Barcode',
      'Offender ID',
      'Offender Name',
      'Items Count',
      'Order Total ($)',
      'Inmate Signature',
    ];

    const rows = manifest.orders.map((ord) => {
      const itemQty = ord.items.reduce((sum, i) => sum + i.quantity, 0);
      return [
        manifest.manifestNumber,
        new Date(manifest.deliveryDate).toISOString().slice(0, 10),
        ord.offender.unit,
        ord.offender.housing,
        ord.orderNumber,
        ord.barcode,
        ord.offender.id,
        `"${ord.offender.name}"`,
        itemQty,
        ord.total.toFixed(2),
        '____________________',
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `Manifest_${manifest.manifestNumber.replace('#', '')}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintManifest = (manifest: ManifestRecord) => {
    setActivePrintManifest(manifest);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  return (
    <div className="space-y-6">
      <div className="no-print">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          Delivery Manifest Generator
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Consolidate packed commissary orders by facility unit, housing block, and delivery date. Exportable to CSV &amp; PDF.
        </p>
      </div>

      {feedback && (
        <div
          className={`no-print p-3.5 rounded-2xl border text-xs flex items-center justify-between shadow-sm ${
            feedback.type === 'success'
              ? 'bg-slate-100 dark:bg-[#181818] border-slate-300 dark:border-[#262626] text-slate-900 dark:text-white'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-600 dark:text-red-300'
          }`}
        >
          <span className="font-medium">{feedback.msg}</span>
          <button onClick={() => setFeedback(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Generator Form (Hidden when printing) */}
      <div className="no-print bg-white dark:bg-[#121212] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-[#262626] space-y-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Plus className="w-4 h-4 text-teal-500" />
          <span>Create New Delivery Manifest</span>
        </h2>

        <form onSubmit={handleGenerateManifest} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase">
                Facility Unit
              </label>
              <input
                type="text"
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. Unit 4"
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase">
                Housing Area / Block
              </label>
              <input
                type="text"
                value={housing}
                onChange={(e) => setHousing(e.target.value)}
                placeholder="e.g. Cell Block B"
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase">
                Scheduled Delivery Date
              </label>
              <input
                type="date"
                required
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-sm font-mono"
              />
            </div>
          </div>

          {/* Eligible Packed Orders Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase">
                Select Packed Orders Ready for Dispatch ({eligibleOrders.length})
              </label>
              {eligibleOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedOrderIds(
                      selectedOrderIds.length === eligibleOrders.length
                        ? []
                        : eligibleOrders.map((o) => o.id)
                    )
                  }
                  className="text-xs text-teal-600 dark:text-teal-400 font-bold hover:underline"
                >
                  {selectedOrderIds.length === eligibleOrders.length
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
              )}
            </div>

            {eligibleOrders.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-xs text-slate-500">
                No unassigned PACKED orders waiting for a manifest. Package an order in the Orders Queue first.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-[#262626] border border-slate-200 dark:border-[#262626] rounded-2xl bg-slate-50/50 dark:bg-[#181818] max-h-52 overflow-y-auto">
                {eligibleOrders.map((ord) => {
                  const isSelected = selectedOrderIds.includes(ord.id);
                  const qty = ord.items.reduce((s, i) => s + i.quantity, 0);
                  return (
                    <div
                      key={ord.id}
                      onClick={() => toggleOrderSelection(ord.id)}
                      className="p-3 flex items-center justify-between text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-[#202020] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-teal-500 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <div>
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {ord.orderNumber}
                          </span>
                          <span className="text-slate-500 ml-2">
                            {ord.offender.name} ({ord.offender.id}) &bull; {ord.offender.unit}, {ord.offender.housing}
                          </span>
                        </div>
                      </div>
                      <div className="font-mono text-teal-600 dark:text-teal-400 font-semibold">
                        {qty} items (${ord.total.toFixed(2)})
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={generating || selectedOrderIds.length === 0}
            className="btn-teal px-6 py-3 rounded-2xl font-bold text-xs inline-flex items-center gap-2 shadow-sm"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                <span>Generate Delivery Manifest ({selectedOrderIds.length} Orders)</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Generated Manifests History */}
      <div className="no-print space-y-3">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Generated Delivery Manifests</h2>

        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 text-teal-500 animate-spin mx-auto" />
          </div>
        ) : manifests.length === 0 ? (
          <div className="bg-white dark:bg-[#121212] p-8 rounded-3xl text-center border border-slate-200 dark:border-[#262626] text-xs text-slate-400 shadow-sm">
            No delivery manifests generated yet.
          </div>
        ) : (
          manifests.map((manifest) => (
            <div
              key={manifest.id}
              className="bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] space-y-4 shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#262626]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-base text-teal-600 dark:text-teal-400">
                      {manifest.manifestNumber}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800">
                      {manifest.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                    Destination: <strong>{manifest.unit}</strong>{' '}
                    {manifest.housing ? `(${manifest.housing})` : ''} &bull; Delivery Date:{' '}
                    {new Date(manifest.deliveryDate).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => exportManifestCSV(manifest)}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-[#181818] hover:bg-slate-200 dark:hover:bg-[#202020] text-xs font-semibold text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#262626] inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-teal-500" />
                    <span>Export CSV</span>
                  </button>

                  <button
                    onClick={() => handlePrintManifest(manifest)}
                    className="btn-teal px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print / PDF Manifest</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-500 uppercase text-[10px] border-b border-slate-100 dark:border-[#262626]">
                      <th className="py-2 px-2">Order #</th>
                      <th className="py-2 px-2">Barcode</th>
                      <th className="py-2 px-2">Offender</th>
                      <th className="py-2 px-2">Housing</th>
                      <th className="py-2 px-2 text-center">Items</th>
                      <th className="py-2 px-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#262626]">
                    {manifest.orders.map((ord) => (
                      <tr key={ord.id}>
                        <td className="py-2 px-2 font-mono font-bold text-slate-900 dark:text-white">
                          {ord.orderNumber}
                        </td>
                        <td className="py-2 px-2 font-mono text-slate-500">{ord.barcode}</td>
                        <td className="py-2 px-2 text-slate-900 dark:text-white">
                          {ord.offender.name} ({ord.offender.id})
                        </td>
                        <td className="py-2 px-2 text-slate-600 dark:text-slate-300">
                          {ord.offender.unit} - {ord.offender.housing}
                        </td>
                        <td className="py-2 px-2 text-center font-mono text-teal-600 dark:text-teal-400">
                          {ord.items.reduce((s, i) => s + i.quantity, 0)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-slate-900 dark:text-white">
                          ${ord.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Printable PDF Manifest Sheet */}
      {activePrintManifest && (
        <div className="bg-white p-6 rounded-2xl border border-slate-300 text-black space-y-4 print-only">
          <div className="flex justify-between items-start border-b border-slate-300 pb-4">
            <div>
              <h2 className="text-xl font-bold">
                OFFICIAL COMMISSARY DELIVERY MANIFEST
              </h2>
              <p className="text-xs text-slate-600">
                {activePrintManifest.facility?.name || 'Cumberland Regional Correctional Center'}
              </p>
            </div>
            <div className="text-right font-mono text-xs">
              <div className="font-bold text-sm">{activePrintManifest.manifestNumber}</div>
              <div>
                Delivery: {new Date(activePrintManifest.deliveryDate).toLocaleDateString()}
              </div>
              <div>
                Unit: {activePrintManifest.unit} ({activePrintManifest.housing})
              </div>
            </div>
          </div>

          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-300 uppercase text-[10px]">
                <th className="py-2 px-2">Order #</th>
                <th className="py-2 px-2">Barcode</th>
                <th className="py-2 px-2">Offender Name &amp; ID</th>
                <th className="py-2 px-2">Cell / Housing</th>
                <th className="py-2 px-2 text-center">Units</th>
                <th className="py-2 px-2">Inmate Signature</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {activePrintManifest.orders.map((ord) => (
                <tr key={ord.id}>
                  <td className="py-3 px-2 font-mono font-bold">{ord.orderNumber}</td>
                  <td className="py-3 px-2 font-mono">{ord.barcode}</td>
                  <td className="py-3 px-2">
                    {ord.offender.name} ({ord.offender.id})
                  </td>
                  <td className="py-3 px-2">{ord.offender.housing}</td>
                  <td className="py-3 px-2 text-center font-mono">
                    {ord.items.reduce((s, i) => s + i.quantity, 0)}
                  </td>
                  <td className="py-3 px-2 font-mono text-slate-400">
                    _______________________
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
