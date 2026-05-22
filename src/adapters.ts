import { uuid, isArray, isObject, isString } from "./utils.ts";
import { createParser } from "./sse.ts";
import {
  createCompletion,
  createCompletionStream,
} from "./chat.ts";

const MODEL_NAME = "glm";

// ==================== Claude Adapter ====================

type ClaudeToolCallState = {
  nameById: Record<string, string>;
  lastIdByName: Record<string, string>;
};

function normalizeClaudeModelName(model?: string): string {
  return typeof model === "string" && model.trim() ? model.trim() : MODEL_NAME;
}

function safeJsonStringify(value: any): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? "");
  }
}

function safeJsonParse(value: any): any {
  if (!isString(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function buildDataUrl(source: any): string | null {
  if (!isObject(source)) return null;
  if (source.type === "url" && isString(source.url) && source.url.trim()) {
    return source.url.trim();
  }
  if (source.type === "base64" && isString(source.data) && source.data.trim()) {
    const mediaType = isString(source.media_type) && source.media_type.trim()
      ? source.media_type.trim()
      : "application/octet-stream";
    return `data:${mediaType};base64,${source.data.trim()}`;
  }
  return null;
}

function createClaudeToolCallState(): ClaudeToolCallState {
  return {
    nameById: {},
    lastIdByName: {},
  };
}

function rememberClaudeToolCall(state: ClaudeToolCallState, callId: string, name: string) {
  if (!callId || !name) return;
  state.nameById[callId] = name;
  state.lastIdByName[name.toLowerCase()] = callId;
}

function stringifyClaudeUnknownBlock(block: any): string {
  if (block == null) return "";
  return safeJsonStringify(block);
}

function extractClaudeThinkingText(block: any): string {
  if (!isObject(block)) return "";
  if (isString(block.thinking) && block.thinking.trim()) return block.thinking;
  if (isString(block.text) && block.text.trim()) return block.text;
  if (isString(block.content) && block.content.trim()) return block.content;
  return "";
}

function stringifyClaudeToolResultContent(content: any): string {
  if (isString(content)) return content;
  if (isArray(content)) {
    const hasNonText = content.some((item: any) => item?.type && item.type !== "text");
    if (!hasNonText) {
      return content.map((item: any) => item?.type === "text" && isString(item.text) ? item.text : "")
        .filter(Boolean)
        .join("\n");
    }
    return safeJsonStringify({ type: "tool_result", content });
  }
  if (content == null) return "";
  return safeJsonStringify({ type: "tool_result", content });
}

function pushClaudeUserContentPart(parts: any[], item: any) {
  if (!isObject(item)) return;

  if (item.type === "text" && isString(item.text)) {
    parts.push({ type: "text", text: item.text });
    return;
  }

  if (item.type === "thinking") {
    const thinkingText = extractClaudeThinkingText(item);
    if (thinkingText) {
      parts.push({ type: "text", text: thinkingText });
    }
    return;
  }

  if (item.type === "image") {
    const url = buildDataUrl(item.source);
    if (url) {
      parts.push({ type: "image_url", image_url: { url } });
    }
    return;
  }

  if (item.type === "document") {
    const url = buildDataUrl(item.source);
    if (url) {
      parts.push({ type: "file", file_url: { url } });
    }
    return;
  }

  const raw = stringifyClaudeUnknownBlock(item);
  if (raw) {
    parts.push({ type: "text", text: raw });
  }
}

function flushClaudeUserParts(glmMessages: any[], parts: any[]) {
  if (parts.length === 0) return;

  const snapshot = parts.splice(0, parts.length);
  const filtered = snapshot.filter((part: any) => {
    if (part?.type === "text") return isString(part.text) && part.text !== "";
    return true;
  });
  if (filtered.length === 0) return;

  const hasAttachment = filtered.some((part: any) => part.type === "image_url" || part.type === "file");
  if (!hasAttachment) {
    glmMessages.push({
      role: "user",
      content: filtered
        .filter((part: any) => part.type === "text")
        .map((part: any) => part.text)
        .join("\n"),
    });
    return;
  }

  glmMessages.push({ role: "user", content: filtered });
}

function normalizeClaudeToolUse(item: any, state: ClaudeToolCallState): any | null {
  if (!isObject(item) || !isString(item.name) || !item.name.trim()) return null;

  const callId = (isString(item.id) && item.id.trim())
    || (isString(item.tool_use_id) && item.tool_use_id.trim())
    || `call_${uuid(false)}`;
  const name = item.name.trim();
  rememberClaudeToolCall(state, callId, name);

  return {
    id: callId,
    type: "function",
    function: {
      name,
      arguments: safeJsonStringify(item.input || {}),
    },
  };
}

function normalizeClaudeToolResultMessage(item: any, state: ClaudeToolCallState): any | null {
  if (!isObject(item)) return null;

  let toolCallId = "";
  if (isString(item.tool_use_id) && item.tool_use_id.trim()) {
    toolCallId = item.tool_use_id.trim();
  } else if (isString(item.tool_call_id) && item.tool_call_id.trim()) {
    toolCallId = item.tool_call_id.trim();
  }

  let name = isString(item.name) && item.name.trim() ? item.name.trim() : "";
  if (!toolCallId && name) {
    toolCallId = state.lastIdByName[name.toLowerCase()] || "";
  }
  if (!toolCallId) {
    toolCallId = `call_${uuid(false)}`;
  }
  if (!name) {
    name = state.nameById[toolCallId] || "";
  }
  rememberClaudeToolCall(state, toolCallId, name);

  const toolMessage: any = {
    role: "tool",
    tool_call_id: toolCallId,
    content: stringifyClaudeToolResultContent(item.content),
  };
  if (name) {
    toolMessage.name = name;
  }
  return toolMessage;
}

function flushClaudeAssistantText(glmMessages: any[], textParts: string[]) {
  if (textParts.length === 0) return;
  const text = textParts.join("\n");
  textParts.splice(0, textParts.length);
  if (!text) return;
  glmMessages.push({ role: "assistant", content: text });
}

function flushClaudeAssistantToolCalls(glmMessages: any[], toolCalls: any[]) {
  if (toolCalls.length === 0) return;
  glmMessages.push({
    role: "assistant",
    content: "",
    tool_calls: toolCalls.splice(0, toolCalls.length),
  });
}

function convertClaudeAssistantContent(content: any, glmMessages: any[], state: ClaudeToolCallState) {
  if (!isArray(content)) {
    glmMessages.push({ role: "assistant", content: content ?? "" });
    return;
  }

  const textParts: string[] = [];
  const toolCalls: any[] = [];

  for (const item of content) {
    if (!isObject(item)) continue;

    if (item.type === "tool_use") {
      flushClaudeAssistantText(glmMessages, textParts);
      const toolCall = normalizeClaudeToolUse(item, state);
      if (toolCall) {
        toolCalls.push(toolCall);
      }
      continue;
    }

    if (toolCalls.length > 0) {
      flushClaudeAssistantToolCalls(glmMessages, toolCalls);
    }

    if (item.type === "text" && isString(item.text)) {
      textParts.push(item.text);
      continue;
    }

    if (item.type === "thinking") {
      const thinkingText = extractClaudeThinkingText(item);
      if (thinkingText) {
        textParts.push(thinkingText);
      }
      continue;
    }

    const raw = stringifyClaudeUnknownBlock(item);
    if (raw) {
      textParts.push(raw);
    }
  }

  flushClaudeAssistantText(glmMessages, textParts);
  flushClaudeAssistantToolCalls(glmMessages, toolCalls);
}

function convertClaudeUserContent(content: any, glmMessages: any[], state: ClaudeToolCallState) {
  if (!isArray(content)) {
    glmMessages.push({ role: "user", content: content ?? "" });
    return;
  }

  const parts: any[] = [];
  for (const item of content) {
    if (isObject(item) && item.type === "tool_result") {
      flushClaudeUserParts(glmMessages, parts);
      const toolMessage = normalizeClaudeToolResultMessage(item, state);
      if (toolMessage) {
        glmMessages.push(toolMessage);
      }
      continue;
    }

    pushClaudeUserContentPart(parts, item);
  }

  flushClaudeUserParts(glmMessages, parts);
}

export function convertClaudeToGLM(messages: any[], system?: string | any[]): any[] {
  const glmMessages: any[] = [];
  const toolCallState = createClaudeToolCallState();
  let systemText: string | undefined;
  if (system) {
    if (Array.isArray(system)) {
      systemText = system.filter((item: any) => item.type === "text").map((item: any) => item.text).join("\n");
    } else if (typeof system === "string") {
      systemText = system;
    }
  }
  // 保留 system 消息，让 injectToolsPrompt 能正确追加工具提示
  if (systemText) {
    glmMessages.push({ role: "system", content: systemText });
  }
  for (const msg of messages) {
    if (msg.role === "user") {
      convertClaudeUserContent(msg.content ?? "", glmMessages, toolCallState);
    } else if (msg.role === "assistant") {
      convertClaudeAssistantContent(msg.content ?? "", glmMessages, toolCallState);
    } else if (msg.role === "tool") {
      glmMessages.push(msg);
    } else if (msg?.content != null) {
      glmMessages.push({ role: msg.role, content: msg.content });
    }
  }
  return glmMessages;
}

function convertClaudeToolsToOpenAI(tools: any[]): any[] {
  return tools.map((tool: any) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema || tool.parameters || {},
    },
  }));
}

