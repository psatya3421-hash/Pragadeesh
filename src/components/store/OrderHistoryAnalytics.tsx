import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, TrendingUp } from 'lucide-react';
import {
  aggregateOrderHistoryByCategory,
  aggregateOrderHistoryOverTime,
  formatINR,
  summarizeUserOrderMetrics,
} from '../../lib/domainLogic';
import type { Order, Product } from '../../types';

interface OrderHistoryAnalyticsProps {
  orders: Order[];
  products: Product[];
  onBrowseCatalog: () => void;
}

type ChartMode = 'category' | 'timeline';
type ScopeMode = 'all' | 'store';

const CATEGORY_COLORS = ['#0B1F3A', '#D4AF37', '#1D4ED8', '#059669', '#B45309', '#475569'];
const CATEGORY_SWATCH_CLASSES = [
  'bg-[#0B1F3A]',
  'bg-[#D4AF37]',
  'bg-blue-700',
  'bg-emerald-600',
  'bg-amber-700',
  'bg-slate-600',
];

export const OrderHistoryAnalytics: React.FC<OrderHistoryAnalyticsProps> = ({
  orders,
  products,
  onBrowseCatalog,
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>('category');
  const [scope, setScope] = useState<ScopeMode>('all');

  const hasNonStoreOrders = useMemo(
    () => orders.some((o) => o.type !== 'store'),
    [orders],
  );

  const scopedOrders = useMemo(
    () => (scope === 'store' ? orders.filter((o) => o.type === 'store') : orders),
    [orders, scope],
  );

  const metrics = useMemo(
    () => summarizeUserOrderMetrics(scopedOrders, products),
    [scopedOrders, products],
  );

  const categoryData = useMemo(
    () => aggregateOrderHistoryByCategory(scopedOrders, products),
    [scopedOrders, products],
  );

  const timeSeriesData = useMemo(
    () => aggregateOrderHistoryOverTime(scopedOrders),
    [scopedOrders],
  );

  const totalCategorySpend = useMemo(
    () => categoryData.reduce((acc, item) => acc + item.totalAmount, 0),
    [categoryData],
  );

  return (
    <section
      data-testid="order-history-analytics"
      aria-label="Order Spending Analytics"
      className="pb-6 border-b border-slate-200 space-y-5"
    >
      {/* Header & Interactive Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-bold text-[#0B1F3A]">
            Order History Breakdown
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Track spending across product categories and price trends over time
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasNonStoreOrders && (
            <div
              role="group"
              aria-label="Order scope filter"
              className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200"
            >
              <button
                type="button"
                data-testid="analytics-scope-all"
                onClick={() => setScope('all')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  scope === 'all'
                    ? 'bg-white text-[#0B1F3A] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Orders
              </button>
              <button
                type="button"
                data-testid="analytics-scope-store"
                onClick={() => setScope('store')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  scope === 'store'
                    ? 'bg-white text-[#0B1F3A] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Store Only
              </button>
            </div>
          )}

          <div
            role="group"
            aria-label="Chart breakdown mode"
            className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200"
          >
            <button
              type="button"
              data-testid="analytics-mode-category"
              onClick={() => setChartMode('category')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                chartMode === 'category'
                  ? 'bg-[#0B1F3A] text-[#F5C542] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>By Category</span>
            </button>
            <button
              type="button"
              data-testid="analytics-mode-timeline"
              onClick={() => setChartMode('timeline')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                chartMode === 'timeline'
                  ? 'bg-[#0B1F3A] text-[#F5C542] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Price Over Time</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabular Summary Strip */}
      <dl className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border border-slate-200 rounded-xl bg-slate-50/70">
        <div className="px-4 py-3">
          <dt className="text-xs text-slate-500 font-medium">Total Orders</dt>
          <dd
            data-testid="analytics-total-orders"
            className="font-mono text-lg font-bold text-[#0B1F3A] tabular-nums mt-0.5"
          >
            {metrics.totalOrders}
          </dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-xs text-slate-500 font-medium">Order Volume</dt>
          <dd
            data-testid="analytics-total-spend"
            className="font-mono text-lg font-bold text-[#0B1F3A] tabular-nums mt-0.5"
          >
            {formatINR(metrics.totalSpend)}
          </dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-xs text-slate-500 font-medium">Verified Spend</dt>
          <dd className="font-mono text-lg font-bold text-emerald-700 tabular-nums mt-0.5">
            {formatINR(metrics.verifiedSpend)}
          </dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-xs text-slate-500 font-medium">
            {chartMode === 'category' ? 'Top Category' : 'Avg. Order Value'}
          </dt>
          <dd className="font-mono text-lg font-bold text-[#0B1F3A] tabular-nums truncate mt-0.5">
            {chartMode === 'category' ? metrics.topCategory : formatINR(metrics.averageOrderValue)}
          </dd>
        </div>
      </dl>

      {/* Chart Viewport */}
      {scopedOrders.filter((o) => o.status !== 'Rejected').length === 0 ? (
        <div
          data-testid="analytics-empty-state"
          className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center space-y-3"
        >
          <p className="font-display text-sm font-bold text-[#0B1F3A]">
            No order history to chart yet
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Place your first order from the catalog to visualize spending across product categories and over time.
          </p>
          <button
            type="button"
            onClick={onBrowseCatalog}
            className="px-4 py-2 rounded-lg bg-[#0B1F3A] text-[#F5C542] text-xs font-bold whitespace-nowrap"
          >
            Browse Catalog
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="h-[260px] w-full pt-2" data-testid="recharts-container">
            <ResponsiveContainer width="100%" height="100%">
              {chartMode === 'category' ? (
                <BarChart
                  data={categoryData}
                  margin={{ top: 10, right: 16, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="category"
                    tick={{ fill: '#475569', fontSize: 12 }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(val: number) => `₹${val}`}
                    tick={{ fill: '#475569', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(11, 31, 58, 0.04)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const pt = payload[0].payload as (typeof categoryData)[number];
                      return (
                        <div className="rounded-lg bg-[#0B1F3A] text-white px-3 py-2 text-xs shadow-lg border border-[#D4AF37]/40 space-y-1">
                          <div className="font-bold text-[#F5C542]">{pt.category}</div>
                          <div className="font-mono tabular-nums">
                            Spend: {formatINR(pt.totalAmount)}
                          </div>
                          <div className="text-slate-300 font-mono tabular-nums">
                            {pt.orderCount} order(s) · {pt.itemCount} item(s)
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="totalAmount"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={56}
                    isAnimationActive={false}
                  >
                    {categoryData.map((entry, idx) => (
                      <Cell
                        key={entry.category}
                        fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <AreaChart
                  data={timeSeriesData}
                  margin={{ top: 10, right: 16, left: 8, bottom: 8 }}
                >
                  <defs>
                    <linearGradient id="primexSpendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#D4AF37" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#475569', fontSize: 12 }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(val: number) => `₹${val}`}
                    tick={{ fill: '#475569', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const pt = payload[0].payload as (typeof timeSeriesData)[number];
                      return (
                        <div className="rounded-lg bg-[#0B1F3A] text-white px-3 py-2 text-xs shadow-lg border border-[#D4AF37]/40 space-y-1">
                          <div className="font-bold text-[#F5C542]">{pt.label}</div>
                          <div className="font-mono tabular-nums">
                            Spend: {formatINR(pt.amount)}
                          </div>
                          <div className="font-mono tabular-nums text-slate-200">
                            Cumulative: {formatINR(pt.cumulativeAmount)}
                          </div>
                          <div className="text-slate-300 font-mono tabular-nums">
                            {pt.orderCount} order(s)
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#0B1F3A"
                    strokeWidth={2.5}
                    fill="url(#primexSpendFill)"
                    isAnimationActive={false}
                    dot={{ r: 3.5, fill: '#0B1F3A', stroke: '#D4AF37', strokeWidth: 1.5 }}
                    activeDot={{ r: 5, fill: '#D4AF37', stroke: '#0B1F3A', strokeWidth: 2 }}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* Structured Ledger Legend (No Pills) */}
          {chartMode === 'category' && categoryData.length > 0 && (
            <div className="divide-y divide-slate-100 border-t border-slate-200 pt-2">
              {categoryData.map((row, idx) => {
                const share =
                  totalCategorySpend > 0
                    ? Math.round((row.totalAmount / totalCategorySpend) * 100)
                    : 0;
                return (
                  <div
                    key={row.category}
                    className="py-2 flex items-center justify-between gap-4 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        aria-hidden="true"
                        className={`w-2.5 h-2.5 rounded-sm shrink-0 ${
                          CATEGORY_SWATCH_CLASSES[idx % CATEGORY_SWATCH_CLASSES.length]
                        }`}
                      />
                      <span className="font-semibold text-slate-800 truncate">
                        {row.category}
                      </span>
                      <span className="text-slate-400 font-mono tabular-nums">
                        {row.orderCount} order(s) · {row.itemCount} item(s)
                      </span>
                    </div>
                    <div className="flex items-center gap-4 font-mono tabular-nums shrink-0">
                      <span className="text-slate-500">{share}%</span>
                      <span className="font-bold text-[#0B1F3A]">
                        {formatINR(row.totalAmount)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
