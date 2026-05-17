/**
 * Cloudflare Worker — Parcoursup Viewer Sync
 *
 * Format : Service Worker (compatible tous dashboards, y compris anciens)
 * Si ton dashboard force le mode ES Module, remplace tout par la version
 * commentée en bas du fichier.
 *
 * Setup :
 *   1. Créer un namespace KV nommé PARCOURSUP_KV
 *   2. Dans Settings > Variables > KV Namespace Bindings :
 *      Variable name = PARCOURSUP_KV  →  sélectionner le namespace
 *   3. Coller ce code et Deploy
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    if (url.pathname === '/save' && request.method === 'POST') {
      const body = await request.json();
      const roomId = body.roomId || generateId();
      const payload = JSON.stringify(body.data);

      // TTL 1 an (31 536 000 secondes)
      await PARCOURSUP_KV.put(roomId, payload, { expirationTtl: 31536000 });

      return jsonResponse({ roomId, ok: true });
    }

    if (url.pathname === '/load' && request.method === 'GET') {
      const roomId = url.searchParams.get('roomId');
      if (!roomId) {
        return jsonResponse({ error: 'Missing roomId' }, 400);
      }
      const data = await PARCOURSUP_KV.get(roomId);
      if (!data) {
        return jsonResponse({ error: 'Not found' }, 404);
      }
      return new Response(data, {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback robuste pour tous les runtimes
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function jsonResponse(body, status) {
  status = status || 200;
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/* ── Version ES Module (dashboard moderne) ────────────────────────────────────
 * Décommente ci-dessous et commente tout le code au-dessus si ton dashboard
 * refuse le format Service Worker.
 *
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const CORS_HEADERS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (url.pathname === '/save' && request.method === 'POST') {
        const body = await request.json();
        const roomId = body.roomId || crypto.randomUUID();
        await env.PARCOURSUP_KV.put(roomId, JSON.stringify(body.data), { expirationTtl: 31536000 });
        return new Response(JSON.stringify({ roomId, ok: true }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      if (url.pathname === '/load' && request.method === 'GET') {
        const roomId = url.searchParams.get('roomId');
        if (!roomId) return new Response(JSON.stringify({ error: 'Missing roomId' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
        const data = await env.PARCOURSUP_KV.get(roomId);
        if (!data) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
        return new Response(data, { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
  }
};
*/
