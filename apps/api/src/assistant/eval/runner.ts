import "reflect-metadata";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { CatalogService } from "../../domain/catalog.service";
import { LogisticsService } from "../../domain/logistics.service";
import { VoucherService } from "../../domain/voucher.service";
import { PushService } from "../../domain/push.service";
import { OrderService } from "../../domain/order.service";
import { ReturnService } from "../../domain/return.service";
import { ActionsService } from "../actions.service";
import { AssistantEvents } from "../assistant.events";
import { AssistantToolRegistry } from "../tools/assistant-tool.registry";
import { defaultAssistantConfig } from "../assistant-defaults";
import { VoiceRuntime } from "../voice/voice-runtime";
import { cases, type EvalCase } from "./cases";
import { grade, type RecordedRun } from "./grader";
import { loadFacts } from "./facts";
import { reviewRun } from "./review";

const args = process.argv.slice(2);
function option(name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  if (!args[i + 1] || args[i + 1].startsWith("--"))
    throw new Error(`${name} needs a value`);
  return args[i + 1];
}
const valid = new Set([
  "--case",
  "--limit",
  "--shop",
  "--out",
  "--fake",
  "--regrade",
]);
for (let i = 0; i < args.length; i++) {
  if (!valid.has(args[i])) throw new Error(`Unknown option: ${args[i]}`);
  if (args[i] !== "--fake") i++;
}
const regrade = option("--regrade");
const selectedCase = option("--case");
const shop = option("--shop");
const limit = option("--limit");
if (limit && (!/^\d+$/.test(limit) || Number(limit) < 1))
  throw new Error("Invalid --limit");
if (shop && !/^\d+$/.test(shop)) throw new Error("Invalid --shop");
const selected = cases
  .filter(
    (test) =>
      (!selectedCase || test.id === selectedCase) &&
      (!shop || test.shop === Number(shop)),
  )
  .slice(0, limit ? Number(limit) : undefined);
if (!selected.length) throw new Error("No matching cases");
const root = resolve(__dirname, "../../../../..");
const out = resolve(
  option("--out") ||
    resolve(root, "evals/runs", new Date().toISOString().replace(/[:.]/g, "-")),
);
if (args.includes("--fake")) {
  process.env.ASSISTANT_CODEX_BIN = resolve(
    root,
    "tests/helpers/fake-codex/eval-codex",
  );
  process.env.ASSISTANT_CODEX_HOME = resolve(out, ".fake-home");
}

