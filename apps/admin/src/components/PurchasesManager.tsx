'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import {
  PRODUCT_QUALITIES,
  PRODUCT_QUALITY_LABELS,
  PRODUCT_UNITS,
  PRODUCT_UNIT_LABELS,
  VISIT_EXPENSE_PRESETS,
  formatMoney,
  suggestSalePrice,
  type ProductQuality,
  type ProductUnit,
} from '@puertaverde/shared';

import { LowStockBanner } from '@/components/LowStockBanner';
import { MarketComparePanel } from '@/components/MarketComparePanel';
import { ProductSearchSelect } from '@/components/ProductSearchSelect';
import { DecimalInput, parseDecimal } from '@/components/DecimalInput';

interface ProductOption {
  id: string;
  stock: number;
  piece_stock?: number | null;
  min_stock?: number | null;
  price?: number;
  avg_unit_cost?: number;
  last_unit_cost?: number | null;
  product: {
    id: string;
    name: string;
    unit: ProductUnit;
    sku?: string | null;
    weigh_at_fulfillment?: boolean;
  };
}

interface SupplierRow {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface PurchaseRow {
  id: string;
  purchased_at: string;
  notes: string | null;
  total_amount: number;
  created_at: string;
  supplier: { id: string; name: string } | null;
  items: Array<{
    id: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    quality?: ProductQuality | null;
    piece_count?: number | null;
    branch_product: {
      id: string;
      product: {
        name: string;
        unit: ProductUnit;
        weigh_at_fulfillment?: boolean;
      } | null;
    } | null;
  }>;
}

interface CompareRow {
  branch_product_id: string;
  product_name: string;
  unit: string;
  supplier_id: string;
  supplier_name: string;
  purchase_count: number;
  total_quantity: number;
  avg_unit_price: number;
  min_unit_price: number;
  max_unit_price: number;
  last_unit_price: number;
  last_purchased_at: string;
}

interface EditItemDraft {
  id: string;
  branchProductId: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  quality: ProductQuality;
  pieceCount: string;
  productName: string;
  unitLabel: string;
  weighAtFulfillment: boolean;
}

interface EditPurchaseDraft {
  purchaseId: string;
  supplierId: string;
  purchasedAt: string;
  notes: string;
  items: EditItemDraft[];
}

interface ExpenseRow {
  id: string;
  concept: string;
  amount: number;
  expense_date: string;
  notes: string | null;
  created_at: string;
}

interface ExpenseDraft {
  conceptPreset: string;
  customConcept: string;
  amount: string;
  notes: string;
}

interface EditExpenseDraft {
  id: string;
  concept: string;
  amount: string;
  notes: string;
  expenseDate: string;
}

function emptyExpenseDraft(): ExpenseDraft {
  return {
    conceptPreset: 'Gasolina',
    customConcept: '',
    amount: '',
    notes: '',
  };
}

function resolveExpenseConcept(draft: ExpenseDraft): string {
  if (draft.conceptPreset === 'Otro') return draft.customConcept.trim();
  return draft.conceptPreset.trim();
}

interface NewProductDraft {
  name: string;
  unit: ProductUnit;
  salePrice: string;
}

interface LineDraft {
  key: string;
  branchProductId: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  quality: ProductQuality;
  pieceCount: string;
  newProduct: NewProductDraft | null;
}

function emptyLine(key = String(Date.now())): LineDraft {
  return {
    key,
    branchProductId: '',
    quantity: '',
    unitPrice: '',
    lineTotal: '',
    quality: 'normal',
    pieceCount: '',
    newProduct: null,
  };
}

function formatQty(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(Number(n.toFixed(3)));
}

function formatMoneyAmount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(Number(n.toFixed(2)));
}

type AmountField = 'quantity' | 'unitPrice' | 'lineTotal';

/** With any two of qty / unit price / line total, derive the third. */
function applyAmountChange(line: LineDraft, field: AmountField, raw: string): LineDraft {
  const next: LineDraft = { ...line, [field]: raw };
  const qty = parseDecimal(next.quantity);
  const unit = parseDecimal(next.unitPrice);
  const total = parseDecimal(next.lineTotal);

  if (field === 'quantity') {
    if (qty > 0 && unit > 0) next.lineTotal = formatMoneyAmount(qty * unit);
    else if (qty > 0 && total > 0) next.unitPrice = formatMoneyAmount(total / qty);
  } else if (field === 'unitPrice') {
    if (qty > 0 && unit > 0) next.lineTotal = formatMoneyAmount(qty * unit);
    else if (unit > 0 && total > 0) next.quantity = formatQty(total / unit);
  } else if (field === 'lineTotal') {
    if (qty > 0 && total > 0) next.unitPrice = formatMoneyAmount(total / qty);
    else if (unit > 0 && total > 0) next.quantity = formatQty(total / unit);
  }

  if (next.newProduct && (field === 'unitPrice' || field === 'lineTotal' || field === 'quantity')) {
    const cost = parseDecimal(next.unitPrice);
    if (cost > 0 && !next.newProduct.salePrice.trim()) {
      next.newProduct = {
        ...next.newProduct,
        salePrice: String(suggestSalePrice({ cost }) || ''),
      };
    }
  }

  return next;
}

type Tab = 'compra' | 'proveedores' | 'comparar';

function todayLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function monthRange(ym: string): { from: string; to: string } {
  const [yRaw, mRaw] = ym.split('-');
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!y || !m) {
    const today = todayLocalDate();
    return { from: `${today.slice(0, 7)}-01`, to: today };
  }
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

