import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, Check, ChevronDown, Image as ImageIcon,
  LoaderCircle, Package, Plus, RefreshCw, Search, Settings2,
  Pencil, ShoppingBag, ShoppingCart, Tag, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getGetWhatsAppCatalogContextQueryKey,
  getGetWhatsAppCatalogSettingsQueryKey,
  getGetWhatsAppCatalogVisibilityQueryKey,
  getListWhatsAppCatalogProductsQueryKey,
  getListWhatsAppCatalogsQueryKey,
  useCreateWhatsAppCatalog,
  useCreateWhatsAppCatalogProduct,
  useConnectWhatsAppCatalog,
  useDeleteWhatsAppCatalogProduct,
  useGetWhatsAppCatalogContext,
  useGetWhatsAppCatalogSettings,
  useGetWhatsAppCatalogVisibility,
  useListWhatsAppCatalogProducts,
  useListWhatsAppCatalogs,
  useUpdateWhatsAppCatalogProduct,
  useUpdateWhatsAppCatalogVisibility,
} from '@workspace/api-client-react';
import type { WhatsAppCatalogProduct, WhatsAppCatalogProductInput } from '@workspace/api-client-react';

type ProductForm = {
  name: string;
  description: string;
  price: string;
  currency: string;
  imageUrl: string;
  retailerId: string;
  availability: 'in stock' | 'out of stock';
  productType: string;
};

const EMPTY_PRODUCT: ProductForm = {
  name: '', description: '', price: '', currency: 'INR', imageUrl: '',
  retailerId: '', availability: 'in stock', productType: '',
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const fieldClass = 'w-full rounded-md border border-[#dce2d8] bg-white px-3 py-2.5 text-sm text-[#344238] outline-none transition focus:border-[#78977d] focus:ring-2 focus:ring-[#5a8964]/15';

function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 border border-[#ead6d1] bg-[#fff8f5] px-4 py-3 text-sm text-[#974f41]">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">We couldn’t load this information</p>
        <p className="mt-1 break-words text-xs leading-relaxed">{message}</p>
      </div>
      {onRetry && <button onClick={onRetry} className="shrink-0 text-xs font-semibold underline underline-offset-2">Retry</button>}
    </div>
  );
}

