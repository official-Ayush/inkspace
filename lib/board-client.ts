'use client';

const MAX_SCENE_BYTES = 15_000_000;

async function apiRequest(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw new Error('Your session expired. Export a backup of any unsaved work, then sign in again.');
    throw new Error(data.error ?? 'Something went wrong. Please try again.');
  }
  return data;
}

/** Transfer drawing data directly to private storage, outside Vercel Functions. */
export async function request(url: string, options: RequestInit = {}): Promise<any> {
  const method = options.method ?? 'GET';
  let body = typeof options.body === 'string' ? JSON.parse(options.body) : null;
  if ((method === 'POST' || method === 'PUT') && body?.scene) {
    const serialized = JSON.stringify(body.scene);
    const blob = new Blob([serialized], { type: 'application/json' });
    if (blob.size > MAX_SCENE_BYTES) throw new Error('This drawing exceeds 15 MB. Export a backup and reduce image sizes.');
    const upload = await apiRequest('/api/boards/uploads', {
      method: 'POST',
      body: JSON.stringify(method === 'PUT' ? { boardId: url.split('/').pop() } : {}),
    });
    const uploaded = await fetch(upload.uploadUrl, {
      method: 'PUT',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json', 'x-upsert': 'false', 'Cache-Control': 'max-age=0' },
      body: blob,
    });
    if (!uploaded.ok) throw new Error('The drawing could not be uploaded. Your open canvas is kept here; try saving again.');
    const { scene: _scene, ...metadata } = body;
    body = { ...metadata, ...(method === 'POST' ? { id: upload.boardId } : {}), sceneKey: upload.sceneKey };
    options = { ...options, body: JSON.stringify(body) };
  }
  const data = await apiRequest(url, options);
  if (method === 'GET' && data.sceneUrl && data.board) {
    const response = await fetch(data.sceneUrl, { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('The drawing could not be opened. Please try again.');
    return { board: data.board, scene: await response.json() };
  }
  return data;
}
