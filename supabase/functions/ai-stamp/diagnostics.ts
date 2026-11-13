// Allowlisted diagnostics only. Never serialize a Request, FormData, raw response,
// exception object, photograph or headers collection.
export type OpenAiDiagnostic = {
  event: 'ai_stamp_openai_error';
  job_id: string;
  model: string;
  upstream_status: number | null;
  openai_request_id: string | null;
  error_code: string | null;
  error_type: string | null;
  error_param: string | null;
  message: string;
};
const safeQuotedValues = new Set([
  'image', 'image[]', 'model', 'prompt', 'n', 'size', 'quality', 'background',
  'output_format', 'input_fidelity', 'output_compression', 'transparent', 'opaque',
  'auto', 'png', 'jpeg', 'webp', 'low', 'medium', 'high', '1024x1024',
]);
export function sanitiseMessage(value: unknown, secrets: string[]): string {
  if (typeof value !== 'string') return 'OpenAI returned no structured error message.';
  // Remove exact credentials before truncating, so even a long credential cannot
  // leave a partially exposed prefix. Additional patterns handle echoed/masked keys.
  let message = value;
  for (const secret of secrets) if (secret) message = message.split(secret).join('[redacted]');
  message = message.slice(0, 8192)
    .replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[^\s"'<>]+/gi, '[redacted-key]')
    .replace(/\b(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, '[redacted-credential]')
    .replace(/data:[^,\s]+,[A-Za-z0-9+/=_-]+/gi, '[redacted-image]')
    .replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/gi, '[redacted-url]')
    .replace(/\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[redacted-token]')
    .replace(/[A-Za-z0-9+/_=-]{64,}/g, '[redacted-data]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/(["'])(.*?)\1/gs, (_, quote: string, text: string) =>
      safeQuotedValues.has(text) || /^gpt-image-[a-z0-9.-]+$/i.test(text) ? quote + text + quote : '[redacted-value]')
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return message.slice(0, 512) || 'OpenAI returned an empty error message.';
}
function safeToken(value: unknown, secrets: string[]): string | null {
  if (typeof value !== 'string' || secrets.some(secret => secret && value.includes(secret))) return null;
  return /^[a-z][a-z0-9_.[\]]{0,79}$/i.test(value) && !/^(?:sk|bearer|eyj)/i.test(value) ? value : null;
}
export function openAiDiagnostic(
  context: { job: string; model: string; status: number | null; requestId?: string | null },
  error: unknown,
  secrets: string[],
): OpenAiDiagnostic {
  const detail = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const requestId = context.requestId || '';
  return {
    event: 'ai_stamp_openai_error',
    job_id: /^[a-f0-9-]{36}$/i.test(context.job) && !secrets.some(s => s && context.job.includes(s)) ? context.job : '[invalid]',
    model: /^gpt-image-[a-z0-9.-]{1,80}$/i.test(context.model) && !secrets.some(s => s && context.model.includes(s)) ? context.model : '[unrecognised]',
    upstream_status: context.status,
    openai_request_id: /^req_[a-z0-9_-]{1,100}$/i.test(requestId) && !secrets.some(s => s && requestId.includes(s)) ? requestId : null,
    error_code: safeToken(detail.code, secrets),
    error_type: safeToken(detail.type, secrets),
    error_param: safeToken(detail.param, secrets),
    message: sanitiseMessage(detail.message, secrets),
  };
}