export default function Catalogue() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [productDialog, setProductDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<WhatsAppCatalogProduct | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(EMPTY_PRODUCT);
  const [catalogDialog, setCatalogDialog] = useState<'connect' | 'create' | null>(null);
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [catalogName, setCatalogName] = useState('');
  const [selectedPageId, setSelectedPageId] = useState('');
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loadedProducts, setLoadedProducts] = useState<WhatsAppCatalogProduct[]>([]);

  const settingsQuery = useGetWhatsAppCatalogSettings();
  const settings = settingsQuery.data?.settings;
  const catalogsQuery = useListWhatsAppCatalogs();
  const contextQuery = useGetWhatsAppCatalogContext({
    query: { enabled: catalogDialog === 'create', queryKey: getGetWhatsAppCatalogContextQueryKey() },
  });
  const visibilityQuery = useGetWhatsAppCatalogVisibility({
    query: { enabled: Boolean(settings?.catalogConnected), queryKey: getGetWhatsAppCatalogVisibilityQueryKey() },
  });
  const productQuery = useListWhatsAppCatalogProducts(
    { limit: 30, ...(cursor ? { after: cursor } : {}) },
    { query: { enabled: Boolean(settings?.catalogConnected), queryKey: getListWhatsAppCatalogProductsQueryKey({ limit: 30, ...(cursor ? { after: cursor } : {}) }) } },
  );

  const createCatalog = useCreateWhatsAppCatalog();
  const connectCatalog = useConnectWhatsAppCatalog();
  const createProduct = useCreateWhatsAppCatalogProduct();
  const updateProduct = useUpdateWhatsAppCatalogProduct();
  const deleteProduct = useDeleteWhatsAppCatalogProduct();
  const updateVisibility = useUpdateWhatsAppCatalogVisibility();

  useEffect(() => {
    if (!productQuery.data) return;
    setLoadedProducts((current) => {
      if (!cursor) return productQuery.data.products;
      const existing = new Set(current.map((product) => product.id));
      return [...current, ...productQuery.data.products.filter((product) => !existing.has(product.id))];
    });
  }, [productQuery.data, cursor]);

  const refreshCatalogState = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetWhatsAppCatalogSettingsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListWhatsAppCatalogsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetWhatsAppCatalogVisibilityQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListWhatsAppCatalogProductsQueryKey() }),
    ]);
  };

  const openConnect = () => {
    setSelectedCatalogId('');
    setCatalogDialog('connect');
    catalogsQuery.refetch();
  };
  const openCreate = () => {
    setCatalogName('');
    setSelectedPageId('');
    setCatalogDialog('create');
    contextQuery.refetch();
  };
  const openProduct = (product?: WhatsAppCatalogProduct) => {
    if (product) {
      setEditingProduct(product);
      setProductForm({
        name: product.name,
        description: product.description,
        price: String(product.price),
        currency: product.currency,
        imageUrl: product.image_url ?? '',
        retailerId: product.retailer_id,
        availability: product.availability === 'out of stock' ? 'out of stock' : 'in stock',
        productType: product.product_type ?? '',
      });
    } else {
      setEditingProduct(null);
      setProductForm(EMPTY_PRODUCT);
    }
    setProductDialog(true);
  };

  const submitConnect = async () => {
    if (!selectedCatalogId) return;
    try {
      await connectCatalog.mutateAsync({ data: { catalogId: selectedCatalogId } });
      await refreshCatalogState();
      setLoadedProducts([]);
      setCursor(undefined);
      setCatalogDialog(null);
      toast.success('Commerce catalog connected');
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to connect this catalog'));
    }
  };

  const submitCreateCatalog = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPageId) return;
    try {
      await createCatalog.mutateAsync({ data: { name: catalogName.trim(), pageId: selectedPageId } });
      await refreshCatalogState();
      setLoadedProducts([]);
      setCursor(undefined);
      setCatalogDialog(null);
      toast.success('Catalog created and attached to WhatsApp');
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to create catalog'));
    }
  };

  const submitProduct = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: WhatsAppCatalogProductInput = {
      name: productForm.name.trim(),
      description: productForm.description.trim(),
      price: Number(productForm.price),
      currency: productForm.currency.trim().toUpperCase(),
      imageUrl: productForm.imageUrl.trim(),
      retailerId: productForm.retailerId.trim(),
      availability: productForm.availability,
      ...(productForm.productType.trim() ? { productType: productForm.productType.trim() } : {}),
    };
    try {
      if (editingProduct) {
        await updateProduct.mutateAsync({ productId: editingProduct.id, data: payload });
        toast.success('Product updated');
      } else {
        await createProduct.mutateAsync({ data: payload });
        toast.success('Product added to catalog');
      }
      setProductDialog(false);
      setEditingProduct(null);
      setProductForm(EMPTY_PRODUCT);
      setLoadedProducts([]);
      setCursor(undefined);
      await queryClient.invalidateQueries({ queryKey: getListWhatsAppCatalogProductsQueryKey() });
    } catch (error) {
      toast.error(errorMessage(error, editingProduct ? 'Unable to update product' : 'Unable to add product'));
    }
  };

  const removeProduct = async (product: WhatsAppCatalogProduct) => {
    if (!window.confirm(`Delete “${product.name}” from this catalog? This cannot be undone.`)) return;
    try {
      await deleteProduct.mutateAsync({ productId: product.id });
      setLoadedProducts((current) => current.filter((item) => item.id !== product.id));
      await queryClient.invalidateQueries({ queryKey: getListWhatsAppCatalogProductsQueryKey() });
      toast.success('Product deleted');
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to delete product'));
    }
  };

  const changeVisibility = async (field: 'isCatalogVisible' | 'isCartEnabled', value: boolean) => {
    if (!visibilityQuery.data) return;
    setVisibilityBusy(true);
    try {
      await updateVisibility.mutateAsync({
        data: { ...visibilityQuery.data, [field]: value },
      });
      await queryClient.invalidateQueries({ queryKey: getGetWhatsAppCatalogVisibilityQueryKey() });
      toast.success(field === 'isCatalogVisible'
        ? (value ? 'Storefront is now visible' : 'Storefront is hidden')
        : (value ? 'Cart is enabled' : 'Cart is disabled'));
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to update storefront settings'));
    } finally {
      setVisibilityBusy(false);
    }
  };

  const categories = useMemo(() => {
    const found = new Set(loadedProducts.map((product) => product.product_type?.trim()).filter((value): value is string => Boolean(value)));
    return [...found].sort((a, b) => a.localeCompare(b));
  }, [loadedProducts]);
  const visibleProducts = useMemo(() => loadedProducts.filter((product) => {
    const matchesSearch = `${product.name} ${product.retailer_id} ${product.description}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesCategory = category === 'all' || product.product_type === category;
    return matchesSearch && matchesCategory;
  }), [loadedProducts, search, category]);
  const isSavingProduct = createProduct.isPending || updateProduct.isPending;
  const createError = contextQuery.error ? errorMessage(contextQuery.error, 'Unable to access Meta business context.') : '';

  return (
    <main className="wa-pay min-h-[100dvh] bg-[#f5f7f1] px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-[1240px] space-y-6">
        <header className="flex flex-col gap-4 border-b border-[#dfe5db] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="wa-eyebrow">Commerce workspace / WhatsApp</p>
            <h1 className="wa-title mt-2 text-[28px] font-semibold tracking-[-0.045em] text-[#2d3b31] sm:text-[34px]">Catalogue</h1>
            <p className="mt-1.5 max-w-xl text-sm text-[#778178]">Keep the products your team shares in chats accurate and ready to buy.</p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <button onClick={openConnect} className="wa-button wa-button-quiet flex-1 sm:flex-none">
              {settings?.catalogConnected ? 'Change catalog' : 'Connect catalog'}
            </button>
            <button onClick={() => openProduct()} disabled={!settings?.catalogConnected} className="wa-button wa-button-dark flex-1 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none">
              <Plus className="h-4 w-4" /> Add product
            </button>
          </div>
        </header>

        {settingsQuery.isError && <ErrorNotice message={errorMessage(settingsQuery.error, 'Unable to check the connected catalog.')} onRetry={() => settingsQuery.refetch()} />}

        <section className="grid gap-4 lg:grid-cols-[1.35fr_.9fr]">
          <div className="border border-[#dfe5db] bg-white p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 gap-3.5">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center ${settings?.catalogConnected ? 'bg-[#edf5eb] text-[#4c8058]' : 'bg-[#f2f4ef] text-[#819083]'}`}>
                  {settingsQuery.isLoading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : settings?.catalogConnected ? <Check className="h-5 w-5" /> : <ShoppingBag className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-[#344238]">Meta Commerce catalog</h2>
                    <span className={`wa-small-tag ${settings?.catalogConnected ? 'wa-tag-good' : 'wa-tag-warn'}`}>{settingsQuery.isLoading ? 'Checking' : settings?.catalogConnected ? 'Connected' : 'Not connected'}</span>
                  </div>
                  {settingsQuery.isLoading ? <p className="mt-1.5 h-4 w-48 animate-pulse bg-[#eef1ea]" /> :
                    settings?.catalogConnected ? <>
                      <p className="mt-1.5 truncate text-sm text-[#657268]">{settings.catalogName || settings.metaCatalogId}</p>
                      <p className="mt-1 text-xs text-[#89938a]">{settings.catalogLastSyncedAt ? `Last synced ${new Date(settings.catalogLastSyncedAt).toLocaleString()}` : 'Sync time not available'}</p>
                    </> : <p className="mt-1.5 text-sm text-[#7d887e]">Connect an existing catalog or create one for this business.</p>}
                </div>
              </div>
              <button onClick={() => { catalogsQuery.refetch(); settingsQuery.refetch(); }} aria-label="Refresh catalog connection" className="wa-icon-button">
                <RefreshCw className={`h-4 w-4 ${catalogsQuery.isFetching ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="border border-[#dfe5db] bg-white p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-[#65826b]" />
              <h2 className="text-sm font-semibold text-[#344238]">Storefront settings</h2>
            </div>
            {settings?.catalogConnected ? visibilityQuery.isLoading ? (
              <div className="mt-4 space-y-3"><div className="h-9 animate-pulse bg-[#f0f2ed]" /><div className="h-9 animate-pulse bg-[#f0f2ed]" /></div>
            ) : visibilityQuery.isError ? (
              <div className="mt-3"><ErrorNotice message={errorMessage(visibilityQuery.error, 'Unable to load storefront settings.')} onRetry={() => visibilityQuery.refetch()} /></div>
            ) : visibilityQuery.data ? (
              <div className="mt-3 divide-y divide-[#edf0e9]">
                <SettingToggle
                  icon={<ShoppingBag className="h-4 w-4" />}
                  label="Catalog visible"
                  description="Customers can browse your products"
                  checked={visibilityQuery.data.isCatalogVisible}
                  disabled={visibilityBusy}
                  onChange={(checked) => changeVisibility('isCatalogVisible', checked)}
                />
                <SettingToggle
                  icon={<ShoppingCart className="h-4 w-4" />}
                  label="Cart enabled"
                  description="Customers can add items to a cart"
                  checked={visibilityQuery.data.isCartEnabled}
                  disabled={visibilityBusy}
                  onChange={(checked) => changeVisibility('isCartEnabled', checked)}
                />
              </div>
            ) : <p className="mt-3 text-xs text-[#818b81]">Storefront settings are not available.</p> : (
              <p className="mt-3 text-xs leading-relaxed text-[#818b81]">Connect a catalog to manage what customers can browse and purchase.</p>
            )}
          </div>
        </section>

        <section className="overflow-hidden border border-[#dfe5db] bg-white">
          <div className="flex flex-col gap-4 border-b border-[#e8ece4] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#344238]">Products</h2>
                {settings?.catalogConnected && !productQuery.isLoading && <span className="rounded-full bg-[#f0f4ed] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[#607764]">{loadedProducts.length}{productQuery.data?.hasMore ? '+' : ''}</span>}
              </div>
              <p className="mt-1 text-xs text-[#879187]">Catalog items your team can send in a conversation.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative min-w-0 sm:w-[250px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a958a]" />
                <input aria-label="Search products" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, SKU or details" className={`${fieldClass} pl-9 py-2`} />
              </label>
              <label className="relative sm:w-[170px]">
                <Tag className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#829084]" />
                <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)} className={`${fieldClass} appearance-none py-2 pl-9 pr-8`}>
                  <option value="all">All categories</option>
                  {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#829084]" />
              </label>
            </div>
          </div>

          {!settings?.catalogConnected ? (
            <div className="wa-empty-state">
              <div className="wa-empty-mark"><Package className="h-5 w-5" /></div>
              <h3>Connect your catalog to get started</h3>
              <p>Attach a catalog already available to your Meta business, or create one from an eligible business page.</p>
              <button onClick={openConnect} className="wa-button wa-button-dark mt-4">Connect catalog</button>
            </div>
          ) : productQuery.isLoading && loadedProducts.length === 0 ? (
            <div className="grid gap-px bg-[#edf0e9] sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => <div key={index} className="bg-white p-3"><div className="aspect-[1.42] animate-pulse bg-[#eff2ec]" /><div className="mt-3 h-4 w-2/3 animate-pulse bg-[#eff2ec]" /><div className="mt-2 h-3 w-1/3 animate-pulse bg-[#f3f5f0]" /></div>)}
            </div>
          ) : productQuery.isError && loadedProducts.length === 0 ? (
            <div className="p-4 sm:p-5"><ErrorNotice message={errorMessage(productQuery.error, 'Unable to load products from Meta.')} onRetry={() => productQuery.refetch()} /></div>
          ) : visibleProducts.length ? (
            <>
              <div className="grid gap-px bg-[#edf0e9] sm:grid-cols-2 lg:grid-cols-3">
                {visibleProducts.map((product) => (
                  <article key={product.id} className="group min-w-0 bg-white p-3.5 transition-colors hover:bg-[#fdfefb] sm:p-4">
                    <div className="relative aspect-[1.5] overflow-hidden bg-[#f0f3ed]">
                      {product.image_url ? <img src={product.image_url} alt={product.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" /> :
                        <div className="flex h-full items-center justify-center text-[#8b998c]"><ImageIcon className="h-8 w-8 stroke-[1.3]" /></div>}
                      <span className={`absolute left-2.5 top-2.5 wa-small-tag ${product.availability === 'out of stock' ? 'wa-tag-bad' : 'wa-tag-good'}`}>{product.availability}</span>
                      <div className="absolute right-2 top-2 flex gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                        <button onClick={() => openProduct(product)} aria-label={`Edit ${product.name}`} className="flex h-8 w-8 items-center justify-center border border-[#dfe5db] bg-white/95 text-[#5a6b5d] hover:bg-white"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => removeProduct(product)} aria-label={`Delete ${product.name}`} className="flex h-8 w-8 items-center justify-center border border-[#ead6d1] bg-white/95 text-[#a05445] hover:bg-[#fff8f5]"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-start justify-between gap-3 pt-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-[#344238]">{product.name}</h3>
                        <p className="mt-1 truncate text-[11px] text-[#879187]">{product.retailer_id}{product.product_type ? ` · ${product.product_type}` : ''}</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-[#344238]">{product.currency} {Number(product.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-8 text-xs leading-relaxed text-[#7d887e]">{product.description || 'No description provided.'}</p>
                  </article>
                ))}
              </div>
              {productQuery.isError && <div className="border-t border-[#e8ece4] p-4"><ErrorNotice message={errorMessage(productQuery.error, 'Unable to load the next product page.')} onRetry={() => productQuery.refetch()} /></div>}
              {productQuery.data?.hasMore && <div className="flex justify-center border-t border-[#e8ece4] p-4">
                <button onClick={() => productQuery.data?.nextCursor && setCursor(productQuery.data.nextCursor)} disabled={productQuery.isFetching || !productQuery.data.nextCursor} className="wa-button wa-button-quiet">
                  {productQuery.isFetching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null} Load more products
                </button>
              </div>}
            </>
          ) : (
            <div className="wa-empty-state">
              <div className="wa-empty-mark"><Package className="h-5 w-5" /></div>
              <h3>{loadedProducts.length === 0 ? 'No products in this catalog yet' : 'No matching products'}</h3>
              <p>{loadedProducts.length === 0 ? 'Add a product with the details customers need to make a decision.' : 'Try another search or category filter.'}</p>
              {loadedProducts.length === 0 && <button onClick={() => openProduct()} className="wa-button wa-button-dark mt-4"><Plus className="h-4 w-4" /> Add first product</button>}
            </div>
          )}
        </section>

        {catalogDialog === 'connect' && (
          <div className="wa-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setCatalogDialog(null)}>
            <section role="dialog" aria-modal="true" aria-labelledby="connect-title" className="wa-modal max-w-[520px]">
              <div className="flex items-start justify-between gap-4">
                <div><p className="wa-eyebrow">Meta connection</p><h2 id="connect-title" className="wa-title mt-1 text-xl font-semibold text-[#344238]">Connect an existing catalog</h2><p className="mt-1.5 text-xs leading-relaxed text-[#7b867c]">Choose a catalog available to your connected WhatsApp business.</p></div>
                <button type="button" onClick={() => catalogsQuery.refetch()} disabled={catalogsQuery.isFetching} aria-label="Refresh available catalogs" className="wa-icon-button ml-auto"><RefreshCw className={`h-4 w-4 ${catalogsQuery.isFetching ? 'animate-spin' : ''}`} /></button>
                <button onClick={() => setCatalogDialog(null)} aria-label="Close" className="wa-icon-button"><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-5 max-h-72 space-y-2 overflow-y-auto">
                {catalogsQuery.isLoading ? <div className="space-y-2">{[1, 2, 3].map((item) => <div key={item} className="h-[62px] animate-pulse bg-[#f0f2ed]" />)}</div> :
                  catalogsQuery.isError ? <ErrorNotice message={errorMessage(catalogsQuery.error, 'Meta did not return available catalogs. Check your account permissions and try again.')} onRetry={() => catalogsQuery.refetch()} /> :
                  catalogsQuery.data?.catalogs.length ? catalogsQuery.data.catalogs.map((catalog) => (
                    <label key={catalog.id} className={`flex cursor-pointer items-start gap-3 border p-3 transition-colors ${selectedCatalogId === catalog.id ? 'border-[#7ea486] bg-[#f3f8f1]' : 'border-[#e3e8df] hover:bg-[#fafbf8]'}`}>
                      <input type="radio" name="catalog-choice" value={catalog.id} checked={selectedCatalogId === catalog.id} onChange={() => setSelectedCatalogId(catalog.id)} className="mt-1 accent-[#4e855d]" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#3c4b40]">{catalog.name || 'Unnamed catalog'}</span><span className="mt-1 block text-[11px] text-[#879187]">ID {catalog.id}{catalog.vertical ? ` · ${catalog.vertical}` : ''}</span></span>
                    </label>
                  )) : <div className="wa-empty-inline"><ShoppingBag className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>No available catalogs</strong><p>There are no catalogs available to connect. Create one using an eligible business page instead.</p></div></div>}
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[#edf0e9] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <button onClick={openCreate} className="wa-text-button"><Plus className="h-3.5 w-3.5" /> Create a new catalog</button>
                <div className="flex justify-end gap-2"><button onClick={() => setCatalogDialog(null)} className="wa-button wa-button-quiet">Cancel</button><button onClick={submitConnect} disabled={!selectedCatalogId || connectCatalog.isPending} className="wa-button wa-button-dark disabled:opacity-50">{connectCatalog.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />} Connect catalog</button></div>
              </div>
            </section>
          </div>
        )}

        {catalogDialog === 'create' && (
          <div className="wa-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setCatalogDialog(null)}>
            <form onSubmit={submitCreateCatalog} role="dialog" aria-modal="true" aria-labelledby="create-catalog-title" className="wa-modal max-w-[520px]">
              <div className="flex items-start justify-between gap-4"><div><p className="wa-eyebrow">Meta business setup</p><h2 id="create-catalog-title" className="wa-title mt-1 text-xl font-semibold text-[#344238]">Create a catalog</h2><p className="mt-1.5 text-xs leading-relaxed text-[#7b867c]">Airavata creates the catalog in your Meta business and attaches it to WhatsApp.</p></div><button type="button" onClick={() => setCatalogDialog(null)} aria-label="Close" className="wa-icon-button"><X className="h-4 w-4" /></button></div>
              {contextQuery.isLoading ? <div className="mt-5 space-y-3"><div className="h-10 animate-pulse bg-[#f0f2ed]" /><div className="h-10 animate-pulse bg-[#f0f2ed]" /></div> :
                contextQuery.isError ? <div className="mt-5"><ErrorNotice message={createError || 'Unable to load eligible Meta business pages. Check business permissions.'} onRetry={() => contextQuery.refetch()} /></div> :
                contextQuery.data ? <div className="mt-5 space-y-4">
                  <div className="border border-[#e5e9e1] bg-[#f8faf6] px-3 py-2.5"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#879187]">Connected business</p><p className="mt-1 text-sm font-medium text-[#3c4b40]">{contextQuery.data.businessName || 'Meta Business'}</p><p className="mt-0.5 text-[10px] text-[#929b92]">Business ID {contextQuery.data.businessId}</p></div>
                  <label className="wa-field"><span>Catalog name <b>*</b></span><input required maxLength={100} value={catalogName} onChange={(event) => setCatalogName(event.target.value)} placeholder="e.g. Main store" /></label>
                  <label className="wa-field"><span>Eligible Facebook page <b>*</b></span><select required value={selectedPageId} onChange={(event) => setSelectedPageId(event.target.value)}><option value="">Select a page</option>{contextQuery.data.pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}</select>
                    {!contextQuery.data.pages.length && <small>No eligible pages were returned for this business. Confirm that the connected Meta account can manage a page.</small>}
                  </label>
                </div> : null}
              <div className="mt-5 flex justify-end gap-2 border-t border-[#edf0e9] pt-4"><button type="button" onClick={() => setCatalogDialog('connect')} className="wa-button wa-button-quiet">Back</button><button type="submit" disabled={!catalogName.trim() || !selectedPageId || createCatalog.isPending || !contextQuery.data?.pages.length} className="wa-button wa-button-dark disabled:opacity-50">{createCatalog.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />} Create and attach</button></div>
            </form>
          </div>
        )}

        {productDialog && (
          <div className="wa-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setProductDialog(false)}>
            <form onSubmit={submitProduct} role="dialog" aria-modal="true" aria-labelledby="product-dialog-title" className="wa-modal max-h-[92dvh] max-w-[620px] overflow-y-auto">
              <div className="flex items-start justify-between gap-4"><div><p className="wa-eyebrow">{editingProduct ? 'Update catalog item' : 'Catalog item'}</p><h2 id="product-dialog-title" className="wa-title mt-1 text-xl font-semibold text-[#344238]">{editingProduct ? 'Edit product' : 'Add product'}</h2><p className="mt-1.5 text-xs leading-relaxed text-[#7b867c]">Product changes are sent to your connected Meta Commerce catalog.</p></div><button type="button" onClick={() => setProductDialog(false)} aria-label="Close" className="wa-icon-button"><X className="h-4 w-4" /></button></div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="wa-field sm:col-span-2"><span>Product name <b>*</b></span><input required maxLength={200} value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} placeholder="Everyday canvas tote" /></label>
                <label className="wa-field sm:col-span-2"><span>Description <b>*</b></span><textarea required maxLength={5000} rows={3} value={productForm.description} onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))} placeholder="A concise description customers can read in chat." /></label>
                <label className="wa-field"><span>Price <b>*</b></span><input required type="number" min="0.01" step="0.01" value={productForm.price} onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))} placeholder="850.00" /></label>
                <label className="wa-field"><span>Currency <b>*</b></span><input required pattern="[A-Za-z]{3}" maxLength={3} value={productForm.currency} onChange={(event) => setProductForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} placeholder="INR" /></label>
                <label className="wa-field sm:col-span-2"><span>Product image URL <b>*</b></span><input required type="url" pattern="https://.*" value={productForm.imageUrl} onChange={(event) => setProductForm((current) => ({ ...current, imageUrl: event.target.value }))} placeholder="https://store.example/product.jpg" /><small>Use an HTTPS image address that Meta can reach.</small></label>
                <label className="wa-field"><span>Retailer ID / SKU <b>*</b></span><input required maxLength={100} value={productForm.retailerId} onChange={(event) => setProductForm((current) => ({ ...current, retailerId: event.target.value }))} placeholder="BAG-024" /></label>
                <label className="wa-field"><span>Availability <b>*</b></span><select value={productForm.availability} onChange={(event) => setProductForm((current) => ({ ...current, availability: event.target.value as ProductForm['availability'] }))}><option value="in stock">In stock</option><option value="out of stock">Out of stock</option></select></label>
                <label className="wa-field sm:col-span-2"><span>Category</span><input maxLength={200} value={productForm.productType} onChange={(event) => setProductForm((current) => ({ ...current, productType: event.target.value }))} placeholder="Accessories" /><small>Used to organize and filter products in this catalogue.</small></label>
              </div>
              <div className="mt-5 flex justify-end gap-2 border-t border-[#edf0e9] pt-4"><button type="button" onClick={() => setProductDialog(false)} className="wa-button wa-button-quiet">Cancel</button><button type="submit" disabled={isSavingProduct || deleteProduct.isPending} className="wa-button wa-button-dark disabled:opacity-50">{isSavingProduct && <LoaderCircle className="h-4 w-4 animate-spin" />}{editingProduct ? 'Save changes' : 'Add product'}</button></div>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}

function SettingToggle({
  icon, label, description, checked, disabled, onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-1 last:pb-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="text-[#718575]">{icon}</span>
        <div className="min-w-0"><p className="text-xs font-semibold text-[#455347]">{label}</p><p className="mt-0.5 text-[10px] text-[#89938a]">{description}</p></div>
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-[22px] w-[39px] shrink-0 rounded-full transition-colors disabled:opacity-55 ${checked ? 'bg-[#5b8b66]' : 'bg-[#c8d0c6]'}`}>
        <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[20px]' : 'translate-x-[3px]'}`} />
      </button>
    </div>
  );
}