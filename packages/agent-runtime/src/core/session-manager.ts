import { randomUUID } from "node:crypto";
import type {
  Message as AgentMessage,
  AssistantMessage,
  ContentPart,
  Model,
  StopReason,
  ToolCall,
  ToolResultMessage,
  Usage,
  UserMessage,
} from "@dentaltrip-ai/ai";
import type { SessionDataEntry, SessionDataEntryType, SessionRepository } from "@dentaltrip-ai/core/session";
import { ZERO_USAGE } from "./usage.ts";

/**
 * Manages conversation sessions as append-only trees stored in database.
 *
 * Each session entry has an id and parentId forming a tree structure. The "leaf"
 * pointer tracks the current position. Appending creates a child of the current leaf.
 * Branching moves the leaf to an earlier entry, allowing new branches without
 * modifying history.
 *
 * Use buildSessionContext() to get the resolved message list for the LLM, which
 * handles compaction summaries and follows the path from root to current leaf.
 */

/** Persistence required by the append-only session manager. */
export type SessionManagerRepository = Pick<SessionRepository, "appendSessionData" | "listSessionData">;

/** Entry categories that represent durable session history instead of pointers. */
export type SessionHistoryEntryType = Exclude<SessionDataEntryType, "leaf">;

/** Options for creating a SessionManager. */
export interface SessionManagerOptions {
  readonly repository: SessionManagerRepository;
  readonly generateId?: () => string;
  readonly compactionSummaryPrefix?: string;
}

/** Input for appending a history entry under the current session leaf. */
export interface AppendSessionEntryInput {
  readonly id?: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly type: SessionHistoryEntryType;
  readonly payload: Record<string, unknown>;
  readonly schemaVersion?: number;
}

/** Input for appending an agent message under the current session leaf. */
export interface AppendSessionMessageInput {
  readonly id?: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly message: AgentMessage;
  readonly schemaVersion?: number;
}

/** Input for moving the current session leaf to an existing history entry. */
export interface BranchSessionInput {
  readonly id?: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly targetEntryId: string;
}
/** Input for explicitly setting the current session leaf pointer. */
export interface SetSessionLeafInput {
  readonly id?: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly targetEntryId: string;
}

/** Options that control session context reconstruction. */
export interface BuildSessionContextOptions {
  readonly model?: Model;
  readonly compactionSummaryPrefix?: string;
}

/** Resolved append-only session tree state. */
export interface SessionTreeState {
  readonly leafId: string | null;
  readonly path: ReadonlyArray<SessionDataEntry>;
}

/** Payload stored by append-only leaf pointer entries. */
export interface LeafPointerPayload extends Record<string, unknown> {
  readonly entryId: string | null;
}

/** Raised when a branch or leaf pointer references a missing session entry. */
export class SessionEntryNotFoundError extends Error {
  constructor(entryId: string) {
    super(`Session entry not found: ${entryId}`);
    this.name = "SessionEntryNotFoundError";
  }
}

/** Raised when a session entry parent chain contains a cycle. */
export class SessionTreeCycleError extends Error {
  constructor(entryId: string) {
    super(`Session tree contains a cycle at entry: ${entryId}`);
    this.name = "SessionTreeCycleError";
  }
}

const DEFAULT_COMPACTION_SUMMARY_PREFIX = "Conversation summary so far:\n";
const LEAF_POINTER_SCHEMA_VERSION = 1;
const STOP_REASONS: ReadonlySet<string> = new Set([
  "end_turn",
  "tool_use",
  "max_tokens",
  "stop_sequence",
  "error",
  "unknown",
  "stop",
  "length",
  "toolUse",
  "aborted",
]);

/** Coordinates append-only session tree writes and context reconstruction. */
export class SessionManager {
  private readonly repository: SessionManagerRepository;
  private readonly generateId: () => string;
  private readonly compactionSummaryPrefix: string;

  constructor(options: SessionManagerOptions) {
    this.repository = options.repository;
    this.generateId = options.generateId ?? randomUUID;
    this.compactionSummaryPrefix = options.compactionSummaryPrefix ?? DEFAULT_COMPACTION_SUMMARY_PREFIX;
  }

