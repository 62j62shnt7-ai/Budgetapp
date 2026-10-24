export interface Env {
  GOOGLE_CLIENT_SECRET: string;
  ALLOWED_ORIGINS?: string;
}

const DEFAULT_ALLOWED = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://62j62shnt7-ai.github.io',
  'https://xear0.github.io',
];

function getCorsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('Origin') || '';
  const configured = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowedList = configured.length > 0 ? configured : DEFAULT_ALLOWED;

  const isAllowed = allowedList.includes(origin) || allowedList.includes('*');
  const allowedOrigin = isAllowed ? origin : allowedList[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/auth/exchange') {
      try {
        const body = (await request.json()) as {
          client_id?: string;
          code?: string;
          redirect_uri?: string;
          code_verifier?: string;
        };

        if (!body.client_id || !body.code) {
          return new Response(
            JSON.stringify({ error: 'invalid_request', error_description: 'client_id and code are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const params = new URLSearchParams({
          client_id: body.client_id,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          code: body.code,
          grant_type: 'authorization_code',
          redirect_uri: body.redirect_uri || 'postmessage',
        });
        if (body.code_verifier) {
          params.append('code_verifier', body.code_verifier);
        }

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params,
        });

        const data = await tokenRes.text();
        return new Response(data, {
          status: tokenRes.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: 'server_error', error_description: (err as Error).message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (request.method === 'POST' && url.pathname === '/auth/refresh') {
      try {
        const body = (await request.json()) as {
          client_id?: string;
          refresh_token?: string;
        };

        if (!body.client_id || !body.refresh_token) {
          return new Response(
            JSON.stringify({ error: 'invalid_request', error_description: 'client_id and refresh_token are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const params = new URLSearchParams({
          client_id: body.client_id,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          refresh_token: body.refresh_token,
          grant_type: 'refresh_token',
        });

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params,
        });

        const data = await tokenRes.text();
        return new Response(data, {
          status: tokenRes.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: 'server_error', error_description: (err as Error).message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  },
};