class Rollback extends Error {}
async function runCase(
  prisma: PrismaClient,
  test: EvalCase,
): Promise<RecordedRun> {
  let recording: RecordedRun | undefined;
  try {
    await prisma.$transaction(
      async (tx) => {
        // All services share the same transaction; nested callback transactions reuse it.
        const db = new Proxy(tx, {
          get(target, property, receiver) {
            if (property === "$transaction")
              return async (fn: (client: typeof tx) => unknown) => {
                if (typeof fn !== "function")
                  throw new Error("Array transactions unsupported in eval");
                return fn(tx);
              };
            return Reflect.get(target, property, receiver);
          },
        }) as unknown as PrismaService;
        const catalog = new CatalogService(db);
        const logistics = new LogisticsService(db);
        const vouchers = new VoucherService(db);
        const push = new PushService(db);
        const orders = new OrderService(db, logistics, vouchers, push);
        const returns = new ReturnService(db, push);
        const actions = new ActionsService(
          db,
          new AssistantEvents(),
          orders,
          returns,
        );
        const registry = new AssistantToolRegistry(
          db,
          catalog,
          actions,
          logistics,
          vouchers,
        );
        const row = await tx.shop.findUnique({
          where: { id: test.shop },
          include: { assistantConfig: true },
        });
        if (!row)
          throw new Error(`Shop ${test.shop} missing; seed the database`);
        const config = row.assistantConfig ?? defaultAssistantConfig(row.name);
        const facts = await loadFacts(tx as unknown as PrismaClient, test);
        if (args.includes("--fake")) {
          const items = await tx.item.findMany({
            where: { shopId: test.shop, status: "NORMAL" },
            orderBy: { id: "asc" },
            select: { id: true, name: true },
            take: 2,
          });
          const target = test.productQuery
            ? await tx.item.findFirst({
                where: {
                  shopId: test.shop,
                  status: "NORMAL",
                  name: { contains: test.productQuery, mode: "insensitive" },
                },
                orderBy: { id: "asc" },
                select: { id: true, name: true },
              })
            : null;
          process.env.HUSPEE_EVAL_FAKE = JSON.stringify({
            test,
            items,
            target,
          });
        }
        const conversation = await tx.conversation.create({
          data: {
            shopId: test.shop,
            buyerId: test.buyer,
            channel: "TEXT",
            language: `eval:${test.language}`,
          },
        });
        const context = {
          conversationId: conversation.id,
          buyerId: test.buyer,
          shopId: test.shop,
        };
        const observed: RecordedRun["tools"] = [];
        const runtime = new VoiceRuntime(
          {
            specs: () => registry.specs(),
            run: async (name, input, ctx) => {
              const result = await registry.run(name, input, ctx);
              observed.push({
                name,
                input,
                text: result.text,
                success: result.success,
              });
              return result;
            },
          },
          async () => {},
          async () => {},
        );
        // Capture only a safe category from app-server failures, never raw payloads.
        const transport = (
          runtime as unknown as {
            transport: {
              onMessage?: (message: {
                method?: string;
                params?: Record<string, unknown>;
              }) => void;
            };
          }
        ).transport;
        const dispatchMessage = transport.onMessage;
        let turnFailure = "unclassified";
        transport.onMessage = (message) => {
          if (message.method === "turn/completed") {
            const turn = message.params?.turn as
              | { error?: unknown }
              | undefined;
            const detail = JSON.stringify(turn?.error ?? "").toLowerCase();
            turnFailure = /rate.limit|too many requests/.test(detail)
              ? "rate_limit"
              : /timed? ?out|timeout/.test(detail)
                ? "timeout"
                : /context.{0,20}(?:limit|length)/.test(detail)
                  ? "context_limit"
                  : /auth|unauthorized/.test(detail)
                    ? "authentication"
                    : /server.error|internal.error/.test(detail)
                      ? "server_error"
                      : "unclassified";
          }
          dispatchMessage?.(message);
        };
        const start = Date.now();
        try {
          await runtime.startText(context, {
            shopName: row.name,
            tone: config.tone,
            greetingVi: config.greetingVi,
            greetingEn: config.greetingEn,
            voice: config.voice,
          });
          let answer = "";
          let current = "";
          let complete: ((status: string | undefined) => void) | undefined;
          runtime.onTurnCompleted = (id, status) => {
            if (id === context.conversationId) complete?.(status);
          };
          runtime.subscribe(
            context.conversationId,
            context.buyerId,
            (event) => {
              if (
                event.type === "transcript" &&
                event.role === "assistant" &&
                event.final === true
              )
                current += (current ? "\n" : "") + String(event.text);
            },
          );
          const turn = async (text: string) => {
            current = "";
            turnFailure = "unclassified";
            let timer: NodeJS.Timeout | undefined;
            const finished = new Promise<void>((resolveDone, reject) => {
              timer = setTimeout(
                () => reject(new Error("Timed out waiting for answer")),
                60000,
              );
              complete = (status) =>
                status === "completed"
                  ? resolveDone()
                  : reject(
                      new Error(`Turn ${String(status)} (${turnFailure})`),
                    );
            });
            try {
              await runtime.text(context.conversationId, context.buyerId, text);
              await finished;
              return current;
            } finally {
              if (timer) clearTimeout(timer);
              complete = undefined;
            }
          };
          answer = await turn(test.question);
          recording = {
            answer,
            tools: observed,
            latencyMs: Date.now() - start,
            facts,
          };
          await runtime.stop(context.conversationId, context.buyerId);
          try { recording.review = await reviewRun(test, recording); }
          catch (error) { recording.reviewError = error instanceof Error ? error.message : 'Semantic review unavailable'; }
        } finally {
          runtime.close();
          push.onModuleDestroy();
        }
        throw new Rollback();
      },
      { timeout: 180000 },
    );
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  if (!recording) throw new Error("No evaluation recording");
  return recording;
}
async function main() {
  await mkdir(out, { recursive: true });
  if (regrade) {
    const saved = JSON.parse(
      await readFile(resolve(regrade, "results.json"), "utf8"),
    ) as {
      fake?: boolean;
      results: Array<{ case: EvalCase; run?: RecordedRun; error?: string }>;
    };
    const results = saved.results
      .filter(
        (r) =>
          (!selectedCase || r.case.id === selectedCase) &&
          (!shop || r.case.shop === Number(shop)),
      )
      .slice(0, limit ? Number(limit) : undefined)
      .map((r) => ({
        ...r,
        // Grade against the current case definition so case fixes apply to saved runs.
        ...(r.run ? { grade: grade(cases.find((test) => test.id === r.case.id) ?? r.case, r.run) } : {}),
      }));
    await writeFile(
      resolve(out, "results.json"),
      JSON.stringify(
        { fake: saved.fake, regradedFrom: regrade, results },
        null,
        2,
      ),
    );
    await writeFile(
      resolve(out, "report.md"),
      [
        "| Case | Result | Flags |",
        "| --- | --- | --- |",
        ...results.map(
          (r) =>
            `| ${r.case.id} | ${r.grade?.status?.toUpperCase() ?? "FAIL"} | ${(r.error || r.grade?.flags.map((f) => `${f.span}: ${f.reason}`).join("; ") || "").replace(/\|/g, "\\|").replace(/\n/g, " ")} |`,
        ),
        "",
      ].join("\n"),
    );
    console.log(`Regraded report: ${out}`);
    if (results.some((r) => r.error || !r.grade?.passed)) process.exitCode = 1;
    return;
  }
  const prisma = new PrismaClient();
  const results: Array<{
    case: EvalCase;
    run?: RecordedRun;
    grade?: ReturnType<typeof grade>;
    error?: string;
  }> = [];
  try {
    for (const test of selected) {
      try {
        const run = await runCase(prisma, test);
        results.push({ case: test, run, grade: grade(test, run) });
      } catch (error) {
        results.push({
          case: test,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  await writeFile(
    resolve(out, "results.json"),
    JSON.stringify({ fake: args.includes("--fake"), results }, null, 2),
  );
  const rows = results.map(
    (result) =>
      `| ${result.case.id} | ${result.grade?.status?.toUpperCase() ?? "FAIL"} | ${result.grade?.latencyMs ?? "-"} | ${(result.error || result.grade?.flags.map((f) => `${f.span}: ${f.reason}`).join("; ") || "").replace(/\|/g, "\\|").replace(/\n/g, " ")} |`,
  );
  await writeFile(
    resolve(out, "report.md"),
    [
      "| Case | Result | Latency ms | Flags |",
      "| --- | --- | ---: | --- |",
      ...rows,
      "",
    ].join("\n"),
  );
  console.log(`Evaluation report: ${out}`);
  if (results.some((r) => r.error || !r.grade?.passed)) process.exitCode = 1;
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