export function PurchasesManager({
  initialPurchases,
  initialProducts,
  initialSuppliers,
  initialExpenses,
  canManage = true,
}: {
  initialPurchases: PurchaseRow[];
  initialProducts: ProductOption[];
  initialSuppliers: SupplierRow[];
  initialExpenses: ExpenseRow[];
  canManage?: boolean;
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>('compra');
  const [purchases, setPurchases] = useState(initialPurchases);
  const [products, setProducts] = useState(initialProducts);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [expenses, setExpenses] = useState(initialExpenses);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingPurchaseId, setDeletingPurchaseId] = useState<string | null>(null);
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>(emptyExpenseDraft);
  const [historialExpenseDraft, setHistorialExpenseDraft] =
    useState<ExpenseDraft>(emptyExpenseDraft);
  const [editExpenseDraft, setEditExpenseDraft] = useState<EditExpenseDraft | null>(null);

  const [supplierId, setSupplierId] = useState(initialSuppliers.find((s) => s.is_active)?.id ?? '');
  const [purchasedAt, setPurchasedAt] = useState(todayLocalDate());
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine('1')]);

  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierNotes, setSupplierNotes] = useState('');
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);

  const [compareProductId, setCompareProductId] = useState('');
  const [compareDays, setCompareDays] = useState(90);
  const [comparison, setComparison] = useState<CompareRow[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditPurchaseDraft | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPeriod, setHistoryPeriod] = useState<'month' | 'custom'>('month');
  const [historyMonth, setHistoryMonth] = useState(() => todayLocalDate().slice(0, 7));
  const [historyFrom, setHistoryFrom] = useState(() => `${todayLocalDate().slice(0, 7)}-01`);
  const [historyTo, setHistoryTo] = useState(todayLocalDate());

  useEffect(() => {
    const product = searchParams.get('product');
    const tabParam = searchParams.get('tab') as Tab | 'historial' | null;
    if (tabParam === 'historial') {
      setTab('compra');
    } else if (tabParam && ['compra', 'proveedores', 'comparar'].includes(tabParam)) {
      setTab(tabParam);
    }
    if (product && products.some((row) => row.id === product)) {
      setLines([{ ...emptyLine('prefill'), branchProductId: product }]);
      setTab('compra');
    }
  }, [searchParams, products]);

  const activeSuppliers = useMemo(() => suppliers.filter((s) => s.is_active), [suppliers]);
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  function lineIsWeigh(line: LineDraft): boolean {
    if (line.newProduct) return line.newProduct.unit === 'kg';
    return Boolean(productById.get(line.branchProductId)?.product.weigh_at_fulfillment);
  }

  const visitsByDate = useMemo(() => {
    const groups = new Map<
      string,
      {
        date: string;
        purchaseTotal: number;
        expenseTotal: number;
        total: number;
        purchaseCount: number;
        expenseCount: number;
        purchases: PurchaseRow[];
        expenses: ExpenseRow[];
      }
    >();

    function ensure(date: string) {
      const current = groups.get(date);
      if (current) return current;
      const created = {
        date,
        purchaseTotal: 0,
        expenseTotal: 0,
        total: 0,
        purchaseCount: 0,
        expenseCount: 0,
        purchases: [] as PurchaseRow[],
        expenses: [] as ExpenseRow[],
      };
      groups.set(date, created);
      return created;
    }

    for (const purchase of purchases) {
      const current = ensure(purchase.purchased_at);
      current.purchaseTotal += Number(purchase.total_amount) || 0;
      current.purchaseCount += 1;
      current.purchases.push(purchase);
    }
    for (const expense of expenses) {
      const current = ensure(expense.expense_date);
      current.expenseTotal += Number(expense.amount) || 0;
      current.expenseCount += 1;
      current.expenses.push(expense);
    }
    for (const group of groups.values()) {
      group.total = group.purchaseTotal + group.expenseTotal;
    }
    return Array.from(groups.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [purchases, expenses]);

  const historyBounds = useMemo(() => {
    if (historyPeriod === 'month') return monthRange(historyMonth);
    return {
      from: historyFrom || monthRange(historyMonth).from,
      to: historyTo || todayLocalDate(),
    };
  }, [historyPeriod, historyMonth, historyFrom, historyTo]);

  const filteredVisits = useMemo(() => {
    const needle = historySearch.trim().toLowerCase();
    const { from, to } = historyBounds;

    return visitsByDate
      .filter((group) => group.date >= from && group.date <= to)
      .map((group) => {
        if (!needle) return group;
        const matchedPurchases = group.purchases.filter((purchase) => {
          const supplier = purchase.supplier?.name?.toLowerCase() ?? '';
          const notes = (purchase.notes ?? '').toLowerCase();
          const productsHit = (purchase.items ?? []).some((item) =>
            (item.branch_product?.product?.name ?? '').toLowerCase().includes(needle),
          );
          return supplier.includes(needle) || notes.includes(needle) || productsHit;
        });
        const matchedExpenses = group.expenses.filter((expense) => {
          const concept = expense.concept.toLowerCase();
          const notes = (expense.notes ?? '').toLowerCase();
          return concept.includes(needle) || notes.includes(needle);
        });
        if (matchedPurchases.length === 0 && matchedExpenses.length === 0) return null;
        const purchaseTotal = matchedPurchases.reduce(
          (sum, purchase) => sum + (Number(purchase.total_amount) || 0),
          0,
        );
        const expenseTotal = matchedExpenses.reduce(
          (sum, expense) => sum + (Number(expense.amount) || 0),
          0,
        );
        return {
          ...group,
          purchases: matchedPurchases,
          expenses: matchedExpenses,
          purchaseCount: matchedPurchases.length,
          expenseCount: matchedExpenses.length,
          purchaseTotal,
          expenseTotal,
          total: purchaseTotal + expenseTotal,
        };
      })
      .filter((group): group is NonNullable<typeof group> => group != null);
  }, [visitsByDate, historySearch, historyBounds]);

  const historyTotals = useMemo(
    () =>
      filteredVisits.reduce(
        (acc, group) => ({
          purchaseTotal: acc.purchaseTotal + group.purchaseTotal,
          expenseTotal: acc.expenseTotal + group.expenseTotal,
          total: acc.total + group.total,
          purchaseCount: acc.purchaseCount + group.purchaseCount,
          expenseCount: acc.expenseCount + group.expenseCount,
          visitCount: acc.visitCount + 1,
        }),
        {
          purchaseTotal: 0,
          expenseTotal: 0,
          total: 0,
          purchaseCount: 0,
          expenseCount: 0,
          visitCount: 0,
        },
      ),
    [filteredVisits],
  );

  const draftTotal = useMemo(
    () => lines.reduce((sum, line) => sum + Math.max(0, parseDecimal(line.lineTotal)), 0),
    [lines],
  );

  const visitExpenseTotalForDraftDate = useMemo(
    () =>
      expenses
        .filter((expense) => expense.expense_date === purchasedAt)
        .reduce((sum, expense) => sum + Number(expense.amount), 0),
    [expenses, purchasedAt],
  );

  async function refreshPurchases() {
    const response = await fetch('/api/purchases');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Error al recargar');
    setPurchases(payload.purchases);
    setProducts(payload.products ?? products);
    setSuppliers(payload.suppliers);
    setExpenses(payload.expenses ?? []);
  }

  async function submitExpense(date: string, draft: ExpenseDraft, onSuccess?: () => void) {
    if (!canManage) {
      setError('No tienes permiso para registrar compras o gastos');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: resolveExpenseConcept(draft),
          amount: parseDecimal(draft.amount),
          expenseDate: date,
          notes: draft.notes || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo registrar el gasto');
      onSuccess?.();
      await refreshPurchases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar gasto');
    } finally {
      setSaving(false);
    }
  }

  async function saveEditExpense() {
    if (!canManage) {
      setError('No tienes permiso para editar gastos');
      return;
    }
    if (!editExpenseDraft) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/expenses/${editExpenseDraft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: editExpenseDraft.concept,
          amount: parseDecimal(editExpenseDraft.amount),
          expenseDate: editExpenseDraft.expenseDate,
          notes: editExpenseDraft.notes || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar el gasto');
      setEditExpenseDraft(null);
      await refreshPurchases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al editar gasto');
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(id: string) {
    if (!canManage) {
      setError('No tienes permiso para eliminar gastos');
      return;
    }
    if (!window.confirm('¿Eliminar este gasto de la visita?')) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo eliminar');
      if (editExpenseDraft?.id === id) setEditExpenseDraft(null);
      await refreshPurchases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar gasto');
    } finally {
      setSaving(false);
    }
  }

  function renderExpenseForm(
    draft: ExpenseDraft,
    setDraft: (next: ExpenseDraft) => void,
    onSubmit: () => void,
    submitLabel: string,
  ) {
    return (
      <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_1fr_auto]">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Concepto</span>
          <select
            className="pv-input mt-1"
            value={draft.conceptPreset}
            onChange={(e) => setDraft({ ...draft, conceptPreset: e.target.value })}
          >
            {VISIT_EXPENSE_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
          </select>
          {draft.conceptPreset === 'Otro' && (
            <input
              className="pv-input mt-2"
              placeholder="Describe el gasto"
              value={draft.customConcept}
              onChange={(e) => setDraft({ ...draft, customConcept: e.target.value })}
            />
          )}
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Monto</span>
          <DecimalInput
            className="pv-input mt-1"
            value={draft.amount}
            onChange={(value) => setDraft({ ...draft, amount: value })}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Notas</span>
          <input
            className="pv-input mt-1"
            placeholder="Opcional"
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            disabled={saving}
            onClick={onSubmit}
            className="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Guardando…' : submitLabel}
          </button>
        </div>
      </div>
    );
  }

  function startNewProduct(lineIndex: number, name: string) {
    const cost = parseDecimal(lines[lineIndex]?.unitPrice ?? '');
    setLines((prev) =>
      prev.map((row, i) =>
        i === lineIndex
          ? {
              ...row,
              branchProductId: '',
              newProduct: {
                name,
                unit: 'kg',
                salePrice: cost > 0 ? String(suggestSalePrice({ cost }) || '') : '',
              },
            }
          : row,
      ),
    );
    setError(null);
  }

  function updateNewProduct(
    lineIndex: number,
    patch: Partial<NewProductDraft>,
  ) {
    setLines((prev) =>
      prev.map((row, i) =>
        i === lineIndex && row.newProduct
          ? { ...row, newProduct: { ...row.newProduct, ...patch } }
          : row,
      ),
    );
  }

  async function ensureProductsForLines(currentLines: LineDraft[]): Promise<LineDraft[]> {
    const resolved: LineDraft[] = [];
    for (const line of currentLines) {
      if (!line.newProduct) {
        resolved.push(line);
        continue;
      }
      const name = line.newProduct.name.trim();
      if (!name) throw new Error('Cada producto nuevo necesita nombre.');
      const salePrice = parseDecimal(line.newProduct.salePrice);
      if (!(salePrice > 0)) {
        throw new Error(`Indica el precio de venta de «${name}».`);
      }
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          unit: line.newProduct.unit,
          price: salePrice,
          isAvailable: true,
          isActive: true,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `No se pudo crear «${name}»`);
      resolved.push({
        ...line,
        branchProductId: result.branchProductId as string,
        newProduct: null,
      });
    }
    return resolved;
  }

  async function saveSupplier() {
    if (!canManage) {
      setError('No tienes permiso para gestionar proveedores');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingSupplierId || undefined,
          name: supplierName,
          phone: supplierPhone || null,
          notes: supplierNotes || null,
          isActive: true,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar');
      setSupplierName('');
      setSupplierPhone('');
      setSupplierNotes('');
      setEditingSupplierId(null);
      await refreshPurchases();
      if (result.supplier?.id) setSupplierId(result.supplier.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar proveedor');
    } finally {
      setSaving(false);
    }
  }

  async function submitPurchase() {
    if (!canManage) {
      setError('No tienes permiso para registrar compras');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const withProducts = await ensureProductsForLines(lines);
      for (const line of withProducts) {
        if (!line.branchProductId) throw new Error('Cada partida necesita un producto.');
        if (!(parseDecimal(line.quantity) > 0)) {
          throw new Error('La cantidad (kg) debe ser mayor a cero.');
        }
        if (parseDecimal(line.unitPrice) < 0) {
          throw new Error('El precio unitario no puede ser negativo.');
        }
        const product = productById.get(line.branchProductId);
        const weigh = Boolean(product?.product.weigh_at_fulfillment);
        if (weigh && line.pieceCount.trim() && !(parseDecimal(line.pieceCount) > 0)) {
          throw new Error('Las piezas deben ser mayores a cero.');
        }
      }

      const response = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          purchasedAt,
          notes: notes || null,
          items: withProducts.map((line) => {
            const product = productById.get(line.branchProductId);
            const weigh = Boolean(product?.product.weigh_at_fulfillment);
            const pieces = parseDecimal(line.pieceCount);
            return {
              branchProductId: line.branchProductId,
              quantity: parseDecimal(line.quantity),
              unitPrice: parseDecimal(line.unitPrice),
              quality: line.quality,
              ...(weigh && pieces > 0 ? { pieceCount: pieces } : {}),
            };
          }),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo registrar');
      setNotes('');
      setLines([emptyLine()]);
      await refreshPurchases();
      setExpandedDate(purchasedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar compra');
    } finally {
      setSaving(false);
    }
  }

  async function loadComparison() {
    setCompareLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: String(compareDays) });
      if (compareProductId) params.set('branchProductId', compareProductId);
      const response = await fetch(`/api/purchases/compare?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Error al comparar');
      setComparison(payload.comparison ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al comparar precios');
    } finally {
      setCompareLoading(false);
    }
  }

  function startEditPurchase(purchase: PurchaseRow) {
    setEditDraft({
      purchaseId: purchase.id,
      supplierId: purchase.supplier?.id ?? '',
      purchasedAt: purchase.purchased_at,
      notes: purchase.notes ?? '',
      items: (purchase.items ?? []).map((item) => ({
        id: item.id,
        branchProductId: item.branch_product?.id ?? '',
        quantity: String(Number(item.quantity)),
        unitPrice: String(Number(item.unit_price)),
        lineTotal: String(Number(item.line_total)),
        quality: (item.quality as ProductQuality) || 'normal',
        pieceCount:
          item.piece_count != null && Number(item.piece_count) > 0
            ? String(Number(item.piece_count))
            : '',
        productName: item.branch_product?.product?.name ?? 'Producto',
        unitLabel: item.branch_product?.product?.unit
          ? PRODUCT_UNIT_LABELS[item.branch_product.product.unit]
          : '',
        weighAtFulfillment: Boolean(item.branch_product?.product?.weigh_at_fulfillment),
      })),
    });
  }

  function updateEditItemProduct(itemId: string, branchProductId: string) {
    const product = products.find((row) => row.id === branchProductId);
    setEditDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item) => {
          if (item.id !== itemId) return item;
          return {
            ...item,
            branchProductId,
            productName: product?.product.name ?? item.productName,
            unitLabel: product ? PRODUCT_UNIT_LABELS[product.product.unit] : item.unitLabel,
            weighAtFulfillment: Boolean(product?.product.weigh_at_fulfillment),
            pieceCount: product?.product.weigh_at_fulfillment ? item.pieceCount : '',
          };
        }),
      };
    });
  }

  function updateEditItem(itemId: string, field: AmountField | 'quality' | 'pieceCount', value: string) {
    setEditDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item) => {
          if (item.id !== itemId) return item;
          if (field === 'quality') {
            return { ...item, quality: value as ProductQuality };
          }
          if (field === 'pieceCount') {
            return { ...item, pieceCount: value };
          }
          const next = { ...item, [field]: value };
          const qty = parseDecimal(next.quantity);
          const unit = parseDecimal(next.unitPrice);
          const total = parseDecimal(next.lineTotal);
          if (field === 'quantity') {
            if (qty > 0 && unit > 0) next.lineTotal = formatMoneyAmount(qty * unit);
            else if (qty > 0 && total > 0) next.unitPrice = formatMoneyAmount(total / qty);
          } else if (field === 'unitPrice') {
            if (qty > 0 && unit > 0) next.lineTotal = formatMoneyAmount(qty * unit);
            else if (unit > 0 && total > 0) next.quantity = formatQty(total / unit);
          } else if (field === 'lineTotal') {
            if (qty > 0 && total > 0) next.unitPrice = formatMoneyAmount(total / qty);
            else if (unit > 0 && total > 0) next.quantity = formatQty(total / unit);
          }
          return next;
        }),
      };
    });
  }

  async function saveEditPurchase() {
    if (!canManage) {
      setError('No tienes permiso para editar compras');
      return;
    }
    if (!editDraft) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/purchases/${editDraft.purchaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: editDraft.supplierId || undefined,
          purchasedAt: editDraft.purchasedAt,
          notes: editDraft.notes || null,
          items: editDraft.items.map((item) => ({
            id: item.id,
            branchProductId: item.branchProductId || undefined,
            quantity: parseDecimal(item.quantity),
            unitPrice: parseDecimal(item.unitPrice),
            quality: item.quality,
            pieceCount:
              item.weighAtFulfillment && parseDecimal(item.pieceCount) > 0
                ? parseDecimal(item.pieceCount)
                : null,
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar');
      setEditDraft(null);
      await refreshPurchases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al editar compra');
    } finally {
      setSaving(false);
    }
  }

  async function deletePurchase(purchase: PurchaseRow) {
    if (!canManage) {
      setError('No tienes permiso para eliminar compras');
      return;
    }
    const label = purchase.supplier?.name ?? 'esta compra';
    if (
      !window.confirm(
        `¿Eliminar la compra de ${label} por ${formatMoney(Number(purchase.total_amount))}? Se restará del inventario.`,
      )
    ) {
      return;
    }
    setSaving(true);
    setDeletingPurchaseId(purchase.id);
    setError(null);
    try {
      const response = await fetch(`/api/purchases/${purchase.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo eliminar');
      if (editDraft?.purchaseId === purchase.id) setEditDraft(null);
      await refreshPurchases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar compra');
    } finally {
      setSaving(false);
      setDeletingPurchaseId(null);
    }
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'compra', label: 'Nueva compra' },
    { id: 'proveedores', label: 'Proveedores' },
    { id: 'comparar', label: 'Comparar proveedores' },
  ];

  return (
    <div className="space-y-6">
      <LowStockBanner products={products} href="/?section=stock" />
      {!canManage ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Solo lectura · no tienes permiso para registrar o editar compras.
        </p>
      ) : null}

      <div className="flex flex-wrap justify-center gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              tab === item.id
                ? 'bg-slate-900 text-white'
                : 'bg-white/70 text-slate-700 hover:bg-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      )}

      {tab === 'compra' && (
        <section className="pv-glass-card space-y-4 p-4 sm:p-6">
          <div className="flex gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xl"
              aria-hidden
            >
              🛒
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Registrar compra de materia prima
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Al confirmar se guarda el precio por proveedor y entra al stock. Puedes capturar por
                volumen (cantidad + total) y el unitario se calcula solo.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Proveedor *</span>
              <select
                className="pv-input mt-1"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">Selecciona...</option>
                {activeSuppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              {activeSuppliers.length === 0 && (
                <button
                  type="button"
                  className="mt-2 text-sm text-emerald-800 underline"
                  onClick={() => setTab('proveedores')}
                >
                  Primero agrega un proveedor
                </button>
              )}
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Fecha de compra</span>
              <input
                type="date"
                className="pv-input mt-1"
                value={purchasedAt}
                onChange={(e) => setPurchasedAt(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Notas</span>
              <input
                className="pv-input mt-1"
                placeholder="Ej. Mercado de abastos, factura 123"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium text-slate-800">Partidas</h3>
              <button
                type="button"
                className="text-sm font-medium text-emerald-800"
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
              >
                + Agregar producto
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Llena cualesquiera dos de cantidad (kg), precio unitario o total; el tercero se calcula
              solo. En productos «Pesar al preparar» puedes capturar también las piezas.
            </p>

            {lines.map((line, index) => {
              const weigh = lineIsWeigh(line);
              return (
              <div
                key={line.key}
                className={`space-y-3 rounded-2xl border border-slate-200/80 bg-white p-3 sm:p-4${
                  weigh ? ' border-l-[3px] border-l-emerald-500' : ''
                }`}
              >
                <div
                  className={`grid gap-3 ${
                    weigh
                      ? 'md:grid-cols-[minmax(0,1.3fr)_0.7fr_0.7fr_0.7fr_0.8fr_0.8fr_auto]'
                      : 'md:grid-cols-[minmax(0,1.4fr)_0.9fr_0.9fr_0.9fr_0.9fr_auto]'
                  }`}
                >
                  <div className="block text-sm">
                    <span className="font-medium text-slate-700">Producto</span>
                    {line.newProduct ? (
                      <input
                        className="pv-input mt-1"
                        value={line.newProduct.name}
                        onChange={(e) => updateNewProduct(index, { name: e.target.value })}
                        placeholder="Nombre del producto"
                      />
                    ) : (
                      <ProductSearchSelect
                        products={products}
                        value={line.branchProductId}
                        onChange={(id) =>
                          setLines((prev) =>
                            prev.map((row, i) =>
                              i === index
                                ? { ...row, branchProductId: id, newProduct: null, pieceCount: '' }
                                : row,
                            ),
                          )
                        }
                        onCreate={(name) => startNewProduct(index, name)}
                      />
                    )}
                  </div>
                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">Calidad</span>
                    <select
                      className="pv-input mt-1"
                      value={line.quality}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((row, i) =>
                            i === index
                              ? { ...row, quality: e.target.value as ProductQuality }
                              : row,
                          ),
                        )
                      }
                    >
                      {PRODUCT_QUALITIES.map((quality) => (
                        <option key={quality} value={quality}>
                          {PRODUCT_QUALITY_LABELS[quality]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {weigh ? (
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">Piezas</span>
                      <DecimalInput
                        placeholder="0"
                        className="pv-input mt-1"
                        value={line.pieceCount}
                        onChange={(value) =>
                          setLines((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, pieceCount: value } : row,
                            ),
                          )
                        }
                      />
                    </label>
                  ) : null}
                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">
                      {weigh ? 'Kg' : 'Cantidad'}
                    </span>
                    <DecimalInput
                      placeholder="0"
                      className="pv-input mt-1"
                      value={line.quantity}
                      onChange={(value) =>
                        setLines((prev) =>
                          prev.map((row, i) =>
                            i === index ? applyAmountChange(row, 'quantity', value) : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">
                      Precio unitario{weigh ? ' /kg' : ''}
                    </span>
                    <DecimalInput
                      placeholder="0"
                      className="pv-input mt-1"
                      value={line.unitPrice}
                      onChange={(value) =>
                        setLines((prev) =>
                          prev.map((row, i) =>
                            i === index ? applyAmountChange(row, 'unitPrice', value) : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">Total partida</span>
                    <DecimalInput
                      placeholder="0"
                      className="pv-input mt-1"
                      value={line.lineTotal}
                      onChange={(value) =>
                        setLines((prev) =>
                          prev.map((row, i) =>
                            i === index ? applyAmountChange(row, 'lineTotal', value) : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
                      disabled={lines.length === 1}
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                    >
                      Quitar
                    </button>
                  </div>
                </div>

                {line.newProduct && (
                  <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                      <label className="block text-sm">
                        <span className="font-medium text-slate-700">Unidad de venta</span>
                        <select
                          className="pv-input mt-1"
                          value={line.newProduct.unit}
                          onChange={(e) =>
                            updateNewProduct(index, { unit: e.target.value as ProductUnit })
                          }
                        >
                          {PRODUCT_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {PRODUCT_UNIT_LABELS[unit]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm">
                        <span className="font-medium text-slate-700">Precio de venta (tienda)</span>
                        <DecimalInput
                          placeholder="0"
                          className="pv-input mt-1"
                          value={line.newProduct.salePrice}
                          onChange={(value) => updateNewProduct(index, { salePrice: value })}
                        />
                      </label>
                      <div className="flex items-end">
                        <button
                          type="button"
                          className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-white"
                          onClick={() =>
                            setLines((prev) =>
                              prev.map((row, i) =>
                                i === index ? { ...row, newProduct: null } : row,
                              ),
                            )
                          }
                        >
                          Cancelar alta
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-emerald-900/80">
                      Producto nuevo: se crea al registrar la compra, sin stock previo. El costo
                      entra con esta partida.
                    </p>
                    <MarketComparePanel
                      productName={line.newProduct.name}
                      unit={line.newProduct.unit}
                      currentPrice={parseDecimal(line.newProduct.salePrice)}
                      cost={parseDecimal(line.unitPrice)}
                      compact
                      autoSearch
                      currentPriceLabel="Precio de tienda"
                      className="border-emerald-200 bg-white"
                      onPriceChange={(price) =>
                        updateNewProduct(index, { salePrice: String(price) })
                      }
                    />
                  </div>
                )}
              </div>
            );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-4">
            <p className="text-sm text-slate-600">
              Total compra:{' '}
              <span className="font-semibold text-slate-900">{formatMoney(draftTotal)}</span>
            </p>
            <button
              type="button"
              disabled={saving}
              onClick={submitPurchase}
              className="pv-btn-primary rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-60"
            >
              {saving ? 'Guardando…' : 'Registrar compra'}
            </button>
          </div>
        </section>
      )}

      {tab === 'compra' && (
        <section className="pv-glass-card space-y-4 p-4 sm:p-6">
          <div className="flex gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl"
              aria-hidden
            >
              🧾
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Otros gastos de la visita
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Gasolina, bolsas, estacionamiento u otros egresos de la misma fecha (
                {new Date(`${purchasedAt}T12:00:00`).toLocaleDateString('es-MX')}). No afectan el
                inventario.
              </p>
            </div>
          </div>

          {expenses.filter((expense) => expense.expense_date === purchasedAt).length > 0 && (
            <ul className="space-y-2">
              {expenses
                .filter((expense) => expense.expense_date === purchasedAt)
                .map((expense) => (
                  <li
                    key={expense.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{expense.concept}</p>
                      {expense.notes ? (
                        <p className="text-slate-500">{expense.notes}</p>
                      ) : null}
                    </div>
                    <p className="font-semibold text-slate-900">
                      {formatMoney(Number(expense.amount))}
                    </p>
                  </li>
                ))}
            </ul>
          )}

          {renderExpenseForm(
            expenseDraft,
            setExpenseDraft,
            () =>
              void submitExpense(purchasedAt, expenseDraft, () =>
                setExpenseDraft(emptyExpenseDraft()),
              ),
            'Agregar gasto',
          )}

          {visitExpenseTotalForDraftDate > 0 && (
            <p className="text-sm text-slate-600">
              Total gastos de esta fecha:{' '}
              <span className="font-semibold text-slate-900">
                {formatMoney(visitExpenseTotalForDraftDate)}
              </span>
            </p>
          )}
        </section>
      )}

      {tab === 'proveedores' && (
        <section className="space-y-4">
          <div className="pv-glass-card grid gap-4 p-6 md:grid-cols-2">
            <div className="flex gap-3 md:col-span-2">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xl"
                aria-hidden
              >
                🏪
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {editingSupplierId ? 'Editar proveedor' : 'Nuevo proveedor'}
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Nombre, teléfono y notas para usarlos al registrar compras.
                </p>
              </div>
            </div>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Nombre *</span>
              <input
                className="pv-input mt-1"
                placeholder="Ej. Central de Abastos, Don Pepe"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Teléfono</span>
              <input
                className="pv-input mt-1"
                value={supplierPhone}
                onChange={(e) => setSupplierPhone(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Notas</span>
              <input
                className="pv-input mt-1"
                value={supplierNotes}
                onChange={(e) => setSupplierNotes(e.target.value)}
              />
            </label>
            <div className="md:col-span-2">
              <button
                type="button"
                disabled={saving}
                onClick={saveSupplier}
                className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? 'Guardando…' : editingSupplierId ? 'Actualizar proveedor' : 'Guardar proveedor'}
              </button>
            </div>
          </div>

          <div className="pv-glass-card overflow-x-auto p-6">
            <div className="flex gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl"
                aria-hidden
              >
                🏪
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Proveedores</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Activa o edita los proveedores de la sucursal.
                </p>
              </div>
            </div>
            <table className="mt-4 w-full min-w-[480px] text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">Nombre</th>
                  <th className="pb-2 font-medium">Teléfono</th>
                  <th className="pb-2 font-medium">Notas</th>
                  <th className="pb-2 font-medium">Estado</th>
                  <th className="pb-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.id} className="border-t border-slate-100">
                    <td className="py-2 font-medium text-slate-900">{supplier.name}</td>
                    <td className="py-2 text-slate-600">{supplier.phone || '—'}</td>
                    <td className="py-2 text-slate-600">{supplier.notes || '—'}</td>
                    <td className="py-2 text-slate-600">
                      {supplier.is_active ? 'Activo' : 'Inactivo'}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-sm text-emerald-800 underline"
                          onClick={() => {
                            setEditingSupplierId(supplier.id);
                            setSupplierName(supplier.name);
                            setSupplierPhone(supplier.phone ?? '');
                            setSupplierNotes(supplier.notes ?? '');
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="text-sm text-slate-600 underline"
                          onClick={async () => {
                            await fetch('/api/suppliers', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                id: supplier.id,
                                name: supplier.name,
                                phone: supplier.phone,
                                notes: supplier.notes,
                                isActive: !supplier.is_active,
                              }),
                            });
                            await refreshPurchases();
                          }}
                        >
                          {supplier.is_active ? 'Inactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {suppliers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-slate-500">
                      Aún no hay proveedores. Agrega el primero arriba.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'comparar' && (
        <section className="pv-glass-card space-y-4 p-4 sm:p-6">
          <div className="flex gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xl"
              aria-hidden
            >
              ⚖️
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Comparar precios por proveedor
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Promedio, mínimo y último precio pagado. El proveedor con menor promedio queda
                primero dentro de cada producto.
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Producto</span>
              <select
                className="pv-input mt-1"
                value={compareProductId}
                onChange={(e) => setCompareProductId(e.target.value)}
              >
                <option value="">Todos</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.product.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Periodo</span>
              <select
                className="pv-input mt-1"
                value={compareDays}
                onChange={(e) => setCompareDays(Number(e.target.value))}
              >
                <option value={30}>Últimos 30 días</option>
                <option value={90}>Últimos 90 días</option>
                <option value={180}>Últimos 180 días</option>
                <option value={365}>Último año</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                disabled={compareLoading}
                onClick={loadComparison}
                className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {compareLoading ? 'Calculando…' : 'Comparar'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[720px] text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">Producto</th>
                  <th className="pb-2 font-medium">Proveedor</th>
                  <th className="pb-2 font-medium">Compras</th>
                  <th className="pb-2 font-medium">Promedio</th>
                  <th className="pb-2 font-medium">Mínimo</th>
                  <th className="pb-2 font-medium">Último</th>
                  <th className="pb-2 font-medium">Última fecha</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr
                    key={`${row.branch_product_id}-${row.supplier_id}`}
                    className="border-t border-slate-100"
                  >
                    <td className="py-2 font-medium text-slate-900">
                      {row.product_name}{' '}
                      <span className="font-normal text-slate-500">
                        / {PRODUCT_UNIT_LABELS[row.unit as ProductUnit] ?? row.unit}
                      </span>
                    </td>
                    <td className="py-2 text-slate-700">{row.supplier_name}</td>
                    <td className="py-2 text-slate-600">{row.purchase_count}</td>
                    <td className="py-2 font-medium text-slate-900">
                      {formatMoney(row.avg_unit_price)}
                    </td>
                    <td className="py-2 text-emerald-800">{formatMoney(row.min_unit_price)}</td>
                    <td className="py-2 text-slate-700">{formatMoney(row.last_unit_price)}</td>
                    <td className="py-2 text-slate-600">
                      {new Date(`${row.last_purchased_at}T12:00:00`).toLocaleDateString('es-MX')}
                    </td>
                  </tr>
                ))}
                {comparison.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-slate-500">
                      {compareLoading
                        ? 'Cargando…'
                        : 'Sin datos aún. Registra compras y pulsa Comparar.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'compra' && (
        <section className="pv-glass-card space-y-4 p-4 sm:p-6">
          <div className="flex gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl"
              aria-hidden
            >
              📋
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Historial de visitas / compras
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Consulta compras por mes o rango de fechas. Busca por proveedor, producto o notas.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="w-full min-w-0 sm:max-w-md">
                <input
                  type="search"
                  className="pv-input pv-search"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Buscar proveedor, producto o nota…"
                  aria-label="Buscar en historial de compras"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="pv-input w-auto min-w-[9rem]"
                  value={historyPeriod}
                  onChange={(e) => setHistoryPeriod(e.target.value as 'month' | 'custom')}
                >
                  <option value="month">Por mes</option>
                  <option value="custom">Rango</option>
                </select>
                {historyPeriod === 'month' ? (
                  <input
                    type="month"
                    className="pv-input w-auto"
                    value={historyMonth}
                    onChange={(e) => setHistoryMonth(e.target.value)}
                  />
                ) : (
                  <>
                    <input
                      type="date"
                      className="pv-input w-auto"
                      value={historyFrom}
                      onChange={(e) => setHistoryFrom(e.target.value)}
                      aria-label="Desde"
                    />
                    <input
                      type="date"
                      className="pv-input w-auto"
                      value={historyTo}
                      onChange={(e) => setHistoryTo(e.target.value)}
                      aria-label="Hasta"
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <div className="pv-glass-card flex gap-3 p-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xl"
                aria-hidden
              >
                📅
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Periodo
                </p>
                <p className="mt-0.5 text-sm font-bold text-slate-900">
                  {historyBounds.from === historyBounds.to
                    ? historyBounds.from
                    : `${historyBounds.from} → ${historyBounds.to}`}
                </p>
              </div>
            </div>
            <div className="pv-glass-card flex gap-3 p-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xl"
                aria-hidden
              >
                🛒
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Materia prima
                </p>
                <p className="mt-0.5 text-xl font-bold text-emerald-800">
                  {formatMoney(historyTotals.purchaseTotal)}
                </p>
                <p className="text-xs text-slate-500">
                  {historyTotals.purchaseCount} compra
                  {historyTotals.purchaseCount === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <div className="pv-glass-card flex gap-3 p-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl"
                aria-hidden
              >
                🧾
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Otros gastos
                </p>
                <p className="mt-0.5 text-xl font-bold text-amber-800">
                  {formatMoney(historyTotals.expenseTotal)}
                </p>
                <p className="text-xs text-slate-500">
                  {historyTotals.expenseCount} gasto
                  {historyTotals.expenseCount === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <div className="pv-glass-card flex gap-3 bg-slate-900 p-4 text-white">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl"
                aria-hidden
              >
                💰
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                  Total periodo
                </p>
                <p className="mt-0.5 text-xl font-bold text-white">
                  {formatMoney(historyTotals.total)}
                </p>
                <p className="text-xs text-slate-300">
                  {historyTotals.visitCount} visita
                  {historyTotals.visitCount === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {filteredVisits.map((group) => {
              const open = expandedDate === group.date;
              return (
                <article
                  key={group.date}
                  className="pv-glass-card overflow-hidden transition hover:shadow-md"
                >
                  <button
                    type="button"
                    className="flex w-full flex-col gap-3 px-4 py-3 text-left hover:bg-white/50 sm:flex-row sm:items-center sm:justify-between"
                    onClick={() => setExpandedDate(open ? null : group.date)}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold capitalize text-slate-900">
                        {new Date(`${group.date}T12:00:00`).toLocaleDateString('es-MX', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                      <p className="text-sm text-slate-500">
                        {group.purchaseCount} compra{group.purchaseCount === 1 ? '' : 's'}
                        {group.expenseCount > 0
                          ? ` · ${group.expenseCount} gasto${group.expenseCount === 1 ? '' : 's'}`
                          : ''}{' '}
                        · Central de abastos
                      </p>
                    </div>
                    <div className="grid w-full grid-cols-3 gap-1.5 sm:w-auto sm:min-w-[280px] sm:gap-2">
                      <div className="rounded-lg bg-white/80 px-1.5 py-1.5 text-center sm:px-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:text-[11px]">
                          <span className="sm:hidden">Materia</span>
                          <span className="hidden sm:inline">Materia prima</span>
                        </p>
                        <p className="text-xs font-semibold text-slate-900 sm:text-sm">
                          {formatMoney(group.purchaseTotal)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/80 px-1.5 py-1.5 text-center sm:px-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:text-[11px]">
                          <span className="sm:hidden">Gastos</span>
                          <span className="hidden sm:inline">Otros gastos</span>
                        </p>
                        <p className="text-xs font-semibold text-slate-900 sm:text-sm">
                          {formatMoney(group.expenseTotal)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-900 px-1.5 py-1.5 text-center text-white sm:px-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-300 sm:text-[11px]">
                          Total
                        </p>
                        <p className="text-xs font-semibold sm:text-sm">{formatMoney(group.total)}</p>
                      </div>
                    </div>
                  </button>

                  {open && (
                    <div className="space-y-3 border-t border-slate-200/70 px-4 py-3">
                      {group.purchases.map((purchase) => {
                        const editing = editDraft?.purchaseId === purchase.id;
                        return (
                          <div
                            key={purchase.id}
                            className="rounded-xl border border-slate-200 bg-white p-3"
                          >
                            {!editing ? (
                              <>
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium text-slate-900">
                                      {purchase.supplier?.name ?? 'Proveedor'}
                                    </p>
                                    {purchase.notes ? (
                                      <p className="text-sm text-slate-500">{purchase.notes}</p>
                                    ) : null}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-semibold text-slate-900">
                                      {formatMoney(Number(purchase.total_amount))}
                                    </p>
                                    <button
                                      type="button"
                                      disabled={saving}
                                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                                      onClick={() => startEditPurchase(purchase)}
                                    >
                                      Editar
                                    </button>
                                    <button
                                      type="button"
                                      disabled={saving}
                                      className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                      onClick={() => void deletePurchase(purchase)}
                                    >
                                      {deletingPurchaseId === purchase.id ? 'Eliminando…' : 'Eliminar'}
                                    </button>
                                  </div>
                                </div>
                                <ul className="mt-3 space-y-1 text-sm text-slate-700">
                                  {(purchase.items ?? []).map((item) => (
                                    <li key={item.id}>
                                      {item.branch_product?.product?.name ?? 'Producto'}
                                      {item.quality
                                        ? ` · ${PRODUCT_QUALITY_LABELS[item.quality] ?? item.quality}`
                                        : ''}{' '}
                                      —{' '}
                                      {item.piece_count != null && Number(item.piece_count) > 0
                                        ? `${Number(item.piece_count)} pza · `
                                        : ''}
                                      {Number(item.quantity)}{' '}
                                      {item.branch_product?.product?.unit
                                        ? PRODUCT_UNIT_LABELS[item.branch_product.product.unit]
                                        : ''}{' '}
                                      × {formatMoney(Number(item.unit_price))}
                                      <span className="text-slate-500">
                                        {' '}
                                        = {formatMoney(Number(item.line_total))}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            ) : (
                              <div className="space-y-3">
                                <div className="grid gap-3 md:grid-cols-3">
                                  <label className="block text-sm">
                                    <span className="font-medium text-slate-700">Proveedor</span>
                                    <select
                                      className="pv-input mt-1"
                                      value={editDraft.supplierId}
                                      onChange={(e) =>
                                        setEditDraft((d) =>
                                          d ? { ...d, supplierId: e.target.value } : d,
                                        )
                                      }
                                    >
                                      {suppliers.map((supplier) => (
                                        <option key={supplier.id} value={supplier.id}>
                                          {supplier.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="block text-sm">
                                    <span className="font-medium text-slate-700">Fecha</span>
                                    <input
                                      type="date"
                                      className="pv-input mt-1"
                                      value={editDraft.purchasedAt}
                                      onChange={(e) =>
                                        setEditDraft((d) =>
                                          d ? { ...d, purchasedAt: e.target.value } : d,
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="block text-sm">
                                    <span className="font-medium text-slate-700">Notas</span>
                                    <input
                                      className="pv-input mt-1"
                                      value={editDraft.notes}
                                      onChange={(e) =>
                                        setEditDraft((d) =>
                                          d ? { ...d, notes: e.target.value } : d,
                                        )
                                      }
                                    />
                                  </label>
                                </div>
                                {editDraft.items.map((item) => (
                                  <div
                                    key={item.id}
                                    className="grid gap-2 rounded-lg bg-slate-50 p-2 md:grid-cols-[1.6fr_0.7fr_0.7fr_0.7fr_0.7fr]"
                                  >
                                    <label className="block text-xs">
                                      Producto
                                      <ProductSearchSelect
                                        products={products}
                                        value={item.branchProductId}
                                        onChange={(id) => updateEditItemProduct(item.id, id)}
                                        placeholder="Buscar producto…"
                                      />
                                      {item.unitLabel ? (
                                        <span className="mt-1 block text-[11px] text-slate-500">
                                          Unidad: {item.unitLabel}
                                        </span>
                                      ) : null}
                                    </label>
                                    <label className="block text-xs">
                                      Calidad
                                      <select
                                        className="pv-input mt-1"
                                        value={item.quality}
                                        onChange={(e) =>
                                          updateEditItem(item.id, 'quality', e.target.value)
                                        }
                                      >
                                        {PRODUCT_QUALITIES.map((quality) => (
                                          <option key={quality} value={quality}>
                                            {PRODUCT_QUALITY_LABELS[quality]}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    {item.weighAtFulfillment ? (
                                      <label className="block text-xs">
                                        Piezas
                                        <DecimalInput
                                          className="pv-input mt-1"
                                          value={item.pieceCount}
                                          onChange={(value) =>
                                            updateEditItem(item.id, 'pieceCount', value)
                                          }
                                        />
                                      </label>
                                    ) : null}
                                    <label className="block text-xs">
                                      {item.weighAtFulfillment ? 'Kg' : 'Cantidad'}
                                      <DecimalInput
                                        className="pv-input mt-1"
                                        value={item.quantity}
                                        onChange={(value) =>
                                          updateEditItem(item.id, 'quantity', value)
                                        }
                                      />
                                    </label>
                                    <label className="block text-xs">
                                      P. unitario
                                      <DecimalInput
                                        className="pv-input mt-1"
                                        value={item.unitPrice}
                                        onChange={(value) =>
                                          updateEditItem(item.id, 'unitPrice', value)
                                        }
                                      />
                                    </label>
                                    <label className="block text-xs">
                                      Total
                                      <DecimalInput
                                        className="pv-input mt-1"
                                        value={item.lineTotal}
                                        onChange={(value) =>
                                          updateEditItem(item.id, 'lineTotal', value)
                                        }
                                      />
                                    </label>
                                  </div>
                                ))}
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={saveEditPurchase}
                                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                                  >
                                    {saving ? 'Guardando…' : 'Guardar cambios'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditDraft(null)}
                                    className="rounded-full px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-3">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="font-medium text-slate-900">Otros gastos de la visita</h3>
                            <p className="text-xs text-slate-600">
                              Gasolina, bolsas u otros egresos · total{' '}
                              {formatMoney(group.expenseTotal)}
                            </p>
                          </div>
                        </div>

                        <ul className="space-y-2">
                          {group.expenses.map((expense) => {
                            const editing = editExpenseDraft?.id === expense.id;
                            return (
                              <li
                                key={expense.id}
                                className="rounded-lg border border-slate-200 bg-white p-3"
                              >
                                {!editing ? (
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-medium text-slate-900">
                                        {expense.concept}
                                      </p>
                                      {expense.notes ? (
                                        <p className="text-xs text-slate-500">{expense.notes}</p>
                                      ) : null}
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <p className="text-sm font-semibold text-slate-900">
                                        {formatMoney(Number(expense.amount))}
                                      </p>
                                      <button
                                        type="button"
                                        className="text-sm font-medium text-emerald-800"
                                        onClick={() =>
                                          setEditExpenseDraft({
                                            id: expense.id,
                                            concept: expense.concept,
                                            amount: String(expense.amount),
                                            notes: expense.notes ?? '',
                                            expenseDate: expense.expense_date,
                                          })
                                        }
                                      >
                                        Editar
                                      </button>
                                      <button
                                        type="button"
                                        className="text-sm text-rose-700"
                                        onClick={() => void deleteExpense(expense.id)}
                                      >
                                        Eliminar
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_1fr]">
                                    <label className="block text-sm">
                                      <span className="font-medium text-slate-700">Concepto</span>
                                      <input
                                        className="pv-input mt-1"
                                        value={editExpenseDraft.concept}
                                        onChange={(e) =>
                                          setEditExpenseDraft((d) =>
                                            d ? { ...d, concept: e.target.value } : d,
                                          )
                                        }
                                      />
                                    </label>
                                    <label className="block text-sm">
                                      <span className="font-medium text-slate-700">Monto</span>
                                      <DecimalInput
                                        className="pv-input mt-1"
                                        value={editExpenseDraft.amount}
                                        onChange={(value) =>
                                          setEditExpenseDraft((d) =>
                                            d ? { ...d, amount: value } : d,
                                          )
                                        }
                                      />
                                    </label>
                                    <label className="block text-sm">
                                      <span className="font-medium text-slate-700">Notas</span>
                                      <input
                                        className="pv-input mt-1"
                                        value={editExpenseDraft.notes}
                                        onChange={(e) =>
                                          setEditExpenseDraft((d) =>
                                            d ? { ...d, notes: e.target.value } : d,
                                          )
                                        }
                                      />
                                    </label>
                                    <div className="flex flex-wrap gap-2 md:col-span-3">
                                      <button
                                        type="button"
                                        disabled={saving}
                                        onClick={() => void saveEditExpense()}
                                        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                                      >
                                        {saving ? 'Guardando…' : 'Guardar gasto'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditExpenseDraft(null)}
                                        className="rounded-full px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>

                        <div className="mt-3">
                          {renderExpenseForm(
                            historialExpenseDraft,
                            setHistorialExpenseDraft,
                            () =>
                              void submitExpense(group.date, historialExpenseDraft, () =>
                                setHistorialExpenseDraft(emptyExpenseDraft()),
                              ),
                            'Agregar gasto',
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
            {filteredVisits.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center">
                <p className="text-sm text-slate-500">
                  {historySearch.trim() || historyPeriod === 'custom'
                    ? 'No hay visitas que coincidan con la búsqueda o el periodo.'
                    : 'Todavía no hay visitas registradas en este mes.'}
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