  /** Appends one history entry as a child of the current leaf and advances the leaf pointer. */
  async appendEntry(input: AppendSessionEntryInput): Promise<SessionDataEntry> {
    const entries = await this.repository.listSessionData(input.sessionId);
    const parentId = resolveCurrentLeafId(entries);
    const entry = await this.repository.appendSessionData({
      id: input.id ?? this.generateId(),
      sessionId: input.sessionId,
      userId: input.userId,
      parentId,
      type: input.type,
      payload: input.payload,
      schemaVersion: input.schemaVersion,
    });

    await this.appendLeafPointer({
      sessionId: input.sessionId,
      userId: input.userId,
      targetEntryId: entry.id,
    });

    return entry;
  }

  /** Appends one agent message as a session message entry. */
  async appendMessage(input: AppendSessionMessageInput): Promise<SessionDataEntry> {
    return this.appendEntry({
      id: input.id,
      sessionId: input.sessionId,
      userId: input.userId,
      type: "message",
      payload: { message: input.message },
      schemaVersion: input.schemaVersion,
    });
  }

  /** Moves the current leaf pointer to an earlier history entry without changing history. */
  async branchToEntry(input: BranchSessionInput): Promise<SessionDataEntry> {
    return this.setCurrentLeaf(input);
  }

  /** Sets the current leaf pointer to an existing history entry. */
  async setCurrentLeaf(input: SetSessionLeafInput): Promise<SessionDataEntry> {
    const entries = await this.repository.listSessionData(input.sessionId);
    const targetEntry = entries.find((entry) => entry.id === input.targetEntryId && entry.type !== "leaf");

    if (!targetEntry) {
      throw new SessionEntryNotFoundError(input.targetEntryId);
    }

    return this.appendLeafPointer({
      id: input.id,
      sessionId: input.sessionId,
      userId: input.userId,
      targetEntryId: targetEntry.id,
    });
  }

  /** Returns the current history leaf id for a session. */
  async getCurrentLeafId(sessionId: string): Promise<string | null> {
    const entries = await this.repository.listSessionData(sessionId);
    return resolveCurrentLeafId(entries);
  }

  /** Loads session data and resolves the active message context for an LLM call. */
  async buildSessionContext(input: { readonly sessionId: string; readonly model?: Model }): Promise<AgentMessage[]> {
    const entries = await this.repository.listSessionData(input.sessionId);
    return buildSessionContext(entries, {
      model: input.model,
      compactionSummaryPrefix: this.compactionSummaryPrefix,
    });
  }

  private async appendLeafPointer(input: {
    readonly id?: string;
    readonly sessionId: string;
    readonly userId: string;
    readonly targetEntryId: string;
  }): Promise<SessionDataEntry> {
    return this.repository.appendSessionData({
      id: input.id ?? this.generateId(),
      sessionId: input.sessionId,
      userId: input.userId,
      parentId: input.targetEntryId,
      type: "leaf",
      payload: createLeafPointerPayload(input.targetEntryId),
      schemaVersion: LEAF_POINTER_SCHEMA_VERSION,
    });
  }
}

/** Creates the persisted payload for a leaf pointer entry. */
export function createLeafPointerPayload(entryId: string | null): LeafPointerPayload {
  return { entryId };
}

/** Resolves the current leaf id by replaying append and leaf-pointer operations. */
export function resolveCurrentLeafId(entries: ReadonlyArray<SessionDataEntry>): string | null {
  const sortedEntries = sortSessionEntries(entries);
  const knownEntryIds = new Set(sortedEntries.map((entry) => entry.id));
  let leafId: string | null = null;
  let sawLeafPointer = false;

  for (const entry of sortedEntries) {
    if (entry.type === "leaf") {
      const pointedEntryId = parseLeafPointerPayload(entry.payload);

      if (pointedEntryId === undefined) {
        continue;
      }

      if (pointedEntryId !== null && !knownEntryIds.has(pointedEntryId)) {
        continue;
      }

      leafId = pointedEntryId;
      sawLeafPointer = true;
      continue;
    }

    if (!sawLeafPointer || entry.parentId === leafId) {
      leafId = entry.id;
    }
  }

  return leafId;
}

/** Resolves the current leaf and root-to-leaf history path for a session tree. */
export function resolveSessionTreeState(entries: ReadonlyArray<SessionDataEntry>): SessionTreeState {
  const sortedEntries = sortSessionEntries(entries);
  const leafId = resolveCurrentLeafId(sortedEntries);
  const path = buildSessionEntryPath(sortedEntries, leafId);

  return { leafId, path };
}

