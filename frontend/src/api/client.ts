// API client for StatusDeck

const STORAGE_KEY_TOKEN = 'statusdeck_token';
const STORAGE_KEY_TENANT = 'statusdeck_tenant';

export function getAuthToken(): string {
  return localStorage.getItem(STORAGE_KEY_TOKEN) || 'dev-tenant-demo-tenant-1';
}

export function setAuthToken(token: string, tenantId: string): void {
  localStorage.setItem(STORAGE_KEY_TOKEN, token);
  localStorage.setItem(STORAGE_KEY_TENANT, tenantId);
}

export function clearAuthToken(): void {
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_TENANT);
}

export function getCurrentTenantId(): string {
  return localStorage.getItem(STORAGE_KEY_TENANT) || 'demo-tenant-1';
}

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = endpoint.startsWith('http') ? endpoint : `/api/v1${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetails: { error?: string; message?: string } = {};
    try {
      errorDetails = await response.json();
    } catch {
      // Non-json error
    }
    const err = new Error(errorDetails.message || `API error ${response.status}: ${response.statusText}`);
    (err as unknown as { status: number }).status = response.status;
    throw err;
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}
