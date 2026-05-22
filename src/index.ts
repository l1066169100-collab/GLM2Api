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
  :root {
    --bg: #f3efe6;
    --panel: rgba(255, 252, 245, 0.88);
    --ink: #1f2a1f;
    --muted: #566356;
    --line: rgba(31, 42, 31, 0.12);
    --accent: #1f7a5a;
    --accent-2: #b86a32;
    --danger: #b43f3f;
    --shadow: 0 24px 60px rgba(40, 47, 39, 0.12);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: var(--ink);
    background:
      radial-gradient(circle at top left, rgba(184, 106, 50, 0.18), transparent 28%),
      radial-gradient(circle at top right, rgba(31, 122, 90, 0.16), transparent 26%),
      linear-gradient(180deg, #f6f1e8 0%, #efe7d7 100%);
    font-family: "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
    line-height: 1.5;
  }
  .shell {
    width: min(1200px, calc(100% - 32px));
    margin: 24px auto 40px;
  }
  .hero {
    display: grid;
    gap: 18px;
    padding: 24px;
    border: 1px solid var(--line);
    border-radius: 24px;
    background: var(--panel);
    box-shadow: var(--shadow);
    backdrop-filter: blur(18px);
  }
  .hero-top {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(31, 122, 90, 0.1);
    color: var(--accent);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  h1 {
    margin: 0;
    font-size: clamp(30px, 5vw, 54px);
    line-height: 0.95;
    letter-spacing: -0.04em;
  }
  .sub {
    max-width: 820px;
    color: var(--muted);
    font-size: 16px;
  }
  .grid {
    display: grid;
    grid-template-columns: 360px minmax(0, 1fr);
    gap: 20px;
    margin-top: 20px;
  }
  .card {
    border: 1px solid var(--line);
    border-radius: 22px;
    background: var(--panel);
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .card h2 {
    margin: 0;
    font-size: 15px;
    letter-spacing: 0.02em;
  }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px;
    border-bottom: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.4);
  }
  .card-body {
    padding: 18px;
  }
  .meta {
    color: var(--muted);
    font-size: 13px;
  }
  .stack {
    display: grid;
    gap: 14px;
  }
  .row {
    display: grid;
    gap: 8px;
  }
  label {
    font-size: 13px;
    font-weight: 700;
    color: var(--ink);
  }
  input, select, textarea, button {
    font: inherit;
  }
  input, select, textarea {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.74);
    color: var(--ink);
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
  }
  textarea {
    resize: vertical;
    min-height: 120px;
  }
  input:focus, select:focus, textarea:focus {
    border-color: rgba(31, 122, 90, 0.48);
    box-shadow: 0 0 0 4px rgba(31, 122, 90, 0.1);
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  button {
    border: 0;
    border-radius: 14px;
    padding: 12px 16px;
    cursor: pointer;
    transition: transform 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;
  }
  button:hover { transform: translateY(-1px); }
  button:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
  .primary {
    background: linear-gradient(135deg, var(--accent), #2d9c77);
    color: #fff;
    box-shadow: 0 14px 28px rgba(31, 122, 90, 0.24);
  }
  .secondary {
    background: rgba(184, 106, 50, 0.12);
    color: var(--accent-2);
  }
  .ghost {
    background: rgba(31, 42, 31, 0.06);
    color: var(--ink);
  }
  .status {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    padding: 12px 14px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.5);
    border: 1px solid var(--line);
  }
  .status strong { font-size: 13px; }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(31, 122, 90, 0.1);
    color: var(--accent);
    font-size: 12px;
    font-weight: 700;
  }
  .pill.error {
    background: rgba(180, 63, 63, 0.1);
    color: var(--danger);
  }
  .hint {
    color: var(--muted);
    font-size: 12px;
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .tab {
    padding: 9px 12px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.45);
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
  }
  .tab.active {
    background: var(--ink);
    color: #fff;
    border-color: var(--ink);
  }
  .viewer {
    display: grid;
    gap: 14px;
  }
  .pane {
    border: 1px solid var(--line);
    border-radius: 18px;
    overflow: hidden;
    background: rgba(253, 250, 244, 0.84);
  }
  .pane-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
    background: rgba(31, 42, 31, 0.03);
  }
  .pane-head strong {
    font-size: 13px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  pre {
    margin: 0;
    padding: 16px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    background: rgba(255, 255, 255, 0.62);
    color: #203124;
    font-size: 13px;
    line-height: 1.55;
  }
  .mini {
    display: grid;
    gap: 10px;
  }
  .endpoints {
    display: grid;
    gap: 10px;
  }
  .endpoint {
    padding: 12px 14px;
    border-radius: 16px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.5);
  }
  .endpoint strong {
    display: inline-block;
    min-width: 52px;
    color: var(--accent);
  }
  code {
    padding: 2px 6px;
    border-radius: 8px;
    background: rgba(31, 42, 31, 0.07);
    font-size: 0.92em;
  }
  .notice {
    padding: 14px 16px;
    border-radius: 16px;
    background: rgba(184, 106, 50, 0.1);
    color: #7b451f;
    border: 1px solid rgba(184, 106, 50, 0.18);
    font-size: 13px;
  }
  @media (max-width: 960px) {
    .grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<div class="shell">
  <section class="hero">
    <div class="hero-top">
      <span class="badge">GLM Free API Neo</span>
      <span class="pill">${apiKeyEnabled ? "API Key Enabled" : "Open Access Mode"}</span>
    </div>
    <div>
      <h1>浏览器里直接验证兼容层</h1>
      <p class="sub">这个页面不是文档页，而是一个最小测试台。你可以切 OpenAI 或 Claude 模式，发普通消息、开流式、带工具定义，然后立刻看到请求体、原始响应和解析结果，确认刚加的兼容功能到底有没有生效。</p>
    </div>
    ${apiKeyEnabled ? '<div class="notice">当前服务已开启访问秘钥。下面测试时请填写 <code>Authorization: Bearer &lt;your-key&gt;</code> 对应的 Key，或者直接填到 API Key 输入框。</div>' : '<div class="notice">当前服务未开启访问秘钥，可以直接在页面里发请求测试。</div>'}
  </section>

  <div class="grid">
    <section class="card">
      <div class="card-head">
        <h2>测试面板</h2>
        <span class="meta">在浏览器里发真实请求</span>
      </div>
      <div class="card-body stack">
        <div class="row">
          <label for="mode">协议模式</label>
          <div class="tabs" id="modeTabs">
            <button type="button" class="tab active" data-mode="openai">OpenAI</button>
            <button type="button" class="tab" data-mode="claude">Claude</button>
          </div>
        </div>

        <div class="row">
          <label for="apiKey">API Key</label>
          <input id="apiKey" type="password" placeholder="${apiKeyEnabled ? "输入访问秘钥" : "如果你后面启用了 API Key，这里再填"}" />
        </div>

        <div class="row">
          <label for="model">模型名</label>
          <input id="model" type="text" value="claude-sonnet-4-6" />
          <div class="hint">这里可以直接填别名，例如 <code>claude-sonnet-4-6</code>、<code>gpt-4o</code>、<code>glm-5</code>。</div>
        </div>

        <div class="row">
          <label for="system">System / 指令</label>
          <textarea id="system" rows="4" placeholder="可选。Claude 模式会走 system 字段，OpenAI 模式会插入 system message。">你是一个用于验证兼容性的测试助手。</textarea>
        </div>

        <div class="row">
          <label for="prompt">用户输入</label>
          <textarea id="prompt" rows="6" placeholder="输入一段消息，或者让它调用工具。">请先简单自我介绍，然后告诉我你当前支持哪些接口格式。</textarea>
        </div>

        <div class="row">
          <label for="tools">工具定义 JSON</label>
          <textarea id="tools" rows="10" placeholder="留空表示不带工具。">${`[
  {
    "name": "get_weather",
    "description": "查询天气",
    "input_schema": {
      "type": "object",
      "properties": {
        "location": { "type": "string", "description": "城市名" }
      },
      "required": ["location"]
    }
  }
]`}</textarea>
          <div class="hint">Claude 模式按 <code>tools[].input_schema</code> 发；OpenAI 模式会自动转成 function tools。</div>
        </div>

        <div class="row">
          <label for="toolResults">Claude tool_result JSON</label>
          <textarea id="toolResults" rows="8" placeholder="只在 Claude 多轮工具测试时使用。">${`[]`}</textarea>
          <div class="hint">如果你要验证 Claude 的 <code>tool_result</code> 兼容，可以把上一次响应里的 <code>tool_use</code> id 填回来。</div>
        </div>

        <div class="status">
          <strong>选项</strong>
          <label><input id="stream" type="checkbox" checked /> 流式</label>
          <label><input id="includeTools" type="checkbox" checked /> 带工具</label>
          <label><input id="includeSystem" type="checkbox" checked /> 带系统提示</label>
        </div>

        <div class="toolbar">
          <button id="sendBtn" class="primary" type="button">发送测试请求</button>
          <button id="countBtn" class="secondary" type="button">Claude Count Tokens</button>
          <button id="clearBtn" class="ghost" type="button">清空结果</button>
        </div>
      </div>
    </section>

    <section class="viewer">
      <div class="card">
        <div class="card-head">
          <h2>运行状态</h2>
          <span id="statusPill" class="pill">Idle</span>
        </div>
        <div class="card-body mini">
          <div class="status">
            <strong>最近一次路径</strong>
            <code id="lastPath">-</code>
          </div>
          <div class="status">
            <strong>HTTP 状态</strong>
            <code id="httpStatus">-</code>
          </div>
          <div class="status">
            <strong>兼容检查点</strong>
            <span id="compatHint" class="meta">还没有发起测试</span>
          </div>
        </div>
      </div>

      <div class="pane">
        <div class="pane-head">
          <strong>请求体</strong>
          <button class="ghost" type="button" id="copyRequestBtn">复制</button>
        </div>
        <pre id="requestPreview">尚未生成请求</pre>
      </div>

      <div class="pane">
        <div class="pane-head">
          <strong>流式事件 / 原始响应</strong>
          <button class="ghost" type="button" id="copyRawBtn">复制</button>
        </div>
        <pre id="rawOutput">尚未发送请求</pre>
      </div>

      <div class="pane">
        <div class="pane-head">
          <strong>解析结果</strong>
          <button class="ghost" type="button" id="copyParsedBtn">复制</button>
        </div>
        <pre id="parsedOutput">尚未解析</pre>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>支持的关键接口</h2>
          <span class="meta">用于页面内测试</span>
        </div>
        <div class="card-body endpoints">
          <div class="endpoint"><strong>POST</strong> <code>/v1/chat/completions</code></div>
          <div class="endpoint"><strong>POST</strong> <code>/anthropic/v1/messages</code></div>
          <div class="endpoint"><strong>POST</strong> <code>/anthropic/v1/messages/count_tokens</code></div>
          <div class="endpoint"><strong>GET</strong> <code>/anthropic/v1/models</code></div>
          <div class="endpoint"><strong>GET</strong> <code>/v1/models</code></div>
        </div>
      </div>
    </section>
  </div>
</div>

<script>
(() => {
  const state = { mode: "openai", abortController: null };
  const els = {
    apiKey: document.getElementById("apiKey"),
    model: document.getElementById("model"),
    system: document.getElementById("system"),
    prompt: document.getElementById("prompt"),
    tools: document.getElementById("tools"),
    toolResults: document.getElementById("toolResults"),
    stream: document.getElementById("stream"),
    includeTools: document.getElementById("includeTools"),
    includeSystem: document.getElementById("includeSystem"),
    sendBtn: document.getElementById("sendBtn"),
    countBtn: document.getElementById("countBtn"),
    clearBtn: document.getElementById("clearBtn"),
    requestPreview: document.getElementById("requestPreview"),
    rawOutput: document.getElementById("rawOutput"),
    parsedOutput: document.getElementById("parsedOutput"),
    statusPill: document.getElementById("statusPill"),
    lastPath: document.getElementById("lastPath"),
    httpStatus: document.getElementById("httpStatus"),
    compatHint: document.getElementById("compatHint"),
    copyRequestBtn: document.getElementById("copyRequestBtn"),
    copyRawBtn: document.getElementById("copyRawBtn"),
    copyParsedBtn: document.getElementById("copyParsedBtn"),
  };

  const tabs = Array.from(document.querySelectorAll("[data-mode]"));

  function setMode(mode) {
    state.mode = mode;
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
    els.model.value = mode === "claude" ? "claude-sonnet-4-6" : "gpt-4o";
    els.compatHint.textContent = mode === "claude"
      ? "Claude 模式会验证 messages、tool_use、tool_result、count_tokens。"
      : "OpenAI 模式会验证 chat completions 和模型别名映射。";
  }

  function setStatus(text, isError = false) {
    els.statusPill.textContent = text;
    els.statusPill.classList.toggle("error", isError);
  }

  function parseJsonInput(text, fallback) {
    const raw = String(text || "").trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  }

  function buildMessages() {
    const prompt = els.prompt.value.trim();
    const toolResults = parseJsonInput(els.toolResults.value, []);
    const messages = [];

    if (state.mode === "claude") {
      if (prompt) {
        messages.push({ role: "user", content: [{ type: "text", text: prompt }] });
      }
      if (Array.isArray(toolResults) && toolResults.length > 0) {
        messages.push({ role: "user", content: toolResults });
      }
      return messages;
    }

    if (els.includeSystem.checked && els.system.value.trim()) {
      messages.push({ role: "system", content: els.system.value.trim() });
    }
    if (prompt) {
      messages.push({ role: "user", content: prompt });
    }
    return messages;
  }

  function buildPayload() {
    const model = els.model.value.trim();
    const systemText = els.system.value.trim();
    const stream = !!els.stream.checked;
    const tools = els.includeTools.checked ? parseJsonInput(els.tools.value, []) : [];

    if (state.mode === "claude") {
      const payload = {
        model,
        stream,
        messages: buildMessages(),
      };
      if (els.includeSystem.checked && systemText) payload.system = systemText;
      if (Array.isArray(tools) && tools.length > 0) payload.tools = tools;
      return payload;
    }

    const payload = {
      model,
      stream,
      messages: buildMessages(),
    };
    if (Array.isArray(tools) && tools.length > 0) payload.tools = tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema || tool.parameters || { type: "object", properties: {} },
      },
    }));
    return payload;
  }

  function buildHeaders() {
    const headers = { "Content-Type": "application/json" };
    const apiKey = els.apiKey.value.trim();
    if (apiKey) {
      headers.Authorization = "Bearer " + apiKey;
      headers["x-api-key"] = apiKey;
    }
    if (state.mode === "claude") {
      headers["anthropic-version"] = "2023-06-01";
    }
    return headers;
  }

  function render(obj) {
    return typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied");
      setTimeout(() => setStatus("Idle"), 900);
    } catch {
      setStatus("Copy failed", true);
    }
  }

  async function runCountTokens() {
    try {
      setStatus("Calling count_tokens");
      const payload = {
        model: els.model.value.trim() || "claude-sonnet-4-6",
        messages: buildMessages(),
      };
      if (els.includeSystem.checked && els.system.value.trim()) {
        payload.system = els.system.value.trim();
      }
      els.requestPreview.textContent = render(payload);
      els.lastPath.textContent = "/anthropic/v1/messages/count_tokens";
      const response = await fetch("/anthropic/v1/messages/count_tokens", {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      els.httpStatus.textContent = String(response.status);
      els.rawOutput.textContent = text;
      try {
        els.parsedOutput.textContent = render(JSON.parse(text));
      } catch {
        els.parsedOutput.textContent = text;
      }
      setStatus(response.ok ? "count_tokens ok" : "count_tokens failed", !response.ok);
    } catch (error) {
      els.httpStatus.textContent = "network error";
      els.rawOutput.textContent = String(error);
      els.parsedOutput.textContent = String(error);
      setStatus("count_tokens error", true);
    }
  }

  async function runRequest() {
    if (state.abortController) {
      state.abortController.abort();
    }
    const controller = new AbortController();
    state.abortController = controller;

    const payload = buildPayload();
    const path = state.mode === "claude" ? "/anthropic/v1/messages" : "/v1/chat/completions";
    const expectsStream = !!payload.stream;

    els.requestPreview.textContent = render(payload);
    els.rawOutput.textContent = "";
    els.parsedOutput.textContent = "";
    els.lastPath.textContent = path;
    els.httpStatus.textContent = "-";
    setStatus("Requesting");

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      els.httpStatus.textContent = String(response.status);

      if (!expectsStream) {
        const text = await response.text();
        els.rawOutput.textContent = text;
        try {
          const parsed = JSON.parse(text);
          els.parsedOutput.textContent = render(parsed);
          if (state.mode === "claude") {
            const hasToolUse = Array.isArray(parsed.content) && parsed.content.some((item) => item.type === "tool_use");
            els.compatHint.textContent = hasToolUse
              ? "检测到 Claude tool_use 响应，工具兼容链路已触发。"
              : "收到非流式响应，可以继续验证模型回显、错误体和 content 结构。";
          }
        } catch {
          els.parsedOutput.textContent = text;
        }
        setStatus(response.ok ? "Completed" : "Failed", !response.ok);
        return;
      }

      const reader = response.body && response.body.getReader ? response.body.getReader() : null;
      if (!reader) {
        const text = await response.text();
        els.rawOutput.textContent = text;
        els.parsedOutput.textContent = text;
        setStatus("No stream body", true);
        return;
      }

      const decoder = new TextDecoder();
      let raw = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        els.rawOutput.textContent = raw;
      }

      if (state.mode === "claude") {
        const events = raw
          .split("\\n\\n")
          .map((chunk) => chunk.trim())
          .filter(Boolean)
          .map((chunk) => {
            const lines = chunk.split("\\n");
            const eventLine = lines.find((line) => line.startsWith("event: "));
            const dataLine = lines.find((line) => line.startsWith("data: "));
            const event = eventLine ? eventLine.slice(7) : "message";
            const dataText = dataLine ? dataLine.slice(6) : "";
            try {
              return { event, data: JSON.parse(dataText) };
            } catch {
              return { event, data: dataText };
            }
          });
        els.parsedOutput.textContent = render(events);
        const hasToolEvent = events.some((item) => item.event === "content_block_start" && item.data && item.data.content_block && item.data.content_block.type === "tool_use");
        const hasErrorEvent = events.some((item) => item.event === "error");
        if (hasErrorEvent) {
          els.compatHint.textContent = "Claude 流式 error 事件已返回，说明错误体兼容已生效。";
        } else if (hasToolEvent) {
          els.compatHint.textContent = "Claude 流式 tool_use 事件已返回，说明工具事件兼容已生效。";
        } else {
          els.compatHint.textContent = "Claude 流式事件已返回，可检查 message_start / text_delta / message_stop。";
        }
      } else {
        const frames = raw
          .split("\\n\\n")
          .map((chunk) => chunk.trim())
          .filter(Boolean)
          .map((chunk) => chunk.startsWith("data: ") ? chunk.slice(6) : chunk)
          .map((chunk) => {
            if (chunk === "[DONE]") return chunk;
            try {
              return JSON.parse(chunk);
            } catch {
              return chunk;
            }
          });
        els.parsedOutput.textContent = render(frames);
        els.compatHint.textContent = "OpenAI 流式数据已返回，可检查 delta、finish_reason 和模型映射。";
      }

      setStatus(response.ok ? "Stream completed" : "Stream failed", !response.ok);
    } catch (error) {
      const message = error && error.name === "AbortError" ? "Request aborted" : String(error);
      els.rawOutput.textContent = message;
      els.parsedOutput.textContent = message;
      els.httpStatus.textContent = "network error";
      setStatus("Request error", true);
    } finally {
      if (state.abortController === controller) {
        state.abortController = null;
      }
    }
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
  els.sendBtn.addEventListener("click", runRequest);
  els.countBtn.addEventListener("click", runCountTokens);
  els.clearBtn.addEventListener("click", () => {
    els.rawOutput.textContent = "已清空";
    els.parsedOutput.textContent = "已清空";
    els.requestPreview.textContent = "已清空";
    els.httpStatus.textContent = "-";
    els.lastPath.textContent = "-";
    els.compatHint.textContent = "等待下一次测试";
    setStatus("Idle");
  });
  els.copyRequestBtn.addEventListener("click", () => copyText(els.requestPreview.textContent));
  els.copyRawBtn.addEventListener("click", () => copyText(els.rawOutput.textContent));
  els.copyParsedBtn.addEventListener("click", () => copyText(els.parsedOutput.textContent));

  setMode("openai");
})();
</script>
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