/** Returns the active root-to-leaf history entries, excluding leaf pointer entries. */
export function buildSessionEntryPath(
  entries: ReadonlyArray<SessionDataEntry>,
  leafId: string | null = resolveCurrentLeafId(entries),
): SessionDataEntry[] {
  if (leafId === null) {
    return [];
  }

  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const seenEntryIds = new Set<string>();
  const path: SessionDataEntry[] = [];
  let currentEntryId: string | null = leafId;

  while (currentEntryId !== null) {
    if (seenEntryIds.has(currentEntryId)) {
      throw new SessionTreeCycleError(currentEntryId);
    }

    seenEntryIds.add(currentEntryId);
    const entry = entriesById.get(currentEntryId);

    if (!entry) {
      throw new SessionEntryNotFoundError(currentEntryId);
    }

    if (entry.type !== "leaf") {
      path.push(entry);
    }

    currentEntryId = entry.parentId;
  }

  return path.reverse();
}

/** Builds the active LLM message context from append-only session data entries. */
export function buildSessionContext(
  entries: ReadonlyArray<SessionDataEntry>,
  options: BuildSessionContextOptions = {},
): AgentMessage[] {
  const state = resolveSessionTreeState(entries);
  const messages: AgentMessage[] = [];

  for (const entry of state.path) {
    if (entry.type === "message" || entry.type === "custom_message") {
      const message = extractSessionEntryMessage(entry, options.model);

      if (message) {
        messages.push(message);
      }

      continue;
    }

    if (entry.type === "compaction") {
      const compactedMessages = extractCompactionMessages(entry, options);

      if (compactedMessages.length > 0) {
        messages.splice(0, messages.length, ...compactedMessages);
      }

      continue;
    }

    if (entry.type === "branch_summary") {
      const summaryMessage = extractSummaryMessage(entry, options);

      if (summaryMessage) {
        messages.push(summaryMessage);
      }
    }
  }

  return messages;
}

function sortSessionEntries(entries: ReadonlyArray<SessionDataEntry>): SessionDataEntry[] {
  return [...entries].sort((left, right) => {
    if (left.sequence !== right.sequence) {
      return left.sequence - right.sequence;
    }

    const timestampDelta = left.createdAt.getTime() - right.createdAt.getTime();

    if (timestampDelta !== 0) {
      return timestampDelta;
    }

    return left.id.localeCompare(right.id);
  });
}

