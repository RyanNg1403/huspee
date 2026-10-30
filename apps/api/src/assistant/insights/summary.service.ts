import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../../common/prisma.service";
import { CodexTransport } from "../voice/codex-transport";
import { voiceEnabled } from "../voice/voice-enabled";

const schema = z.object({
  topics: z.array(z.string()),
  hesitations: z.array(z.string()),
  listing_suggestions: z.array(
    z.object({ item_id: z.number().int().optional(), text: z.string() }),
  ),
  language: z.string(),
});

@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);
  constructor(private readonly prisma: PrismaService) {}
  schedule(id: string): boolean {
    if (!voiceEnabled()) return false;
    void this.generate(id);
    return true;
  }
  private async generate(id: string): Promise<void> {
    const transport = new CodexTransport();
    try {
      const conversation = await this.prisma.conversation.findUniqueOrThrow({
        where: { id },
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          toolCalls: { orderBy: { createdAt: "asc" } },
        },
      });
      if (conversation.status !== "ENDED") return;
      await transport.start();
      const thread = (await transport.request("thread/start", {
        ephemeral: true,
        cwd: process.cwd(),
        approvalPolicy: "never",
        sandbox: "read-only",
      })) as { thread: { id: string; model?: string } };
      const response = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Summary timed out")),
          45000,
        );
        transport.onExit = () => {
          clearTimeout(timer);
          reject(new Error("Summary runtime exited"));
        };
        transport.onMessage = (message) => {
          if (message.params?.threadId !== thread.thread.id) return;
          if (message.method === "item/completed") {
            const item = message.params.item as
              | { type?: string; text?: string }
              | undefined;
            if (
              item?.type === "agentMessage" &&
              typeof item.text === "string"
            ) {
              clearTimeout(timer);
              resolve(item.text);
            }
          } else if (
            message.method === "turn/completed" &&
            (message.params.turn as { status?: string })?.status === "failed"
          ) {
            clearTimeout(timer);
            reject(new Error("Summary turn failed"));
          }
        };
      });
      const input = `Summarize this single conversation using only its transcript and tool results. Say nothing about other buyers. Return only JSON with topics (string array), hesitations (string array), listing_suggestions (array of {item_id?: number, text: string}), language (string). Transcript and tools: ${JSON.stringify({ messages: conversation.messages.map(({ role, text }) => ({ role, text })), tool_calls: conversation.toolCalls.map(({ tool, args, result }) => ({ tool, args, result })) })}`;
      const [, output] = await Promise.all([
        transport.request("turn/start", {
          threadId: thread.thread.id,
          input: [{ type: "text", text: input, text_elements: [] }],
        }),
        response,
      ]);
      const parsed = schema.parse(JSON.parse(output));
      await this.prisma.conversation.update({
        where: { id },
        data: {
          summary: {
            ...parsed,
            model: thread.thread.model || "codex",
            created_at: Math.floor(Date.now() / 1000),
          } as Prisma.InputJsonValue,
        },
      });
    } catch {
      this.logger.warn(`Conversation summary failed for ${id}`);
      await this.prisma.conversation
        .updateMany({
          where: { id },
          data: { summary: { error: "Summary unavailable" } },
        })
        .catch(() => undefined);
    } finally {
      transport.close();
    }
  }
}
