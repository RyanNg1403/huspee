import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { prepareCodexHome } from './codex-home';

const execFileAsync = promisify(execFile);
type RpcMessage = { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: unknown };
type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout };

/** Owns one app-server process. Payloads and stderr are deliberately never logged. */
export class CodexTransport {
  private process?: ChildProcessWithoutNullStreams;
  private starting?: Promise<void>;
  private nextId = 0;
  private pending = new Map<number, Pending>();
  onMessage?: (message: RpcMessage) => void;
  onExit?: () => void;

  async start(): Promise<void> {
    if (this.starting) return this.starting;
    if (this.process) return;
    if (!this.starting)
      this.starting = this.launch().finally(() => {
        this.starting = undefined;
      });
    await this.starting;
  }

  private async launch(): Promise<void> {
    const executable = process.env.ASSISTANT_CODEX_BIN || 'codex';
    const { stdout } = await execFileAsync(executable, ['--version'], { timeout: 10000 });
    if (stdout.trim() !== 'codex-cli 0.166.0') throw new Error('Codex CLI version must be 0.166.0');
    const home = await prepareCodexHome();
    const child = spawn(executable, ['app-server'], {
      env: { ...process.env, CODEX_HOME: home },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.process = child;
    child.stderr.resume();
    createInterface({ input: child.stdout }).on('line', (line) => {
      let message: RpcMessage;
      try {
        message = JSON.parse(line) as RpcMessage;
      } catch {
        return;
      }
      if (message.id !== undefined && !message.method) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error('Codex request failed'));
        else pending.resolve(message.result);
      } else this.onMessage?.(message);
    });
    child.once('error', () => this.exited(child));
    child.once('exit', () => this.exited(child));
    try {
      await this.request('initialize', {
        clientInfo: { name: 'huspee', title: 'Huspee', version: '0.1' },
        capabilities: { experimentalApi: true },
      });
      this.send({ method: 'initialized' });
    } catch (error) {
      child.kill();
      throw error;
    }
  }

  private exited(child: ChildProcessWithoutNullStreams): void {
    if (this.process !== child) return;
    this.process = undefined;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Codex process exited'));
    }
    this.pending.clear();
    this.onExit?.();
  }

  send(message: object): void {
    if (!this.process || !this.process.stdin.writable) throw new Error('Codex unavailable');
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method: string, params: object, timeoutMs = 45000): Promise<unknown> {
    const id = ++this.nextId;
    return new Promise((resolveRequest, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolveRequest, reject, timer });
      try {
        this.send({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  close(): void {
    this.process?.kill();
  }
}