export function convertGLMToClaude(glmResponse: any, responseModel?: string): any {
  const message = glmResponse.choices[0].message;
  const content: any[] = [];
  if (message.content) {
    content.push({ type: "text", text: message.content });
  }
  if (message.tool_calls) {
    for (const tc of message.tool_calls) {
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input: safeJsonParse(tc.function.arguments),
      });
    }
  }
  let stopReason = "end_turn";
  if (glmResponse.choices[0].finish_reason === "tool_calls") stopReason = "tool_use";
  else if (glmResponse.choices[0].finish_reason !== "stop") stopReason = "max_tokens";
  return {
    id: glmResponse.id || uuid(),
    type: "message",
    role: "assistant",
    content,
    model: normalizeClaudeModelName(responseModel || glmResponse.model),
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: glmResponse.usage?.prompt_tokens || 0,
      output_tokens: glmResponse.usage?.completion_tokens || 0,
    },
  };
}

export function convertGLMStreamToClaude(glmStream: ReadableStream, responseModel?: string): ReadableStream {
  const encoder = new TextEncoder();
  const resolvedModel = normalizeClaudeModelName(responseModel);
  return new ReadableStream({
    async start(controller) {
      const reader = glmStream.getReader();
      const decoder = new TextDecoder();
      const messageId = uuid();
      let isFirstChunk = true;
      let textBlockStarted = false;
      let textBlockUsed = false;
      let toolBlockIndex = -1;
      let toolBlockStarted = false;
      let sentToolIds = new Set<string>();
      let streamClosed = false;
      let lastUsage = { prompt_tokens: 0, completion_tokens: 0 };

      const safeEnqueue = (data: Uint8Array) => {
        if (!streamClosed) controller.enqueue(data);
      };

      const sendMessageStart = () => {
        safeEnqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify({
          type: "message_start",
          message: {
            id: messageId, type: "message", role: "assistant", content: [],
            model: resolvedModel, stop_reason: null, stop_sequence: null,
            usage: { input_tokens: lastUsage.prompt_tokens || 0, output_tokens: 0 },
          },
        })}\n\n`));
      };

      const sendTextBlockStart = () => {
        if (textBlockStarted) return;
        textBlockStarted = true;
        textBlockUsed = true;
        safeEnqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({
          type: "content_block_start", index: 0, content_block: { type: "text", text: "" },
        })}\n\n`));
      };

      const sendTextDelta = (text: string) => {
        safeEnqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({
          type: "content_block_delta", index: 0, delta: { type: "text_delta", text },
        })}\n\n`));
      };

      const sendTextBlockStop = () => {
        if (!textBlockStarted) return;
        textBlockStarted = false;
        safeEnqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({
          type: "content_block_stop", index: 0,
        })}\n\n`));
      };

      const sendToolBlockStart = (toolCall: any, idx: number) => {
        if (sentToolIds.has(toolCall.id)) return;
        sentToolIds.add(toolCall.id);
        toolBlockIndex = idx;
        toolBlockStarted = true;
        safeEnqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({
          type: "content_block_start",
          index: idx,
          content_block: {
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.function?.name || "",
            input: {},
          },
        })}\n\n`));
      };

      const sendToolDelta = (partialJson: string, idx: number) => {
        safeEnqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({
          type: "content_block_delta",
          index: idx,
          delta: { type: "input_json_delta", partial_json: partialJson },
        })}\n\n`));
      };

      const sendToolBlockStop = (idx: number) => {
        if (!toolBlockStarted) return;
        toolBlockStarted = false;
        safeEnqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({
          type: "content_block_stop", index: idx,
        })}\n\n`));
      };

      const sendErrorEvent = (message: string, code = "internal_error", type = "api_error") => {
        if (streamClosed) return;
        streamClosed = true;
        safeEnqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({
          type: "error",
          error: { type, message, code, param: null },
        })}\n\n`));
        controller.close();
      };

      const sendMessageStop = (stopReason: string) => {
        if (streamClosed) return;
        streamClosed = true;
        safeEnqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({
          type: "message_delta",
          delta: { stop_reason: stopReason, stop_sequence: null },
          usage: { output_tokens: lastUsage.completion_tokens || 0 },
        })}\n\n`));
        safeEnqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({
          type: "message_stop",
        })}\n\n`));
        controller.close();
      };

      const parser = createParser((event) => {
        try {
          if (!event.data || event.data === "[DONE]") {
            if (!streamClosed && !isFirstChunk) {
              sendTextBlockStop();
              if (toolBlockStarted) sendToolBlockStop(toolBlockIndex);
              sendMessageStop("end_turn");
            }
            return;
          }

          if (!event.data.trim().startsWith("{")) {
            return;
          }

          const data = JSON.parse(event.data);
          if (data.error) {
            sendErrorEvent(data.error.message || "upstream stream error");
            return;
          }
          if (data.choices && data.choices[0]) {
            const delta = data.choices[0].delta;
            const finishReason = data.choices[0].finish_reason;
            if (data.usage) {
              lastUsage = {
                prompt_tokens: data.usage.prompt_tokens || lastUsage.prompt_tokens,
                completion_tokens: data.usage.completion_tokens || lastUsage.completion_tokens,
              };
            }

            if (isFirstChunk) {
              sendMessageStart();
              isFirstChunk = false;
            }

            // 处理文本内容
            if (delta.content) {
              sendTextBlockStart();
              sendTextDelta(delta.content);
            }

            // 处理工具调用（在 finish 时一次性发送）
            if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
              const baseIndex = textBlockUsed ? 1 : 0;
              if (textBlockStarted) {
                sendTextBlockStop();
              }
              delta.tool_calls.forEach((tc: any, i: number) => {
                const idx = baseIndex + i;
                sendToolBlockStart(tc, idx);
                const args = typeof tc.function?.arguments === "string"
                  ? tc.function.arguments
                  : JSON.stringify(tc.function?.arguments || {});
                sendToolDelta(args, idx);
                sendToolBlockStop(idx);
              });
            }

            // finish
            if (finishReason) {
              let stopReason = "end_turn";
              if (finishReason === "tool_calls") stopReason = "tool_use";
              else if (finishReason !== "stop") stopReason = "max_tokens";

              sendTextBlockStop();
              // 如果还有未关闭的 tool block，关闭它
              if (toolBlockStarted) {
                sendToolBlockStop(toolBlockIndex);
              }
              sendMessageStop(stopReason);
            }
          }
        } catch (err) {
          controller.error(err);
        }
      });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (!isFirstChunk) {
              sendTextBlockStop();
              if (toolBlockStarted) sendToolBlockStop(toolBlockIndex);
              sendMessageStop("end_turn");
            } else {
              controller.close();
            }
            break;
          }
          parser.feed(decoder.decode(value, { stream: true }));
        }
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

