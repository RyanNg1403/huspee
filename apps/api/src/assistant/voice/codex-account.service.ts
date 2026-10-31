import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { forbidden, invalidState } from '../../common/errors';
import { codexLoginSource } from './codex-home';
import { CodexTransport } from './codex-transport';
import { codexInstalled } from './voice-enabled';
import { VoiceService } from './voice.service';

// OpenAI's device codes last 15 minutes; give up on ours at the same time.
const LOGIN_TTL_MS = 15 * 60 * 1000;

type PendingLogin = { id: string; verificationUrl: string; userCode: string; expiresAt: number; transport: CodexTransport; timer: NodeJS.Timeout; owner?: string };
type Account = { type?: string; planType?: string } | null;

export type CodexConnection = {
  installed: boolean;
  connected: boolean;
  source: 'app' | 'host' | null;
  plan: string | null;
  login: { verification_url: string; user_code: string; expires_at: number } | null;
  error: 'login_failed' | 'login_expired' | null;
};
export type CodexSetupConnection = CodexConnection & { busy: boolean };

/**
 * Connects the voice runtime to a ChatGPT account with Codex's device-code login, from the web app
 * instead of a terminal. The login is saved in the runtime's private CODEX_HOME; nothing here reads
 * or returns the tokens, only the account's plan.
 */
@Injectable()
export class CodexAccountService implements OnModuleDestroy {
  private login?: PendingLogin;
  private starting?: Promise<CodexConnection>;
  private error: CodexConnection['error'] = null;
  private plan?: Promise<string | null>;
  constructor(private readonly voice: VoiceService) {}

  async status(): Promise<CodexConnection> {
    const source = codexLoginSource();
    const installed = codexInstalled();
    return {
      installed,
      connected: source !== null,
      source,
      plan: source && installed ? await this.readPlan() : null,
      login: this.login
        ? { verification_url: this.login.verificationUrl, user_code: this.login.userCode, expires_at: Math.floor(this.login.expiresAt / 1000) }
        : null,
      error: this.error,
    };
  }

  /** Starts a device-code login, or resumes the pending login owned by this setup browser. */
  async start(owner?: string): Promise<CodexConnection> {
    if (this.starting) await this.starting;
    if (!codexInstalled()) throw invalidState('Codex CLI is not installed');
    if (codexLoginSource() !== null) throw invalidState('Codex is already connected');
    if (this.login && owner && this.login.owner !== owner) throw invalidState('Another browser is already connecting Codex');
    if (this.login) return this.status();
    this.starting = this.beginLogin(owner).finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  /** Public setup reveals the device code only to the browser that started this login. */
  async setupStatus(owner?: string): Promise<CodexSetupConnection> {
    const status = await this.status();
    const ownsLogin = !!owner && this.login?.owner === owner;
    return { ...status, login: ownsLogin ? status.login : null, busy: !!status.login && !ownsLogin };
  }

  async setupCancel(owner?: string): Promise<CodexSetupConnection> {
    if (!owner || !this.login || this.login.owner !== owner) throw forbidden('This browser does not own the pending sign-in');
    await this.cancel();
    return this.setupStatus(owner);
  }

  private async beginLogin(owner?: string): Promise<CodexConnection> {
    this.error = null;
    const transport = new CodexTransport();
    try {
      await transport.start();
      const result = (await transport.request('account/login/start', { type: 'chatgptDeviceCode' })) as {
        loginId: string;
        verificationUrl: string;
        userCode: string;
      };
      const login: PendingLogin = {
        owner,
        id: result.loginId,
        verificationUrl: result.verificationUrl,
        userCode: result.userCode,
        expiresAt: Date.now() + LOGIN_TTL_MS,
        transport,
        timer: setTimeout(() => void this.end(login, 'login_expired'), LOGIN_TTL_MS),
      };
      transport.onMessage = (message) => {
        const params = message.params as { loginId?: string | null; success?: boolean } | undefined;
        if (message.method !== 'account/login/completed' || (params?.loginId && params.loginId !== login.id)) return;
        void this.end(login, params?.success ? null : 'login_failed');
      };
      transport.onExit = () => void this.end(login, 'login_failed');
      this.login = login;
    } catch {
      transport.close();
      this.error = 'login_failed';
    }
    return this.status();
  }

  async cancel(): Promise<CodexConnection> {
    const login = this.login;
    if (login) {
      await login.transport.request('account/login/cancel', { loginId: login.id }, 5000).catch(() => undefined);
      await this.end(login, null);
    }
    this.error = null;
    return this.status();
  }

  /** Signs out a login made here. A login linked from `codex login` on this machine is left alone. */
  async disconnect(): Promise<CodexConnection> {
    const source = codexLoginSource();
    if (source === 'host') throw invalidState('Codex uses this machine’s own login; sign out with `codex logout`');
    if (source === 'app') {
      const transport = new CodexTransport();
      try {
        await transport.start();
        await transport.request('account/logout', {});
      } finally {
        transport.close();
      }
      this.changed();
    }
    return this.status();
  }

  private async end(login: PendingLogin, error: CodexConnection['error']): Promise<void> {
    if (this.login !== login) return;
    this.login = undefined;
    clearTimeout(login.timer);
    login.transport.onExit = undefined;
    login.transport.close();
    this.error = error;
    if (!error) this.changed();
  }

  /** The runtime's app-server holds the login it started with, so restart it on the next session. */
  private changed(): void {
    this.plan = undefined;
    this.voice.reset();
  }

  private readPlan(): Promise<string | null> {
    this.plan ??= (async () => {
      const transport = new CodexTransport();
      try {
        await transport.start();
        const result = (await transport.request('account/read', {}, 15000)) as { account?: Account };
        return result.account?.type === 'chatgpt' ? (result.account.planType ?? null) : null;
      } catch {
        this.plan = undefined;
        return null;
      } finally {
        transport.close();
      }
    })();
    return this.plan;
  }

  onModuleDestroy(): void {
    if (this.login) void this.end(this.login, null);
  }
}
