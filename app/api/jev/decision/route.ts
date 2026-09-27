import {
  buildJevChoicePayload,
  mapJevDecisionResponse,
  validateJevDecisionRequest,
} from '../../../../src/server/jev-decision';

export const runtime = 'nodejs';

const TYPE_SAFE_URL = 'https://api.typesafe.ai/v1/systemone';
const MAX_REQUEST_BYTES = 64 * 1024;

type BodyReadResult =
  | { kind: 'ok'; text: string }
  | { kind: 'too-large' }
  | { kind: 'invalid' };

export async function POST(request: Request): Promise<Response> {
  const bodyResult = await readRequestBody(request);
  if (bodyResult.kind === 'too-large') {
    return jsonError('request_too_large', 413);
  }
  if (bodyResult.kind === 'invalid') {
    return jsonError('invalid_jev_request', 400);
  }

  let submitted: unknown;
  try {
    submitted = JSON.parse(bodyResult.text) as unknown;
  } catch {
    return jsonError('invalid_jev_request', 400);
  }

  const validated = validateJevDecisionRequest(submitted);
  if (!validated) {
    return jsonError('invalid_jev_request', 400);
  }

  const apiKey = process.env.JEV_API_KEY;
  if (!apiKey) {
    return jsonError('jev_not_configured', 503);
  }

  let upstream: Response;
  try {
    upstream = await fetch(TYPE_SAFE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildJevChoicePayload(validated)),
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    return jsonError('jev_upstream_failed', 502);
  }

  if (!upstream.ok) {
    return jsonError('jev_upstream_failed', 502);
  }

  let responseData: unknown;
  try {
    responseData = await upstream.json();
  } catch {
    return jsonError('jev_upstream_failed', 502);
  }

  const mappedResponse = mapJevDecisionResponse(validated, responseData);
  if (!mappedResponse) {
    return jsonError('jev_upstream_failed', 502);
  }

  return Response.json(mappedResponse);
}

async function readRequestBody(request: Request): Promise<BodyReadResult> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (
      Number.isSafeInteger(declaredLength) &&
      declaredLength > MAX_REQUEST_BYTES
    ) {
      return { kind: 'too-large' };
    }
  }

  if (!request.body) {
    return { kind: 'ok', text: '' };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return { kind: 'too-large' };
      }
      chunks.push(value);
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return { kind: 'ok', text: new TextDecoder('utf-8', { fatal: true }).decode(body) };
  } catch {
    return { kind: 'invalid' };
  }
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}
