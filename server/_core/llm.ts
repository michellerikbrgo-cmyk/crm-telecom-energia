import OpenAI from "openai";
import {
  loadLlmKeyBundle,
  resolveChatBackendOrder,
} from "./openAiCredentials";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};


const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

function toOpenAiResponseFormat(
  params: InvokeParams
): OpenAI.Chat.ChatCompletionCreateParams["response_format"] | undefined {
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat: params.responseFormat,
    response_format: params.response_format,
    outputSchema: params.outputSchema,
    output_schema: params.output_schema,
  });
  if (!normalizedResponseFormat) return undefined;
  if (normalizedResponseFormat.type === "text") return undefined;
  if (normalizedResponseFormat.type === "json_object") {
    return { type: "json_object" };
  }
  if (normalizedResponseFormat.type === "json_schema") {
    const js = normalizedResponseFormat.json_schema;
    return {
      type: "json_schema",
      json_schema: {
        name: js.name,
        schema: js.schema as Record<string, unknown>,
        strict: js.strict ?? false,
      },
    };
  }
  return undefined;
}

function messagesToOpenAiCompat(
  messages: Message[]
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  for (const m of messages) {
    if (m.role === "tool" || m.role === "function") {
      const content = ensureArray(m.content)
        .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
        .join("\n");
      out.push({
        role: "tool",
        tool_call_id: m.tool_call_id ?? "tool",
        content,
      });
      continue;
    }

    const parts = ensureArray(m.content);
    const hasVision = parts.some(
      (p) =>
        typeof p === "object" &&
        p !== null &&
        "type" in p &&
        (p.type === "image_url" || p.type === "file_url")
    );

    if (m.role === "user" && hasVision) {
      const contentParts: OpenAI.Chat.ChatCompletionContentPart[] = [];
      for (const p of parts) {
        if (typeof p === "string") {
          contentParts.push({ type: "text", text: p });
        } else if (p.type === "text") {
          contentParts.push({ type: "text", text: p.text });
        } else if (p.type === "image_url") {
          contentParts.push({
            type: "image_url",
            image_url: {
              url: p.image_url.url,
              detail: p.image_url.detail,
            },
          });
        } else if (p.type === "file_url") {
          contentParts.push({
            type: "text",
            text: `[ficheiro: ${p.file_url.url}]`,
          });
        }
      }
      out.push({ role: "user", content: contentParts });
      continue;
    }

    const normalized = normalizeMessage(m);
    const c = normalized.content;
    if (m.role === "system") {
      out.push({
        role: "system",
        content: typeof c === "string" ? c : JSON.stringify(c),
      });
    } else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: typeof c === "string" ? c : JSON.stringify(c),
      });
    } else {
      out.push({
        role: "user",
        content: typeof c === "string" ? c : JSON.stringify(c),
      });
    }
  }
  return out;
}

async function invokeOpenAiChatCompletions(
  params: InvokeParams,
  apiKey: string
): Promise<InvokeResult> {
  const openai = new OpenAI({ apiKey });
  const messages = messagesToOpenAiCompat(params.messages);
  const maxTok = Math.min(
    params.maxTokens ?? params.max_tokens ?? 4096,
    16384
  );

  const body: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model: "gpt-4o-mini",
    messages,
    max_tokens: maxTok,
  };

  const rf = toOpenAiResponseFormat(params);
  if (rf) {
    body.response_format = rf;
  }

  if (params.tools?.length) {
    body.tools = params.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: (t.function.parameters ?? {}) as Record<string, unknown>,
      },
    }));
    const normalizedToolChoice = normalizeToolChoice(
      params.toolChoice || params.tool_choice,
      params.tools
    );
    if (normalizedToolChoice) {
      body.tool_choice =
        normalizedToolChoice as OpenAI.Chat.ChatCompletionToolChoiceOption;
    }
  }

  const completion = await openai.chat.completions.create(body);
  const ch = completion.choices[0];
  const rawContent = ch?.message?.content;
  const contentStr =
    typeof rawContent === "string"
      ? rawContent
      : rawContent === null || rawContent === undefined
        ? ""
        : "";

  return {
    id: completion.id,
    created: completion.created,
    model: completion.model,
    choices: [
      {
        index: 0,
        message: {
          role: (ch?.message?.role as Role) || "assistant",
          content: contentStr,
          tool_calls: ch?.message?.tool_calls?.flatMap((tc) =>
            tc.type === "function"
              ? [
                  {
                    id: tc.id,
                    type: "function" as const,
                    function: {
                      name: tc.function.name,
                      arguments: tc.function.arguments,
                    },
                  },
                ]
              : []
          ),
        },
        finish_reason: ch?.finish_reason ?? null,
      },
    ],
    usage: completion.usage
      ? {
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
          total_tokens: completion.usage.total_tokens,
        }
      : undefined,
  };
}

function textFromMessageContentPart(part: MessageContent): string {
  if (typeof part === "string") return part;
  if (part.type === "text") return part.text;
  if (part.type === "image_url") return `[Imagem: ${part.image_url.url}]`;
  if (part.type === "file_url") return `[Ficheiro: ${part.file_url.url}]`;
  return "";
}

