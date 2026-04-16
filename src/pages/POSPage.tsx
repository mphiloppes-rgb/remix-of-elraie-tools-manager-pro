import { useState, useMemo } from "react";
import { Search, Plus, Minus, Trash2, Printer, Check, ShoppingCart, AlertTriangle, Save, Percent, Tag, X } from "lucide-react";
import { getProducts, getCustomers, addInvoice, type InvoiceItem } from "@/lib/store";
import { useStoreRefresh } from "@/hooks/use-store-refresh";
import { toast } from "@/hooks/use-toast";
import InvoicePrint from "@/components/InvoicePrint";

type DiscountType = 'amount' | 'percent';

interface CartItem extends InvoiceItem {
  discountType?: DiscountType;
  discountValue?: number;
}

export default function POSPage() {
  const { refreshKey, refresh } = useStoreRefresh();
  const products = useMemo(() => getProducts(), [refreshKey]);
  const customers = useMemo(() => getCustomers(), [refreshKey]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [paid, setPaid] = useState<number>(0);
  const [showPrint, setShowPrint] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<any>(null);
  const [showNoCustomerDialog, setShowNoCustomerDialog] = useState(false);
  const [showConfirmSale, setShowConfirmSale] = useState(false);
  const [pendingAction, setPendingAction] = useState<'save' | 'print'>('print');

  // Invoice-level discount
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<DiscountType>('amount');
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState<number>(0);

  // Item discount dialog
  const [discountItemId, setDiscountItemId] = useState<string | null>(null);
  const [tempDiscountType, setTempDiscountType] = useState<DiscountType>('amount');
  const [tempDiscountValue, setTempDiscountValue] = useState<number>(0);

  const filtered = useMemo(() => {
    if (!search.trim()) return products.slice(0, 20);
    const s = search.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(s) || (p.code && p.code.toLowerCase().includes(s))
    );
  }, [search, products]);

  // Helpers to compute item discount in EGP
  const calcItemDiscountAmount = (item: CartItem) => {
    if (!item.discountValue) return 0;
    const gross = item.quantity * item.unitPrice;
    if (item.discountType === 'percent') return Math.min(gross, (gross * item.discountValue) / 100);
    return Math.min(gross, item.discountValue);
  };

  const subtotal = cart.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const itemsDiscountTotal = cart.reduce((s, i) => s + calcItemDiscountAmount(i), 0);
  const afterItemsDiscount = subtotal - itemsDiscountTotal;
  const invoiceDiscountAmount = invoiceDiscountType === 'percent'
    ? Math.min(afterItemsDiscount, (afterItemsDiscount * (invoiceDiscountValue || 0)) / 100)
    : Math.min(afterItemsDiscount, invoiceDiscountValue || 0);
  const total = Math.max(0, afterItemsDiscount - invoiceDiscountAmount);
  const remaining = Math.max(0, total - paid);

  const getAvailableStock = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return 0;
    const inCart = cart.find(i => i.productId === productId);
    return product.quantity - (inCart ? inCart.quantity : 0);
  };

  const addToCart = (product: typeof products[0]) => {
    if (product.quantity <= 0) {
      toast({ title: "⚠️ نفد المخزون", description: `${product.name} غير متاح حالياً`, variant: "destructive" });
      return;
    }
    const existing = cart.find((i) => i.productId === product.id);
    const currentQty = existing ? existing.quantity : 0;
    if (currentQty >= product.quantity) {
      toast({ title: "⚠️ لا يمكن", description: `الكمية المتاحة في المخزون: ${product.quantity}`, variant: "destructive" });
      return;
    }
    if (existing) {
      setCart(cart.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.unitPrice } : i));
    } else {
      setCart([...cart, { productId: product.id, productName: product.name, quantity: 1, unitPrice: product.sellPrice, costPrice: product.costPrice, total: product.sellPrice }]);
    }
  };

  const updateQty = (productId: string, delta: number) => {
    if (delta > 0) {
      const available = getAvailableStock(productId);
      if (available <= 0) {
        const product = products.find(p => p.id === productId);
        toast({ title: "⚠️ لا يمكن", description: `الكمية المتاحة في المخزون: ${product?.quantity || 0}`, variant: "destructive" });
        return;
      }
    }
    setCart(cart.map((i) => {
      if (i.productId !== productId) return i;
      const newQty = i.quantity + delta;
      if (newQty <= 0) return null;
      return { ...i, quantity: newQty, total: newQty * i.unitPrice };
    }).filter(Boolean) as CartItem[]);
  };

  const removeFromCart = (productId: string) => setCart(cart.filter((i) => i.productId !== productId));

  const openItemDiscount = (item: CartItem) => {
    setDiscountItemId(item.productId);
    setTempDiscountType(item.discountType || 'amount');
    setTempDiscountValue(item.discountValue || 0);
  };

  const applyItemDiscount = () => {
    if (!discountItemId) return;
    setCart(cart.map(i => i.productId === discountItemId
      ? { ...i, discountType: tempDiscountType, discountValue: Math.max(0, tempDiscountValue || 0) }
      : i
    ));
    setDiscountItemId(null);
    setTempDiscountValue(0);
  };

  const clearItemDiscount = () => {
    if (!discountItemId) return;
    setCart(cart.map(i => i.productId === discountItemId
      ? { ...i, discountType: undefined, discountValue: undefined }
      : i
    ));
    setDiscountItemId(null);
    setTempDiscountValue(0);
  };

  const attemptAction = (action: 'save' | 'print') => {
    if (cart.length === 0) { toast({ title: "خطأ", description: "الفاتورة فارغة", variant: "destructive" }); return; }
    setPendingAction(action);
    if (!customerId) {
      setShowNoCustomerDialog(true);
      return;
    }
    setShowConfirmSale(true);
  };

  const confirmAndSell = () => {
    setShowConfirmSale(false);
    setShowNoCustomerDialog(false);
    const customer = customers.find((c) => c.id === customerId);

    // Build items with computed discount-applied totals
    const finalItems: InvoiceItem[] = cart.map(i => {
      const gross = i.quantity * i.unitPrice;
      const disc = calcItemDiscountAmount(i);
      return {
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        costPrice: i.costPrice,
        total: gross - disc,
        discount: disc > 0 ? disc : undefined,
        discountType: i.discountType,
        discountValue: i.discountValue,
      };
    });

    const invoice = addInvoice({
      items: finalItems,
      subtotal,
      itemsDiscountTotal: itemsDiscountTotal > 0 ? itemsDiscountTotal : undefined,
      invoiceDiscount: invoiceDiscountAmount > 0 ? invoiceDiscountAmount : undefined,
      invoiceDiscountType: invoiceDiscountValue > 0 ? invoiceDiscountType : undefined,
      invoiceDiscountValue: invoiceDiscountValue > 0 ? invoiceDiscountValue : undefined,
      total,
      paid,
      remaining,
      customerId: customerId || undefined,
      customerName: customer?.name,
      status: pendingAction === 'print' ? 'completed' : 'saved',
    });
    setLastInvoice(invoice);
    toast({
      title: pendingAction === 'print' ? "تم البيع ✅" : "تم الحفظ 💾",
      description: `فاتورة رقم ${invoice.invoiceNumber}`,
    });

    if (pendingAction === 'print') {
      setShowPrint(true);
      setTimeout(() => { window.print(); setShowPrint(false); }, 300);
    }

    setCart([]); setPaid(0); setCustomerId(""); setInvoiceDiscountValue(0);
    refresh();
  };

  const proceedWithoutCustomer = () => {
    setShowNoCustomerDialog(false);
    setShowConfirmSale(true);
  };

  const invoiceForPrint = lastInvoice || {
    items: cart.map(i => ({ ...i, total: i.quantity * i.unitPrice - calcItemDiscountAmount(i) })),
    total, paid, remaining,
    customerName: customers.find((c) => c.id === customerId)?.name,
    createdAt: new Date().toISOString(),
    id: "draft",
    invoiceNumber: "------"
  };

  const editingItem = cart.find(i => i.productId === discountItemId);

  return (
    <>
      {showPrint && <InvoicePrint invoice={invoiceForPrint} />}

      {/* Item Discount Dialog */}
      {discountItemId && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm animate-fade-in-up no-print">
          <div className="glass-modal rounded-2xl p-6 w-full max-w-sm mx-4 animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-lg flex items-center gap-2"><Tag size={20} className="text-primary" /> خصم على المنتج</h3>
              <button onClick={() => setDiscountItemId(null)} className="p-1 rounded-lg hover:bg-muted"><X size={18} /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-4 truncate">{editingItem.productName}</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button onClick={() => setTempDiscountType('amount')} className={`py-2 rounded-xl font-bold text-sm transition-all ${tempDiscountType === 'amount' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>مبلغ (ج.م)</button>
              <button onClick={() => setTempDiscountType('percent')} className={`py-2 rounded-xl font-bold text-sm transition-all ${tempDiscountType === 'percent' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>نسبة (%)</button>
            </div>
            <input
              type="number"
              value={tempDiscountValue || ''}
              onChange={(e) => setTempDiscountValue(Number(e.target.value))}
              placeholder={tempDiscountType === 'percent' ? 'مثال: 10' : 'مثال: 50'}
              className="input-field w-full mb-4"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-3">
              <button onClick={applyItemDiscount} className="btn-primary py-3 text-sm">تطبيق</button>
              <button onClick={clearItemDiscount} className="bg-destructive/10 text-destructive py-3 rounded-xl font-extrabold text-sm hover:bg-destructive/20 transition-all">حذف الخصم</button>
            </div>
          </div>
        </div>
      )}

      {/* No Customer Dialog */}
      {showNoCustomerDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm animate-fade-in-up no-print">
          <div className="glass-modal rounded-2xl p-6 w-full max-w-sm mx-4 animate-scale-in text-center">
            <div className="w-14 h-14 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="text-amber-500" size={28} />
            </div>
            <h3 className="font-extrabold text-lg mb-2">لم يتم اختيار عميل</h3>
            <p className="text-muted-foreground text-sm mb-6">هل تريد المتابعة بدون تحديد عميل؟</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={proceedWithoutCustomer} className="btn-primary py-3 text-sm">بدون عميل</button>
              <button onClick={() => setShowNoCustomerDialog(false)} className="bg-secondary text-secondary-foreground py-3 rounded-xl font-extrabold text-sm hover:opacity-90 transition-all">اختيار عميل</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Sale Dialog */}
      {showConfirmSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm animate-fade-in-up no-print">
          <div className="glass-modal rounded-2xl p-6 w-full max-w-sm mx-4 animate-scale-in text-center">
            <h3 className="font-extrabold text-lg mb-2">{pendingAction === 'print' ? 'تأكيد البيع والطباعة' : 'تأكيد حفظ الفاتورة'}</h3>
            <div className="bg-accent/50 rounded-xl p-4 mb-4 space-y-2 text-sm">
              <div className="flex justify-between"><span>عدد الأصناف</span><span className="font-extrabold">{cart.length}</span></div>
              <div className="flex justify-between"><span>الإجمالي قبل الخصم</span><span className="font-extrabold">{subtotal.toLocaleString()} ج.م</span></div>
              {itemsDiscountTotal > 0 && <div className="flex justify-between text-amber-500"><span>خصم الأصناف</span><span className="font-extrabold">- {itemsDiscountTotal.toLocaleString()} ج.م</span></div>}
              {invoiceDiscountAmount > 0 && <div className="flex justify-between text-amber-500"><span>خصم الفاتورة</span><span className="font-extrabold">- {invoiceDiscountAmount.toLocaleString()} ج.م</span></div>}
              <div className="flex justify-between border-t border-border/50 pt-2"><span>الإجمالي النهائي</span><span className="font-extrabold text-primary">{total.toLocaleString()} ج.م</span></div>
              <div className="flex justify-between"><span>المدفوع</span><span className="font-extrabold text-emerald-400">{paid.toLocaleString()} ج.م</span></div>
              {remaining > 0 && <div className="flex justify-between"><span>المتبقي</span><span className="font-extrabold text-destructive">{remaining.toLocaleString()} ج.م</span></div>}
              {customerId && <div className="flex justify-between"><span>العميل</span><span className="font-extrabold">{customers.find(c => c.id === customerId)?.name}</span></div>}
              {!customerId && <div className="flex justify-between"><span>العميل</span><span className="text-muted-foreground">بدون عميل</span></div>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={confirmAndSell} className="btn-primary py-3 text-sm">
                {pendingAction === 'print' ? <><Printer size={16} /> طباعة</> : <><Save size={16} /> حفظ</>}
              </button>
              <button onClick={() => setShowConfirmSale(false)} className="bg-secondary text-secondary-foreground py-3 rounded-xl font-extrabold text-sm hover:opacity-90 transition-all">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      <div className="no-print">
        <h1 className="page-header">نقطة البيع</h1>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6">
          {/* Products search */}
          <div className="lg:col-span-3 space-y-4 animate-fade-in-up order-2 lg:order-1">
            <div className="relative">
              <Search className="absolute right-3 top-3 text-muted-foreground" size={18} />
              <input type="text" placeholder="ابحث بالاسم أو الكود..." value={search} onChange={(e) => setSearch(e.target.value)} className="input-field w-full pr-10" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3 max-h-[50vh] sm:max-h-[60vh] overflow-y-auto">
              {filtered.map((p, idx) => (
                <button key={p.id} onClick={() => addToCart(p)} disabled={p.quantity <= 0} className={`stat-card text-right cursor-pointer animate-fade-in-up ${p.quantity <= 0 ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary'}`} style={{ animationDelay: `${idx * 0.03}s` }}>
                  <p className="font-extrabold text-sm truncate">{p.name}</p>
                  {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
                  <p className="text-primary font-extrabold mt-2">{p.sellPrice.toLocaleString()} ج.م</p>
                  <p className={`text-xs ${p.quantity <= 0 ? 'text-destructive font-extrabold' : 'text-muted-foreground'}`}>
                    المخزون: {p.quantity} {p.quantity <= 0 && '(نفد)'}
                  </p>
                </button>
              ))}
              {filtered.length === 0 && <p className="col-span-full text-center text-muted-foreground py-8">لا توجد منتجات</p>}
            </div>
          </div>

          {/* Cart */}
          <div className="lg:col-span-2 animate-slide-in order-1 lg:order-2">
            <div className="stat-card sticky top-6">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingCart className="text-primary" size={22} />
                <h3 className="font-extrabold text-lg">الفاتورة</h3>
              </div>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="input-field w-full mb-4">
                <option value="">بدون عميل</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                {cart.map((item) => {
                  const itemDisc = calcItemDiscountAmount(item);
                  const itemFinal = item.quantity * item.unitPrice - itemDisc;
                  return (
                    <div key={item.productId} className="p-3 bg-accent/50 rounded-xl transition-all duration-200 hover:bg-accent">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{item.productName}</p>
                          <p className="text-xs text-muted-foreground">{item.unitPrice.toLocaleString()} ج.م</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => updateQty(item.productId, -1)} className="p-1.5 rounded-lg bg-muted hover:bg-border transition-colors"><Minus size={14} /></button>
                          <span className="w-7 text-center font-extrabold text-sm">{item.quantity}</span>
                          <button onClick={() => updateQty(item.productId, 1)} className="p-1.5 rounded-lg bg-muted hover:bg-border transition-colors"><Plus size={14} /></button>
                          <button onClick={() => openItemDiscount(item)} className={`p-1.5 rounded-lg transition-colors ${itemDisc > 0 ? 'bg-amber-500/20 text-amber-600' : 'text-muted-foreground hover:bg-muted'}`} title="خصم على المنتج"><Tag size={14} /></button>
                          <button onClick={() => removeFromCart(item.productId)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/30">
                        {itemDisc > 0 ? (
                          <span className="text-xs text-amber-600 font-bold">خصم: {itemDisc.toLocaleString()} ج.م</span>
                        ) : <span />}
                        <span className="font-extrabold text-sm">{itemFinal.toLocaleString()} ج.م</span>
                      </div>
                    </div>
                  );
                })}
                {cart.length === 0 && <p className="text-center text-muted-foreground py-6">اضف منتجات للفاتورة</p>}
              </div>

              <div className="border-t border-border/50 pt-4 space-y-3">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">الإجمالي قبل الخصم</span><span className="font-bold">{subtotal.toLocaleString()} ج.م</span></div>
                {itemsDiscountTotal > 0 && <div className="flex justify-between text-sm text-amber-600"><span>خصم الأصناف</span><span className="font-bold">- {itemsDiscountTotal.toLocaleString()} ج.م</span></div>}

                {/* Invoice-level discount */}
                <div className="flex items-center gap-2 bg-muted/50 rounded-xl p-2">
                  <Percent size={16} className="text-muted-foreground" />
                  <span className="text-xs font-bold text-muted-foreground min-w-[55px]">خصم الفاتورة</span>
                  <input
                    type="number"
                    value={invoiceDiscountValue || ''}
                    onChange={(e) => setInvoiceDiscountValue(Number(e.target.value))}
                    placeholder="0"
                    className="input-field flex-1 py-1.5 text-sm"
                  />
                  <select
                    value={invoiceDiscountType}
                    onChange={(e) => setInvoiceDiscountType(e.target.value as DiscountType)}
                    className="input-field py-1.5 text-xs w-20"
                  >
                    <option value="amount">ج.م</option>
                    <option value="percent">%</option>
                  </select>
                </div>
                {invoiceDiscountAmount > 0 && <div className="flex justify-between text-xs text-amber-600"><span>قيمة خصم الفاتورة</span><span className="font-bold">- {invoiceDiscountAmount.toLocaleString()} ج.م</span></div>}

                <div className="flex justify-between text-lg font-extrabold border-t border-border/50 pt-2"><span>الإجمالي</span><span className="text-primary">{total.toLocaleString()} ج.م</span></div>
                <div className="flex items-center gap-3"><label className="text-sm text-muted-foreground min-w-[60px] font-bold">المدفوع</label><input type="number" value={paid || ""} onChange={(e) => setPaid(Number(e.target.value))} className="input-field flex-1" placeholder="0" /></div>
                <div className="flex justify-between font-extrabold text-destructive"><span>المتبقي</span><span>{remaining.toLocaleString()} ج.م</span></div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <button onClick={() => attemptAction('print')} className="btn-primary py-3"><Printer size={18} /> بيع وطباعة</button>
                <button onClick={() => attemptAction('save')} className="flex items-center justify-center gap-2 bg-emerald-500/90 text-white py-3 rounded-xl font-extrabold hover:bg-emerald-500 transition-all duration-200"><Save size={18} /> حفظ فقط</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
