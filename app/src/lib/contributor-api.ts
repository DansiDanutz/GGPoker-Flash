import { getToken } from './api';

export type Contribution = {
  id: string; user_id: number; plugin_id: string; pr_number: number; head_sha: string; notes: string;
  status: string; reason: string; installed: boolean;
  proof: { author: string; ci_url: string; merged: boolean };
};
export type ContributorPlugin = { id: string; name: string; summary: string; version: string; playPath: string; prNumber: number };
async function request<T>(admin: boolean, path = '', body?: unknown): Promise<T> {
  const response = await fetch(`/api/${admin ? 'admin/' : ''}marketplace/contributor${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${getToken() || ''}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Contributor request failed.');
  return data as T;
}
export const contributorApi = {
  list: (admin = false) => request<{ submissions: Contribution[] }>(admin),
  plugins: () => request<{ plugins: ContributorPlugin[] }>(false, '/plugins'),
  submit: (body: { pluginId: string; prUrl: string; notes: string }) => request(false, '', body),
  review: (id: string, body: { action: string; reason: string; authorConfirmed: boolean }) => request(true, '/' + encodeURIComponent(id), body),
};