function flattenMessageToText(message: Message): string {
  if (message.role === "tool" || message.role === "function") {
    const content = ensureArray(message.content)
      .map((part) =>
        typeof part === "string" ? part : JSON.stringify(part)
      )
      .join("\n");
    return `[${message.role}:${message.tool_call_id ?? "?"}]\n${content}`;
  }
  return ensureArray(message.content)
    .map((p) => textFromMessageContentPart(p))
    .filter(Boolean)
    .join("\n");
}

type GeminiApiContent = {
  role: "user" | "model";
  parts: Array<{ text: string }>;
};

function mergeGeminiContents(rows: GeminiApiContent[]): GeminiApiContent[] {
  const out: GeminiApiContent[] = [];
  for (const row of rows) {
    const text = row.parts.map((p) => p.text).join("\n");
    const last = out[out.length - 1];
    if (last && last.role === row.role) {
      last.parts = [{ text: `${last.parts[0]!.text}\n\n${text}` }];
    } else {
      out.push({ role: row.role, parts: [{ text }] });
    }
  }
  return out;
}

async function invokeGeminiChat(
  params: InvokeParams,
  apiKey: string
): Promise<InvokeResult> {
  const model =
    process.env.GEMINI_CHAT_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    "gemini-2.5-flash";

  const systemChunks: string[] = [];
  const geminiRuns: GeminiApiContent[] = [];

  for (const m of params.messages) {
    if (m.role === "system") {
      const t = flattenMessageToText(m).trim();
      if (t) systemChunks.push(t);
      continue;
    }
    const text = flattenMessageToText(m).trim();
    if (!text) continue;
    const role: "user" | "model" =
      m.role === "assistant" ? "model" : "user";
    geminiRuns.push({ role, parts: [{ text }] });
  }

  const maxTok = Math.min(
    params.maxTokens ?? params.max_tokens ?? 4096,
    8192
  );

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let contents = mergeGeminiContents(geminiRuns);
  const sysJoined = systemChunks.join("\n\n").trim();
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: maxTok,
    },
  };

  if (sysJoined && contents.length === 0) {
    contents = [{ role: "user", parts: [{ text: "Segue as instruções do sistema." }] }];
    body.contents = contents;
    body.systemInstruction = { parts: [{ text: sysJoined }] };
  } else if (sysJoined) {
    body.systemInstruction = { parts: [{ text: sysJoined }] };
  } else if (contents.length === 0) {
    throw new Error("Nenhum conteúdo de conversa para enviar ao Gemini.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const rawJson = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const errObj = rawJson.error as { message?: string } | undefined;
    const msg =
      errObj?.message ||
      (typeof rawJson === "object" ? JSON.stringify(rawJson) : response.statusText);
    throw new Error(`Gemini: ${response.status} – ${msg}`);
  }

  const candidates = rawJson.candidates as
    | Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>
    | undefined;
  const text =
    candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("") ?? "";

  const usageMetadata = rawJson.usageMetadata as
    | Record<string, number>
    | undefined;

  const now = Math.floor(Date.now() / 1000);
  return {
    id: `gemini-${now}`,
    created: now,
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: text ? "stop" : null,
      },
    ],
    usage:
      usageMetadata?.promptTokenCount != null ||
      usageMetadata?.candidatesTokenCount != null
        ? {
            prompt_tokens: usageMetadata.promptTokenCount ?? 0,
            completion_tokens: usageMetadata.candidatesTokenCount ?? 0,
            total_tokens:
              (usageMetadata.promptTokenCount ?? 0) +
              (usageMetadata.candidatesTokenCount ?? 0),
          }
        : undefined,
  };
}

function needsOpenAiExclusiveFeatures(params: InvokeParams): boolean {
  const rf = normalizeResponseFormat({
    responseFormat: params.responseFormat,
    response_format: params.response_format,
    outputSchema: params.outputSchema,
    output_schema: params.output_schema,
  });
  const hasStructured = !!(rf && rf.type !== "text");
  return !!(params.tools?.length || hasStructured);
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const bundle = await loadLlmKeyBundle();
  let order = await resolveChatBackendOrder(bundle);

  if (needsOpenAiExclusiveFeatures(params)) {
    order = order.filter((b) => b === "openai");
  }

  let lastErr: unknown;
  for (const backend of order) {
    try {
      if (backend === "openai") {
        if (!bundle.openaiKey)
          throw new Error("Sem chave OpenAI (formato sk-…).");
        return await invokeOpenAiChatCompletions(params, bundle.openaiKey);
      }
      if (backend === "gemini") {
        if (!bundle.geminiKey)
          throw new Error("Sem chave Gemini (formato AIza…).");
        return await invokeGeminiChat(params, bundle.geminiKey);
      }
    } catch (e) {
      lastErr = e;
      console.warn(`[invokeLLM] ${backend} falhou:`, e);
    }
  }

  if (lastErr instanceof Error) throw lastErr;
  throw new Error(
    "IA indisponível: configure **Gemini** (Super Admin ou GEMINI_API_KEY) e/ou **OpenAI** (OPENAI_API_KEY ou Super Admin, chave sk-…). No Super Admin, escolha o fornecedor preferido e guarde as chaves nos campos certos."
  );
}