function parseLeafPointerPayload(payload: Record<string, unknown>): string | null | undefined {
  for (const key of ["entryId", "leafId", "targetEntryId", "targetId"]) {
    const value = payload[key];

    if (value === null) {
      return null;
    }

    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function extractCompactionMessages(entry: SessionDataEntry, options: BuildSessionContextOptions): AgentMessage[] {
  const payloadMessages = entry.payload.messages;

  if (Array.isArray(payloadMessages)) {
    const messages = payloadMessages.flatMap((message): AgentMessage[] => {
      const extracted = extractMessageValue(message, entry, options.model);
      return extracted ? [extracted] : [];
    });

    if (messages.length > 0) {
      return messages;
    }
  }

  const payloadMessage = extractSessionEntryMessage(entry, options.model);

  if (payloadMessage) {
    return [payloadMessage];
  }

  const summaryMessage = extractSummaryMessage(entry, options);
  return summaryMessage ? [summaryMessage] : [];
}

function extractSummaryMessage(entry: SessionDataEntry, options: BuildSessionContextOptions): AgentMessage | null {
  const summary = extractStringPayload(entry.payload, ["summary", "content", "text"]);

  if (!summary) {
    return null;
  }

  return {
    role: "system",
    content: `${options.compactionSummaryPrefix ?? DEFAULT_COMPACTION_SUMMARY_PREFIX}${summary}`,
  };
}

function extractSessionEntryMessage(entry: SessionDataEntry, model?: Model): AgentMessage | null {
  return extractMessageValue(entry.payload.message, entry, model);
}

function extractMessageValue(value: unknown, entry: SessionDataEntry, model?: Model): AgentMessage | null {
  if (!isRecord(value) || typeof value.role !== "string") {
    return null;
  }

  if (value.role === "system" && typeof value.content === "string") {
    return { role: "system", content: value.content };
  }

  if (value.role === "user" && isSupportedUserContent(value.content)) {
    return {
      role: "user",
      content: value.content,
      timestamp: readTimestamp(value, entry),
    };
  }

  if (value.role === "toolResult") {
    return extractToolResultMessage(value, entry);
  }

  if (value.role === "assistant") {
    return extractAssistantMessage(value, entry, model);
  }

  return null;
}

function extractAssistantMessage(
  value: Record<string, unknown>,
  entry: SessionDataEntry,
  model?: Model,
): AssistantMessage | null {
  const content = extractAssistantContent(value.content);

  if (!content) {
    return null;
  }

  const api = typeof value.api === "string" ? value.api : model?.api;
  const provider = typeof value.provider === "string" ? value.provider : model?.provider;
  const modelId = typeof value.model === "string" ? value.model : model?.id;

  if (!api || !provider || !modelId) {
    return null;
  }

  return {
    role: "assistant",
    content,
    api,
    provider,
    model: modelId,
    responseModel: typeof value.responseModel === "string" ? value.responseModel : undefined,
    responseId: typeof value.responseId === "string" ? value.responseId : undefined,
    diagnostics: Array.isArray(value.diagnostics) ? (value.diagnostics as AssistantMessage["diagnostics"]) : undefined,
    usage: isUsage(value.usage) ? value.usage : ZERO_USAGE,
    stopReason: normalizeStopReason(value.stopReason),
    errorMessage: typeof value.errorMessage === "string" ? value.errorMessage : undefined,
    timestamp: readTimestamp(value, entry),
  };
}

function extractToolResultMessage(value: Record<string, unknown>, entry: SessionDataEntry): ToolResultMessage | null {
  if (
    typeof value.toolCallId !== "string" ||
    typeof value.toolName !== "string" ||
    !isToolResultContent(value.content) ||
    typeof value.isError !== "boolean"
  ) {
    return null;
  }

  return {
    role: "toolResult",
    toolCallId: value.toolCallId,
    toolName: value.toolName,
    content: value.content,
    details: value.details,
    isError: value.isError,
    timestamp: readTimestamp(value, entry),
  };
}

function extractAssistantContent(value: unknown): AssistantMessage["content"] | null {
  if (typeof value === "string") {
    return [{ type: "text", text: value }];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const content = value.filter(isAssistantContentPart);
  return content.length === value.length ? content : null;
}

function isSupportedUserContent(value: unknown): value is UserMessage["content"] {
  return typeof value === "string" || isContentPartArray(value);
}

function isToolResultContent(value: unknown): value is ToolResultMessage["content"] {
  return isContentPartArray(value);
}

function isContentPartArray(value: unknown): value is ContentPart[] {
  return Array.isArray(value) && value.every(isContentPart);
}

function isContentPart(value: unknown): value is ContentPart {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "text") {
    return typeof value.text === "string";
  }

  if (value.type === "image") {
    return typeof value.image === "string" || value.image instanceof URL;
  }

  return false;
}

function isAssistantContentPart(value: unknown): value is AssistantMessage["content"][number] {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "text") {
    return typeof value.text === "string";
  }

  if (value.type === "thinking") {
    return typeof value.thinking === "string";
  }

  return isToolCall(value);
}

function isToolCall(value: unknown): value is ToolCall {
  return (
    isRecord(value) &&
    value.type === "toolCall" &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isRecord(value.arguments)
  );
}

function isUsage(value: unknown): value is Usage {
  if (!isRecord(value) || !isRecord(value.cost)) {
    return false;
  }

  return (
    typeof value.input === "number" &&
    typeof value.output === "number" &&
    typeof value.cacheRead === "number" &&
    typeof value.cacheWrite === "number" &&
    typeof value.totalTokens === "number" &&
    typeof value.cost.input === "number" &&
    typeof value.cost.output === "number" &&
    typeof value.cost.cacheRead === "number" &&
    typeof value.cost.cacheWrite === "number" &&
    typeof value.cost.total === "number"
  );
}

function normalizeStopReason(value: unknown): StopReason {
  if (typeof value === "string" && STOP_REASONS.has(value)) {
    return value as StopReason;
  }

  return "unknown";
}

function readTimestamp(value: Record<string, unknown>, entry: SessionDataEntry): number {
  return typeof value.timestamp === "number" ? value.timestamp : entry.createdAt.getTime();
}

function extractStringPayload(payload: Record<string, unknown>, keys: ReadonlyArray<string>): string | null {
  for (const key of keys) {
    const value = payload[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
