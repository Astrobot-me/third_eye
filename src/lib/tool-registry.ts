import { FunctionDeclaration, LiveServerToolCall } from "@google/genai";

export type ToolResponsePayload = {
  response: { output: Record<string, unknown> };
  id: string;
  name: string;
};

export type ToolHandler = (
  toolCall: LiveServerToolCall,
  sendResponse: (responses: ToolResponsePayload[]) => void
) => void | Promise<void>;

export interface ToolDefinition {
  declaration: FunctionDeclaration;
  handler: ToolHandler;
}

/**
 * Centralized tool registry for managing tool declarations and handlers.
 * Prevents conflicts from multiple components handling the same tool calls.
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  /**
   * Register a tool with its declaration and handler
   */
  register(name: string, definition: ToolDefinition): void {
    if (this.tools.has(name)) {
      console.warn(`[ToolRegistry] Tool "${name}" already registered, overwriting`);
    }
    this.tools.set(name, definition);
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): void {
    this.tools.delete(name);
  }

  /**
   * Get all tool declarations for API config
   */
  getDeclarations(): FunctionDeclaration[] {
    return Array.from(this.tools.values()).map((t) => t.declaration);
  }

  /**
   * Check if a tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Handle incoming tool calls by dispatching to appropriate handlers
   */
  handleToolCall(
    toolCall: LiveServerToolCall,
    sendResponse: (responses: ToolResponsePayload[]) => void
  ): void {
    if (!toolCall.functionCalls) return;

    for (const fc of toolCall.functionCalls) {
      if (!fc.name) continue;
      const tool = this.tools.get(fc.name);
      if (tool) {
        tool.handler(toolCall, sendResponse);
      } else {
        console.warn(`[ToolRegistry] No handler for tool: ${fc.name}`);
      }
    }
  }

  /**
   * Get list of registered tool names
   */
  getRegisteredTools(): string[] {
    return Array.from(this.tools.keys());
  }
}

// Singleton instance for app-wide use
export const toolRegistry = new ToolRegistry();