export async function createClaudeCompletion(
  model: string, messages: any[], system: string | any[] | undefined,
  refreshToken: string, stream = false, conversationId?: string, tools?: any[], responseModel?: string
): Promise<any | ReadableStream> {
  const glmMessages = convertClaudeToGLM(messages, system);
  const openaiTools = tools && tools.length > 0 ? convertClaudeToolsToOpenAI(tools) : undefined;
  const claudeResponseModel = normalizeClaudeModelName(responseModel || model);
  if (stream) {
    const glmStream = await createCompletionStream(glmMessages, refreshToken, model, conversationId, 0, openaiTools);
    return convertGLMStreamToClaude(glmStream, claudeResponseModel);
  } else {
    const glmResponse = await createCompletion(glmMessages, refreshToken, model, conversationId, 0, openaiTools);
    return convertGLMToClaude(glmResponse, claudeResponseModel);
  }
}

// ==================== Gemini Adapter ====================

export function convertGeminiToGLM(contents: any[], systemInstruction?: any): any[] {
  const glmMessages: any[] = [];
  let systemText = "";
  if (systemInstruction) {
    if (typeof systemInstruction === "string") {
      systemText = systemInstruction;
    } else if (systemInstruction.parts) {
      systemText = systemInstruction.parts.filter((part: any) => part.text).map((part: any) => part.text).join("\n");
    }
  }
  let systemPrepended = false;
  for (const content of contents) {
    const role = content.role === "model" ? "assistant" : "user";
    let text = "";
    if (content.parts && Array.isArray(content.parts)) {
      text = content.parts.filter((part: any) => part.text).map((part: any) => part.text).join("\n");
    }
    if (role === "user" && systemText && !systemPrepended) {
      text = `${systemText}\n\n${text}`;
      systemPrepended = true;
    }
    glmMessages.push({ role, content: text });
  }
  return glmMessages;
}

