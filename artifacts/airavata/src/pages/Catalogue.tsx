import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, Plus, Search, Tag, Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';

type CatalogSettings = {
  metaCatalogId: string | null;
  catalogName: string | null;
  catalogConnected: boolean;
  catalogLastSyncedAt: string | null;
};

type MetaCatalog = {
  id: string;
  name?: string;
  vertical?: string;
};

type CatalogProduct = {
  id: string;
  name?: string;
  description?: string;
  price?: number;
  currency?: string;
  image_url?: string;
  retailer_id?: string;
  availability?: string;
};

type ProductForm = {
  name: string;
  description: string;
  price: string;
  currency: string;
  imageUrl: string;
  retailerId: string;
  availability: 'in stock' | 'out of stock';
};

const emptyProductForm: ProductForm = {
  name: '',
  description: '',
  price: '',
  currency: 'INR',
  imageUrl: '',
  retailerId: '',
  availability: 'in stock',
};

export default function Catalogue() {
  const queryClient = useQueryClient();
  const [showPicker, setShowPicker] = useState(false);
  const [catalogs, setCatalogs] = useState<MetaCatalog[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [showProductForm, setShowProductForm] = useState(false);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm);
  const [search, setSearch] = useState('');

  const { data: catalogSettings, isLoading: settingsLoading } = useQuery<{ settings: CatalogSettings }>({
    queryKey: ['catalog-settings'],
    queryFn: () => api.get('/integration/whatsapp/catalog-settings'),
  });

  const discoverCatalogs = useMutation({
    mutationFn: () => api.get<{ catalogs: MetaCatalog[] }>('/integration/whatsapp/catalogs'),
    onSuccess: ({ catalogs: found }) => {
      setCatalogs(found);
      setSelectedCatalogId(found.length === 1 ? found[0]!.id : '');
      setShowPicker(true);
      if (found.length === 0) toast.info('No Commerce Catalogs are available for this WhatsApp account');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to discover Commerce Catalogs'),
  });

  const connectCatalog = useMutation({
    mutationFn: (catalogId: string) =>
      api.post<{ settings: CatalogSettings }>('/integration/whatsapp/catalogs/connect', { catalogId }),
    onSuccess: ({ settings }) => {
      queryClient.setQueryData(['catalog-settings'], { settings });
      setShowPicker(false);
      toast.success(`Connected to ${settings.catalogName || 'Commerce Catalog'}`);
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to connect Commerce Catalog'),
  });

  const settings = catalogSettings?.settings;
  const { data: productData, isLoading: productsLoading } = useQuery<{ products: CatalogProduct[] }>({
    queryKey: ['catalog-products', settings?.metaCatalogId],
    queryFn: () => api.get('/integration/whatsapp/catalog/products'),
    enabled: Boolean(settings?.catalogConnected && settings.metaCatalogId),
  });

  const createProduct = useMutation({
    mutationFn: (payload: ProductForm) =>
      api.post<{ product: CatalogProduct }>('/integration/whatsapp/catalog/products', {
        ...payload,
        price: Number(payload.price),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      setShowProductForm(false);
      setProductForm(emptyProductForm);
      toast.success('Product added to your Meta catalog');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to add product'),
  });

  const products = productData?.products ?? [];
  const filteredProducts = products.filter((product) =>
    `${product.name ?? ''} ${product.retailer_id ?? ''}`.toLowerCase().includes(search.toLowerCase()),
  );

  const openProductForm = () => {
    if (!settings?.catalogConnected) {
      toast.info('Connect a catalog before adding products');
      return;
    }
    setProductForm(emptyProductForm);
    setShowProductForm(true);
  };

  const updateProductForm = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setProductForm((current) => ({ ...current, [key]: value }));
  };

  const handleProductSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createProduct.mutate(productForm);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catalogue</h1>
          <p className="text-sm text-gray-500">Manage products to share in WhatsApp chats</p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <button
            onClick={() => toast('Coming soon')}
            className="px-4 py-2 border bg-white rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Manage Visibility
          </button>
          <button
            onClick={openProductForm}
            disabled={!settings?.catalogConnected || settingsLoading}
            title={!settings?.catalogConnected ? 'Connect a catalog first' : undefined}
            className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${settings?.catalogConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
              {settings?.catalogConnected ? <Check className="w-5 h-5" /> : <ShoppingBag className="w-5 h-5" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Meta Commerce Catalog</p>
              {settingsLoading ? (
                <p className="text-sm text-gray-400 mt-1">Loading connection status…</p>
              ) : settings?.catalogConnected ? (
                <>
                  <p className="text-sm text-emerald-700 mt-1">Connected to {settings.catalogName || settings.metaCatalogId}</p>
                  {settings.catalogLastSyncedAt && (
                    <p className="text-xs text-gray-400 mt-1">Verified {new Date(settings.catalogLastSyncedAt).toLocaleString()}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500 mt-1">Not connected</p>
              )}
            </div>
          </div>
          <button
            onClick={() => discoverCatalogs.mutate()}
            disabled={discoverCatalogs.isPending || settingsLoading}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {discoverCatalogs.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {settings?.catalogConnected ? 'Change catalog' : 'Connect catalog'}
          </button>
        </div>
      </section>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none"
          />
        </div>
        <button className="px-4 py-2 border bg-white rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
          <Tag className="w-4 h-4" /> Categories
        </button>
      </div>

      {productsLoading ? (
        <div className="flex items-center justify-center py-24 gap-2 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading catalog products…</span>
        </div>
      ) : filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProducts.map((product) => (
            <article key={product.id} className="rounded-xl border bg-white overflow-hidden shadow-sm">
              <div className="aspect-[4/3] bg-gray-100">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name || 'Catalog product'} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <ShoppingBag className="w-10 h-10 opacity-40" />
                  </div>
                )}
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-gray-900 truncate">{product.name || 'Unnamed product'}</h3>
                  <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                    {product.currency || ''} {product.price ?? '—'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2">{product.description || 'No description'}</p>
                <div className="flex items-center justify-between gap-2 text-xs text-gray-400">
                  <span className="truncate">SKU: {product.retailer_id || '—'}</span>
                  <span className={product.availability === 'out of stock' ? 'text-red-600' : 'text-emerald-600'}>
                    {product.availability || 'Availability unknown'}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
            <ShoppingBag className="w-8 h-8 opacity-40" />
          </div>
          <div className="text-center">
            <p className="text-base font-medium text-gray-600">
              {settings?.catalogConnected ? (search ? 'No matching products' : 'No products yet') : 'Connect a catalog first'}
            </p>
            <p className="text-sm mt-1">
              {settings?.catalogConnected
                ? 'Add products to your Meta catalog so customers can browse and order via WhatsApp.'
                : 'Connect your Meta Commerce Catalog before adding products.'}
            </p>
          </div>
          {settings?.catalogConnected && !search && (
            <button
              onClick={openProductForm}
              className="mt-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add your first product
            </button>
          )}
        </div>
      )}

      {showPicker && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowPicker(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Choose a Commerce Catalog</h2>
                <p className="text-sm text-gray-500 mt-1">Select the catalog connected to this WhatsApp Business Account.</p>
              </div>
              <button onClick={() => setShowPicker(false)} className="text-gray-400 hover:text-gray-700" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {catalogs.map((catalog) => (
                <label key={catalog.id} className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer ${selectedCatalogId === catalog.id ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    name="catalog"
                    value={catalog.id}
                    checked={selectedCatalogId === catalog.id}
                    onChange={() => setSelectedCatalogId(catalog.id)}
                    className="accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-900">{catalog.name || 'Unnamed catalog'}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">ID: {catalog.id}{catalog.vertical ? ` · ${catalog.vertical}` : ''}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowPicker(false)} className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={() => selectedCatalogId && connectCatalog.mutate(selectedCatalogId)}
                disabled={!selectedCatalogId || connectCatalog.isPending}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {connectCatalog.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Verify and connect
              </button>
            </div>
          </div>
        </div>
      )}

      {showProductForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowProductForm(false)}>
          <form
            onSubmit={handleProductSubmit}
            onClick={(event) => event.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Add Product</h2>
                <p className="text-sm text-gray-500 mt-1">This product will be created in your connected Meta Commerce Catalog.</p>
              </div>
              <button type="button" onClick={() => setShowProductForm(false)} className="text-gray-400 hover:text-gray-700" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="sm:col-span-2 space-y-1.5">
                <span className="text-sm font-medium text-gray-700">Product name</span>
                <input required value={productForm.name} onChange={(event) => updateProductForm('name', event.target.value)} className="w-full border rounded-lg px-3 py-2.5 text-sm" placeholder="Premium Coffee Blend" />
              </label>
              <label className="sm:col-span-2 space-y-1.5">
                <span className="text-sm font-medium text-gray-700">Description</span>
                <textarea required rows={3} value={productForm.description} onChange={(event) => updateProductForm('description', event.target.value)} className="w-full border rounded-lg px-3 py-2.5 text-sm resize-none" placeholder="Describe this product" />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-gray-700">Price</span>
                <input required min="0.01" step="0.01" type="number" value={productForm.price} onChange={(event) => updateProductForm('price', event.target.value)} className="w-full border rounded-lg px-3 py-2.5 text-sm" placeholder="450" />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-gray-700">Currency</span>
                <input required maxLength={3} value={productForm.currency} onChange={(event) => updateProductForm('currency', event.target.value.toUpperCase())} className="w-full border rounded-lg px-3 py-2.5 text-sm uppercase" placeholder="INR" />
              </label>
              <label className="sm:col-span-2 space-y-1.5">
                <span className="text-sm font-medium text-gray-700">Image URL</span>
                <input required type="url" value={productForm.imageUrl} onChange={(event) => updateProductForm('imageUrl', event.target.value)} className="w-full border rounded-lg px-3 py-2.5 text-sm" placeholder="https://example.com/product.jpg" />
                <span className="block text-xs text-gray-400">Use a publicly reachable HTTPS image URL for Meta.</span>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-gray-700">Retailer ID / SKU</span>
                <input required value={productForm.retailerId} onChange={(event) => updateProductForm('retailerId', event.target.value)} className="w-full border rounded-lg px-3 py-2.5 text-sm" placeholder="COF-001" />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-gray-700">Availability</span>
                <select value={productForm.availability} onChange={(event) => updateProductForm('availability', event.target.value as ProductForm['availability'])} className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white">
                  <option value="in stock">In stock</option>
                  <option value="out of stock">Out of stock</option>
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowProductForm(false)} className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={createProduct.isPending} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                {createProduct.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Create product
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
