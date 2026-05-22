import { setSignSecret, createCompletion, createCompletionStream, generateImages, generateVideos } from "./chat.ts";
import { createClaudeCompletion, createGeminiCompletion } from "./adapters.ts";
import { defaultTo, isString, unixTimestamp, uuid, md5 } from "./utils.ts";

function getWelcomeHtml(apiKeyEnabled: boolean): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GLM Free API Neo</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 800px; margin: 60px auto; padding: 0 20px; color: #333; line-height: 1.6; }
  h1 { color: #1a1a1a; }
  code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  pre { background: #f4f4f4; padding: 16px; border-radius: 8px; overflow-x: auto; }
  .endpoint { margin: 12px 0; padding: 12px; background: #fafafa; border-left: 4px solid #007acc; border-radius: 4px; }
</style>
</head>
<body>
<h1>GLM Free API Neo</h1>
<p>零配置、无 KV、无管理界面的 GLM API 代理服务。</p>
<p>每次请求自动获取访客 Token，默认无需上游 API Key，部署即用。</p>
${apiKeyEnabled ? '<p><strong>当前已启用访问秘钥：</strong>请求时请携带 <code>Authorization: Bearer &lt;your-key&gt;</code> 或 <code>x-api-key</code>。</p>' : ""}

<h2>支持的端点</h2>
<div class="endpoint"><strong>POST</strong> <code>/v1/chat/completions</code> — OpenAI 格式对话</div>
<div class="endpoint"><strong>POST</strong> <code>/v1/messages</code> — Claude 格式对话</div>
<div class="endpoint"><strong>POST</strong> <code>/v1beta/models/...:generateContent</code> — Gemini 格式对话</div>
<div class="endpoint"><strong>POST</strong> <code>/v1/images/generations</code> — AI 绘图</div>
<div class="endpoint"><strong>POST</strong> <code>/v1/videos/generations</code> — 视频生成</div>
<div class="endpoint"><strong>GET</strong> <code>/v1/models</code> — 模型列表</div>
<div class="endpoint"><strong>POST</strong> <code>/chat/completions</code> — OpenAI 根路径别名</div>
<div class="endpoint"><strong>GET</strong> <code>/healthz</code> / <code>/readyz</code> — 健康检查</div>

<h2>使用示例</h2>
<pre>curl http://localhost:8787/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  ${apiKeyEnabled ? '-H "Authorization: Bearer your-key" \\\\\n  ' : ""}-d '{"model":"glm-4-flash","messages":[{"role":"user","content":"你好"}]}'</pre>

<p>${apiKeyEnabled ? "已启用访问秘钥，请先配置后再调用。" : "无需 API Key，直接调用即可。"}</p>
</body>
</html>`;
}

export interface Env {
  SIGN_SECRET?: string;
  API_KEY?: string;
  API_KEYS?: string;
}

const DEFAULT_SIGN_SECRET = "8a1317a7468aa3ad86e997d08f3f31cb";
const PROTECTED_PATH_PREFIXES = ["/v1", "/v1beta", "/messages", "/models", "/chat"];

type ModelInfo = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  description?: string;
  permission?: any[];
};

const SUPPORTED_MODELS = [
  { id: "glm-5", object: "model", created: 1677610602, owned_by: "glm", description: "GLM-5 通用对话模型", permission: [] },
  { id: "glm-4-flash", object: "model", created: 1677610602, owned_by: "glm", description: "GLM-4 Flash 快速对话模型", permission: [] },
  { id: "glm-4-plus", object: "model", created: 1677610602, owned_by: "glm", description: "GLM-4 Plus 通用增强模型", permission: [] },
  { id: "glm-4.5", object: "model", created: 1677610602, owned_by: "glm", description: "GLM-4.5 通用模型", permission: [] },
];

const CLAUDE_MODELS: ModelInfo[] = [
  { id: "claude-opus-4-6", object: "model", created: 1715635200, owned_by: "anthropic", permission: [] },
  { id: "claude-sonnet-4-6", object: "model", created: 1715635200, owned_by: "anthropic", permission: [] },
  { id: "claude-haiku-4-5", object: "model", created: 1715635200, owned_by: "anthropic", permission: [] },
  { id: "claude-sonnet-4-5", object: "model", created: 1715635200, owned_by: "anthropic", permission: [] },
  { id: "claude-opus-4-1", object: "model", created: 1715635200, owned_by: "anthropic", permission: [] },
  { id: "claude-opus-4-0", object: "model", created: 1715635200, owned_by: "anthropic", permission: [] },
  { id: "claude-3-7-sonnet-latest", object: "model", created: 1715635200, owned_by: "anthropic", permission: [] },
  { id: "claude-3-5-sonnet-latest", object: "model", created: 1715635200, owned_by: "anthropic", permission: [] },
  { id: "claude-3-opus-20240229", object: "model", created: 1715635200, owned_by: "anthropic", permission: [] },
  { id: "claude-3-sonnet-20240229", object: "model", created: 1715635200, owned_by: "anthropic", permission: [] },
  { id: "claude-3-haiku-20240307", object: "model", created: 1715635200, owned_by: "anthropic", permission: [] },
];

const GEMINI_MODELS = [
  { name: "models/gemini-1.5-pro", displayName: "Gemini 1.5 Pro", description: "Most capable model for complex reasoning tasks", inputTokenLimit: 2097152, outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent", "streamGenerateContent"] },
  { name: "models/gemini-1.5-flash", displayName: "Gemini 1.5 Flash", description: "Fast model for high throughput", inputTokenLimit: 1048576, outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent", "streamGenerateContent"] },
  { name: "models/gemini-pro", displayName: "Gemini Pro", description: "Previous generation model", inputTokenLimit: 32768, outputTokenLimit: 2048, supportedGenerationMethods: ["generateContent", "streamGenerateContent"] },
  { name: "models/glm-5", displayName: "GLM-5", description: "GLM-5 chat model via adapter", inputTokenLimit: 32768, outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent", "streamGenerateContent"] },
];

const MODEL_ALIASES: Record<string, string> = {
  "chatgpt-4o": "glm-4-flash",
  "gpt-4": "glm-4-flash",
  "gpt-4-turbo": "glm-4-flash",
  "gpt-4o": "glm-4-flash",
  "gpt-4o-mini": "glm-4-flash",
  "gpt-4.1": "glm-4-flash",
  "gpt-4.1-mini": "glm-4-flash",
  "gpt-5": "glm-5",
  "gpt-5-chat": "glm-5",
  "gpt-5.1": "glm-5",
  "gpt-5.2": "glm-5",
  "gpt-5.3-chat": "glm-5",
  "gpt-5.4": "glm-5",
  "gpt-5.5": "glm-5",
  "gpt-5-mini": "glm-4-flash",
  "gpt-5-pro": "glm-4-plus",
  "gpt-5-codex": "glm-4-plus",
  "gpt-5.3-codex": "glm-4-plus",
  "codex-mini-latest": "glm-4-plus",
  "o1": "glm-4-plus",
  "o1-preview": "glm-4-plus",
  "o1-mini": "glm-4-plus",
  "o3": "glm-4-plus",
  "o3-mini": "glm-4-plus",
  "o3-pro": "glm-4-plus",
  "claude-opus-4-6": "glm-4-plus",
  "claude-opus-4-1": "glm-4-plus",
  "claude-opus-4-0": "glm-4-plus",
  "claude-sonnet-4-6": "glm-4-flash",
  "claude-sonnet-4-5": "glm-4-flash",
  "claude-sonnet-4-0": "glm-4-flash",
  "claude-haiku-4-5": "glm-4-flash",
  "claude-3-7-sonnet": "glm-4-flash",
  "claude-3-5-sonnet": "glm-4-flash",
  "claude-3-opus": "glm-4-plus",
  "claude-3-sonnet": "glm-4-flash",
  "claude-3-haiku": "glm-4-flash",
  "gemini-pro": "glm-4-plus",
  "gemini-1.5-pro": "glm-4-plus",
  "gemini-1.5-flash": "glm-4-flash",
  "gemini-2.0-flash": "glm-4-flash",
  "gemini-2.5-pro": "glm-4-plus",
  "gemini-2.5-flash": "glm-4-flash",
  "gemini-3-pro": "glm-4-plus",
  "gemini-3-flash": "glm-4-flash",
};

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ code: -1, message, data: null }, status);
}

function unauthorizedResponse(message = "Invalid or missing API key"): Response {
  return new Response(JSON.stringify({
    error: {
      message,
      type: "authentication_error",
      code: "invalid_api_key",
    },
  }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": "Bearer",
      ...corsHeaders(),
    },
  });
}

function openAIErrorType(status: number): string {
  switch (status) {
    case 400:
      return "invalid_request_error";
    case 401:
      return "authentication_error";
    case 403:
      return "permission_error";
    case 429:
      return "rate_limit_error";
    case 503:
      return "service_unavailable_error";
    default:
      return status >= 500 ? "api_error" : "invalid_request_error";
  }
}

function openAIErrorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({
    error: {
      message,
      type: openAIErrorType(status),
    },
  }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function claudeErrorCode(status: number): string {
  switch (status) {
    case 401:
      return "authentication_failed";
    case 404:
      return "not_found";
    case 429:
      return "rate_limit_exceeded";
    case 500:
      return "internal_error";
    default:
      return "invalid_request";
  }
}

function claudeErrorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({
    error: {
      type: "invalid_request_error",
      message,
      code: claudeErrorCode(status),
      param: null,
    },
  }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      ...corsHeaders(),
    },
  });
}

function sseResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...corsHeaders(),
    },
  });
}

async function generateChatGLMSign(secret: string): Promise<{ timestamp: string; nonce: string; sign: string }> {
  const now = Date.now().toString();
  const length = now.length;
  const digits = now.split("").map((char) => Number(char));
  const checksum = (digits.reduce((sum, value) => sum + value, 0) - digits[length - 2]) % 10;
  const timestamp = now.substring(0, length - 2) + checksum + now.substring(length - 1, length);
  const nonce = uuid(false);
  const sign = await md5(`${timestamp}-${nonce}-${secret}`);
  return { timestamp, nonce, sign };
}

async function requestGuestRefreshToken(env: Env): Promise<{ refreshToken: string; accessToken: string; userId: string }> {
  const signSecret = env.SIGN_SECRET || DEFAULT_SIGN_SECRET;
  const sign = await generateChatGLMSign(signSecret);
  const response = await fetch("https://chatglm.cn/chatglm/user-api/guest/access", {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      "App-Name": "chatglm",
      "X-Device-Id": uuid(false),
      "X-Request-Id": uuid(false),
      "X-App-Platform": "pc",
      "X-App-Version": "0.0.1",
      "X-App-fr": "browser",
      "X-Lang": "zh-CN",
      "X-Exp-Groups": "",
      "X-Device-Model": "",
      "X-Device-Brand": "",
      "X-Timestamp": sign.timestamp,
      "X-Nonce": sign.nonce,
      "X-Sign": sign.sign,
    },
    body: "{}",
  });

  const rawText = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`[Neo] guest/access 返回了非 JSON 内容: ${rawText.slice(0, 200)}`);
  }

  const success = data?.status === 0 || data?.code === 0 || data?.message === "success";
  if (!response.ok || !success) {
    throw new Error(`[Neo] 获取游客 token 失败: ${data?.message || response.statusText}`);
  }

  const result = data?.result;
  if (!result?.refresh_token || !result?.access_token || !result?.user_id) {
    throw new Error("[Neo] guest/access 未返回完整 token 信息");
  }

  return {
    refreshToken: result.refresh_token,
    accessToken: result.access_token,
    userId: result.user_id,
  };
}

async function authenticate(env: Env): Promise<string> {
  const guest = await requestGuestRefreshToken(env);
  return guest.refreshToken;
}

function getConfiguredApiKeys(env: Env): string[] {
  const rawValues = [env.API_KEY, env.API_KEYS].filter(Boolean) as string[];
  return Array.from(new Set(
    rawValues
      .flatMap((value) => value.split(/[\s,]+/))
      .map((value) => value.trim())
      .filter(Boolean)
  ));
}

function isProtectedPath(path: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function normalizeModelName(model: any): string {
  const text = isString(model) ? model.trim() : "";
  if (!text) return "glm-4-flash";

  const lower = text.toLowerCase();
  return MODEL_ALIASES[lower] || text;
}

function resolveClaudeResponseModel(model: any): string {
  const text = isString(model) ? model.trim() : "";
  return text || "claude-sonnet-4-6";
}

function extractApiKey(request: Request): string | null {
  const bearerToken = extractBearerToken(request.headers.get("Authorization"));
  if (bearerToken) return bearerToken;

  const headerToken = request.headers.get("x-api-key")
    || request.headers.get("api-key")
    || request.headers.get("x-goog-api-key");
  if (headerToken?.trim()) return headerToken.trim();

  const url = new URL(request.url);
  const queryToken = url.searchParams.get("key") || url.searchParams.get("api_key");
  if (queryToken?.trim()) return queryToken.trim();

  return headerToken?.trim() || null;
}

function validateApiKey(request: Request, env: Env): Response | null {
  const configuredKeys = getConfiguredApiKeys(env);
  if (configuredKeys.length === 0) return null;

  const providedKey = extractApiKey(request);
  if (!providedKey) {
    return unauthorizedResponse("Missing API key. Use Authorization: Bearer <key> or x-api-key.");
  }

  if (!configuredKeys.includes(providedKey)) {
    return unauthorizedResponse("Invalid API key.");
  }

  return null;
}

async function handleChatCompletions(request: Request, env: Env): Promise<Response> {
  const refreshToken = await authenticate(env);
  const body = (await request.json()) as any;

  if (!Array.isArray(body.messages)) throw new Error("messages must be an array");

  const { model, conversation_id: convId, messages, stream, tools } = body;
  const normalizedModel = normalizeModelName(model);
  if (stream) {
    const glmStream = await createCompletionStream(messages, refreshToken, normalizedModel, convId, 0, tools);
    return sseResponse(glmStream);
  } else {
    const result = await createCompletion(messages, refreshToken, normalizedModel, convId, 0, tools);
    return jsonResponse(result);
  }
}

async function handleClaudeMessages(request: Request, env: Env): Promise<Response> {
  const requestWithVersion = new Request(request, {
    headers: new Headers(request.headers),
  });
  if (!requestWithVersion.headers.get("anthropic-version")) {
    requestWithVersion.headers.set("anthropic-version", "2023-06-01");
  }

  const refreshToken = await authenticate(env);
  const body = (await requestWithVersion.json()) as any;

  if (!Array.isArray(body.messages)) throw new Error("messages must be an array");

  const { model, messages, system, stream, conversation_id: convId, tools } = body;
  const result = await createClaudeCompletion(
    normalizeModelName(model),
    messages,
    system,
    refreshToken,
    stream,
    convId,
    tools,
    resolveClaudeResponseModel(model),
  );
  if (stream && result instanceof ReadableStream) {
    return new Response(result, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "anthropic-version": requestWithVersion.headers.get("anthropic-version") || "2023-06-01",
        ...corsHeaders(),
      },
    });
  }
  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": requestWithVersion.headers.get("anthropic-version") || "2023-06-01",
      ...corsHeaders(),
    },
  });
}

async function handleClaudeCountTokens(request: Request): Promise<Response> {
  const body = (await request.json()) as any;
  if (!isString(body?.model) || !Array.isArray(body?.messages) || body.messages.length === 0) {
    return claudeErrorResponse("Request must include 'model' and 'messages'.", 400);
  }

  const countText = (value: any): string => {
    if (isString(value)) return value;
    if (Array.isArray(value)) {
      return value.map((item: any) => {
        if (item?.type === "text" && isString(item.text)) return item.text;
        if (item?.type === "tool_use") return JSON.stringify(item.input || {});
        if (item?.type === "tool_result") {
          if (isString(item.content)) return item.content;
          return JSON.stringify(item.content || "");
        }
        return "";
      }).join("\n");
    }
    return JSON.stringify(value || "");
  };

  const systemText = isString(body.system)
    ? body.system
    : Array.isArray(body.system)
      ? body.system
        .filter((item: any) => item?.type === "text" && isString(item.text))
        .map((item: any) => item.text)
        .join("\n")
      : "";
  const joined = [
    systemText,
    ...body.messages.map((message: any) => countText(message?.content)),
  ].filter(Boolean).join("\n");
  const inputTokens = Math.max(1, Math.ceil(joined.length / 4));

  return new Response(JSON.stringify({ input_tokens: inputTokens }), {
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": request.headers.get("anthropic-version") || "2023-06-01",
      ...corsHeaders(),
    },
  });
}

async function handleClaudeModels(): Promise<Response> {
  return new Response(JSON.stringify({
    object: "list",
    data: CLAUDE_MODELS,
    first_id: CLAUDE_MODELS[0]?.id || null,
    last_id: CLAUDE_MODELS[CLAUDE_MODELS.length - 1]?.id || null,
    has_more: false,
  }), {
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      ...corsHeaders(),
    },
  });
}

async function handleGeminiModels(): Promise<Response> {
  return jsonResponse({ models: GEMINI_MODELS });
}

async function handleGeminiGenerateContent(request: Request, path: string, env: Env): Promise<Response> {
  const refreshToken = await authenticate(env);
  const body = (await request.json()) as any;

  const modelMatch = path.match(/^\/v1beta\/models\/(.+):generateContent$/);
  const model = normalizeModelName(modelMatch ? modelMatch[1] : "gemini-pro");
  const { contents, systemInstruction, conversation_id: convId } = body;
  const result = await createGeminiCompletion(model, contents, systemInstruction, refreshToken, false, convId);
  return jsonResponse(result);
}

async function handleGeminiStreamGenerateContent(request: Request, path: string, env: Env): Promise<Response> {
  const refreshToken = await authenticate(env);
  const body = (await request.json()) as any;

  const modelMatch = path.match(/^\/v1beta\/models\/(.+):streamGenerateContent$/);
  const model = normalizeModelName(modelMatch ? modelMatch[1] : "gemini-pro");
  const { contents, systemInstruction, conversation_id: convId } = body;
  const result = await createGeminiCompletion(model, contents, systemInstruction, refreshToken, true, convId);
  if (result instanceof ReadableStream) {
    return sseResponse(result);
  }
  return jsonResponse(result);
}

async function handleImageGenerations(request: Request, env: Env): Promise<Response> {
  const refreshToken = await authenticate(env);
  const body = (await request.json()) as any;

  if (!isString(body.prompt)) throw new Error("prompt must be a string");
  const prompt = body.prompt;
  const responseFormat = defaultTo(body.response_format, "url");
  const normalizedModel = normalizeModelName(body.model);
  const assistantId = /^[a-z0-9]{24,}$/.test(normalizedModel) ? normalizedModel : undefined;
  const imageUrls = await generateImages(assistantId, prompt, refreshToken);

  let data: any[];
  if (responseFormat == "b64_json") {
    data = (await Promise.all(imageUrls.map((url: string) => fetchBase64(url)))).map((b64) => ({ b64_json: b64 }));
  } else {
    data = imageUrls.map((url: string) => ({ url }));
  }
  return jsonResponse({ created: unixTimestamp(), data });
}

async function fetchBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return "data:image/png;base64," + btoa(binary);
}

async function handleVideoGenerations(request: Request, env: Env): Promise<Response> {
  const refreshToken = await authenticate(env);
  const body = (await request.json()) as any;

  if (!isString(body.prompt)) throw new Error("prompt must be a string");
  const {
    model,
    conversation_id: convId,
    prompt,
    image_url: imageUrl,
    video_style: videoStyle = "",
    emotional_atmosphere: emotionalAtmosphere = "",
    mirror_mode: mirrorMode = "",
    audio_id: audioId,
  } = body;

  const validStyles = ["卡通3D", "黑白老照片", "油画", "电影感"];
  const validEmotions = ["温馨和谐", "生动活泼", "紧张刺激", "凄凉寂寞"];
  const validMirrors = ["水平", "垂直", "推近", "拉远"];
  if (videoStyle && !validStyles.includes(videoStyle)) throw new Error(`video_style must be one of ${validStyles.join("/")}`);
  if (emotionalAtmosphere && !validEmotions.includes(emotionalAtmosphere)) throw new Error(`emotional_atmosphere must be one of ${validEmotions.join("/")}`);
  if (mirrorMode && !validMirrors.includes(mirrorMode)) throw new Error(`mirror_mode must be one of ${validMirrors.join("/")}`);

  const result = await generateVideos(normalizeModelName(model), prompt, refreshToken, {
    imageUrl,
    videoStyle,
    emotionalAtmosphere,
    mirrorMode,
    audioId,
  }, convId);
  return jsonResponse({
    created: unixTimestamp(),
    data: result.map((item: any) => ({ url: item.url })),
  });
}

async function handleModels(): Promise<Response> {
  return jsonResponse({ object: "list", data: SUPPORTED_MODELS });
}

async function handleModelById(path: string): Promise<Response> {
  const modelId = decodeURIComponent(path.slice("/v1/models/".length));
  const model = SUPPORTED_MODELS.find((item) => item.id === modelId);
  if (!model) {
    return openAIErrorResponse(`The model '${modelId}' does not exist`, 404);
  }
  return jsonResponse(model);
}

// ==================== Main Export ====================

export default {
  async fetch(request: Request, env: Env, _ctx: any): Promise<Response> {
    if (env.SIGN_SECRET) setSignSecret(env.SIGN_SECRET);

    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (isProtectedPath(path)) {
      const authError = validateApiKey(request, env);
      if (authError) return authError;
    }

    try {
      let response: Response;

      if (path === "/" && request.method === "GET") {
        response = new Response(getWelcomeHtml(getConfiguredApiKeys(env).length > 0), {
          headers: { "Content-Type": "text/html", ...corsHeaders() },
        });
      } else if ((path === "/v1/chat/completions" || path === "/chat/completions") && request.method === "POST") {
        response = await handleChatCompletions(request, env);
      } else if ((path === "/anthropic/v1/models") && request.method === "GET") {
        response = await handleClaudeModels();
      } else if ((path === "/anthropic/v1/messages/count_tokens" || path === "/v1/messages/count_tokens" || path === "/messages/count_tokens") && request.method === "POST") {
        response = await handleClaudeCountTokens(request);
      } else if ((path === "/anthropic/v1/messages" || path === "/v1/messages" || path === "/messages") && request.method === "POST") {
        response = await handleClaudeMessages(request, env);
      } else if (path === "/v1beta/models" && request.method === "GET") {
        response = await handleGeminiModels();
      } else if (path.match(/^\/v1beta\/models\/[^:]+:generateContent$/) && request.method === "POST") {
        response = await handleGeminiGenerateContent(request, path, env);
      } else if (path.match(/^\/v1beta\/models\/[^:]+:streamGenerateContent$/) && request.method === "POST") {
        response = await handleGeminiStreamGenerateContent(request, path, env);
      } else if (path === "/v1/images/generations" && request.method === "POST") {
        response = await handleImageGenerations(request, env);
      } else if (path === "/v1/videos/generations" && request.method === "POST") {
        response = await handleVideoGenerations(request, env);
      } else if ((path === "/v1/models" || path === "/models") && request.method === "GET") {
        response = await handleModels();
      } else if ((path.startsWith("/v1/models/") || path.startsWith("/models/")) && request.method === "GET") {
        const normalizedPath = path.startsWith("/models/") ? `/v1${path}` : path;
        response = await handleModelById(normalizedPath);
      } else if ((path === "/healthz" || path === "/readyz") && (request.method === "GET" || request.method === "HEAD")) {
        response = jsonResponse({ status: path === "/healthz" ? "ok" : "ready" });
      } else if (path === "/ping" && request.method === "GET") {
        response = new Response("pong", { headers: corsHeaders() });
      } else {
        const message = `[请求有误]: 正确请求为 POST -> /v1/chat/completions，当前请求为 ${request.method} -> ${path} 请纠正`;
        response = errorResponse(message, 404);
      }

      return response;
    } catch (err: any) {
      console.error(err);
      if (path === "/anthropic/v1/messages"
        || path === "/v1/messages"
        || path === "/messages"
        || path === "/anthropic/v1/messages/count_tokens"
        || path === "/v1/messages/count_tokens"
        || path === "/messages/count_tokens"
        || path === "/anthropic/v1/models") {
        return claudeErrorResponse(err.message || "Internal error", 500);
      }
      return errorResponse(err.message || "Internal error", 500);
    }
  },
};