export function convertGLMToGemini(glmResponse: any): any {
  const content = glmResponse.choices[0].message.content;
  return {
    candidates: [{
      content: { parts: [{ text: content }], role: "model" },
      finishReason: glmResponse.choices[0].finish_reason === "stop" ? "STOP" : "MAX_TOKENS",
      index: 0,
      safetyRatings: [],
    }],
    usageMetadata: {
      promptTokenCount: glmResponse.usage?.prompt_tokens || 0,
      candidatesTokenCount: glmResponse.usage?.completion_tokens || 0,
      totalTokenCount: glmResponse.usage?.total_tokens || 0,
    },
  };
}

export function convertGLMStreamToGemini(glmStream: ReadableStream): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const reader = glmStream.getReader();
      const decoder = new TextDecoder();

      const parser = createParser((event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.choices && data.choices[0]) {
            const delta = data.choices[0].delta;
            if (delta.content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                candidates: [{ content: { parts: [{ text: delta.content }], role: "model" }, finishReason: null, index: 0, safetyRatings: [] }],
              })}\n\n`));
            }
            if (data.choices[0].finish_reason) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                candidates: [{ content: { parts: [{ text: "" }], role: "model" }, finishReason: "STOP", index: 0, safetyRatings: [] }],
                usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
              })}\n\n`));
              controller.close();
            }
          }
        } catch (err) {
          controller.error(err);
        }
      });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { controller.close(); break; }
          parser.feed(decoder.decode(value, { stream: true }));
        }
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

export async function createGeminiCompletion(
  model: string, contents: any[], systemInstruction: any,
  refreshToken: string, stream = false, conversationId?: string
): Promise<any | ReadableStream> {
  const glmMessages = convertGeminiToGLM(contents, systemInstruction);
  if (stream) {
    const glmStream = await createCompletionStream(glmMessages, refreshToken, model, conversationId);
    return convertGLMStreamToGemini(glmStream);
  } else {
    const glmResponse = await createCompletion(glmMessages, refreshToken, model, conversationId);
    return convertGLMToGemini(glmResponse);
  }
}
