import { getToken } from './api';

export type MarketplaceCategory = 'hosting' | 'tools' | 'customization' | 'extensions';
export type MarketplaceDelivery = 'hosted_service' | 'open_source_extension' | 'commercial_module';
export type MarketplaceStatus = 'draft' | 'coming_soon' | 'available' | 'archived';
export type MarketplacePricing = 'free' | 'quote' | 'one_time' | 'monthly' | 'yearly';

export type MarketplaceProduct = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  category: MarketplaceCategory;
  delivery: MarketplaceDelivery;
  status: MarketplaceStatus;
  pricing: MarketplacePricing;
  price_cents: number | null;
  currency: 'EUR' | 'RON' | 'USD';
  features: string[];
  featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type MarketplaceProductInput = Omit<MarketplaceProduct, 'id' | 'created_at' | 'updated_at'>;

export type MarketplaceSettings = {
  title: string;
  subtitle: string;
  contact_note: string;
  requests_enabled: boolean;
};

export type MarketplaceRequest = {
  id: number;
  product_id: string;
  user_id: number;
  product_name: string;
  user_nick?: string;
  message: string;
  status: 'pending' | 'approved' | 'declined';
  response: string;
  created_at: string;
  updated_at: string;
};

export type MarketplaceEntitlement = {
  id: number;
  product_id: string;
  user_id: number;
  product_name: string;
  user_nick?: string;
  status: 'active' | 'revoked';
  expires_at: string | null;
  note?: string;
  created_at: string;
  updated_at: string;
};

export type MarketplaceCatalog = {
  products: MarketplaceProduct[];
  settings: MarketplaceSettings;
  checkout_enabled: false;
};

export type MarketplaceAccount = {
  requests: MarketplaceRequest[];
  entitlements: MarketplaceEntitlement[];
};

export type MarketplaceAdminData = MarketplaceAccount & {
  products: MarketplaceProduct[];
  settings: MarketplaceSettings;
  stats: { products: number; published: number; pending: number; active_access: number };
};

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Cererea nu a reușit (${response.status}).`);
  return data as T;
}

const ADMIN = '/api/admin/marketplace';

export const marketplaceApi = {
  catalog: () => request<MarketplaceCatalog>('/api/marketplace'),
  mine: () => request<MarketplaceAccount>('/api/marketplace/me'),
  requestAccess: (product_id: string, message: string) => request<{ request: MarketplaceRequest }>(
    '/api/marketplace/requests', 'POST', { product_id, message },
  ),
  admin: {
    get: () => request<MarketplaceAdminData>(ADMIN),
    createProduct: (product: MarketplaceProductInput) => request<{ product: MarketplaceProduct }>(`${ADMIN}/products`, 'POST', product),
    updateProduct: (id: string, product: Partial<MarketplaceProductInput>) => request<{ product: MarketplaceProduct }>(
      `${ADMIN}/products/${encodeURIComponent(id)}`, 'PATCH', product,
    ),
    updateSettings: (settings: MarketplaceSettings) => request<{ settings: MarketplaceSettings }>(`${ADMIN}/settings`, 'PATCH', settings),
    reviewRequest: (id: number, status: MarketplaceRequest['status'], response: string) => request<{ request: MarketplaceRequest }>(
      `${ADMIN}/requests/${id}`, 'PATCH', { status, response },
    ),
    grantAccess: (body: { product_id: string; user_id: number; expires_at?: string | null; note?: string }) => request<{ entitlement: MarketplaceEntitlement }>(
      `${ADMIN}/entitlements`, 'POST', body,
    ),
    revokeAccess: (id: number) => request<{ entitlement: MarketplaceEntitlement }>(`${ADMIN}/entitlements/${id}`, 'PATCH', { status: 'revoked' }),
  },
};

export const MARKETPLACE_CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
  hosting: 'Găzduire', tools: 'Organizare', customization: 'Personalizare', extensions: 'Extensii',
};

export const MARKETPLACE_DELIVERY_LABELS: Record<MarketplaceDelivery, string> = {
  hosted_service: 'Serviciu DanGG', open_source_extension: 'Extensie open-source', commercial_module: 'Modul comercial',
};

export function marketplacePrice(product: Pick<MarketplaceProduct, 'pricing' | 'price_cents' | 'currency'>): string {
  if (product.pricing === 'free') return 'Gratuit';
  if (product.pricing === 'quote' || product.price_cents === null) return 'La cerere';
  const amount = new Intl.NumberFormat('ro-RO', { style: 'currency', currency: product.currency }).format(product.price_cents / 100);
  return amount + (product.pricing === 'monthly' ? ' / lună' : product.pricing === 'yearly' ? ' / an' : '');
}
