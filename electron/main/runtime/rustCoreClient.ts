import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { randomUUID } from "node:crypto";

/** 轻量日志抽象，便于单元测试；生产环境由主进程注入 appLogger。 */
export type RustCoreLogger = {
  debug(scope: string, event: string, details?: Record<string, unknown>): void;
  info(scope: string, event: string, details?: Record<string, unknown>): void;
  warn(scope: string, event: string, details?: Record<string, unknown>): void;
  error(scope: string, event: string, details?: Record<string, unknown>): void;
};

const consoleLogger: RustCoreLogger = {
  debug: () => undefined,
  info: (_scope, event, details) => console.info(`[rust-core] ${event}`, details ?? ""),
  warn: (_scope, event, details) => console.warn(`[rust-core] ${event}`, details ?? ""),
  error: (_scope, event, details) => console.error(`[rust-core] ${event}`, details ?? ""),
};

/** 与 Rust 侧 `PROTOCOL_VERSION` 保持一致。 */
export const RUST_CORE_PROTOCOL_VERSION = 1;
/** 单条消息最大长度（字节），与 Rust 侧限制保持一致。 */
export const RUST_CORE_MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
/** 默认请求超时。 */
export const RUST_CORE_REQUEST_TIMEOUT_MS = 30_000;
/** 崩溃后最多重启次数，避免无限循环拖垮主进程。 */
export const RUST_CORE_MAX_RESTARTS = 3;

export type RustCoreMessage = {
  id?: string;
  result?: unknown;
  error?: { code: string; message: string };
  event?: string;
  data?: unknown;
};

export type RustCoreClientOptions = {
  executablePath?: string;
  protocolVersion?: number;
  requestTimeoutMs?: number;
  maxRestarts?: number;
  maxMessageBytes?: number;
  logger?: RustCoreLogger;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
  method: string;
};

export type RustCoreStatus = "idle" | "connecting" | "ready" | "exited" | "stopped";

export function resolveRustCorePath(executablePath?: string): string {
  if (executablePath) {
    return executablePath;
  }

  const fileName = process.platform === "win32" ? "suyan-core.exe" : "suyan-core";
  const configuredPath = process.env.SUYAN_RUST_CORE_PATH?.trim();
  if (configuredPath) {
    return configuredPath;
  }

  // 惰性加载 electron，避免在无 Electron 环境的单元测试中访问 app。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const isPackaged = (() => {
    try {
      return require("electron").app?.isPackaged === true;
    } catch {
      return false;
    }
  })();
  if (isPackaged) {
    return path.join(process.resourcesPath, "bin", fileName);
  }

  // 开发/测试模式：从 __dirname 向上查找仓库根目录的 native 产物。
  // 源码直接运行（vitest）时 __dirname=electron/main/runtime；
  // 编译后运行（pnpm dev 的 dist-electron）时 __dirname=dist-electron/electron/main/runtime。
  // 统一向上逐级查找，直到出现 native/suyan-core/target/release。
  let current = __dirname;
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(current, "native", "suyan-core", "target", "release", fileName);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return path.resolve(__dirname, "../../../native/suyan-core/target/release", fileName);
}

export class RustCoreClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private lines: Interface | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly executablePath: string;
  private readonly protocolVersion: number;
  private readonly requestTimeoutMs: number;
  private readonly maxRestarts: number;
  private readonly maxMessageBytes: number;
  private restartCount = 0;
  private explicitStop = false;
  private status: RustCoreStatus = "idle";
  private handshakeListeners: Array<(error: Error | null) => void> = [];
  private eventListeners: Array<(event: string, data: unknown) => void> = [];
  private stderrTail = "";
  private readonly logger: RustCoreLogger;

  /** 订阅 Rust Sidecar 上报的事件（如 `video.progress`）。返回取消订阅函数。 */
  onEvent(listener: (event: string, data: unknown) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter((fn) => fn !== listener);
    };
  }

  constructor(options: RustCoreClientOptions = {}) {
    this.executablePath = resolveRustCorePath(options.executablePath);
    this.protocolVersion = options.protocolVersion ?? RUST_CORE_PROTOCOL_VERSION;
    this.requestTimeoutMs = options.requestTimeoutMs ?? RUST_CORE_REQUEST_TIMEOUT_MS;
    this.maxRestarts = options.maxRestarts ?? RUST_CORE_MAX_RESTARTS;
    this.maxMessageBytes = options.maxMessageBytes ?? RUST_CORE_MAX_MESSAGE_BYTES;
    this.logger = options.logger ?? consoleLogger;
  }

  get currentStatus(): RustCoreStatus {
    return this.status;
  }

  get isRunning(): boolean {
    return this.process !== null && this.status === "ready";
  }

  async start(): Promise<void> {
    if (this.process) {
      return;
    }
    this.explicitStop = false;
    this.restartCount = 0;
    await this.spawnProcess();
  }

  async stop(): Promise<void> {
    this.explicitStop = true;
    if (!this.process) {
      return;
    }
    // 优雅关闭：先尝试发送 system.shutdown，超时后再 kill。
    const child = this.process;
    try {
      await Promise.race([
        this.request("system.shutdown", {}, 2000).catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch {
      // ignore
    }
    if (this.process === child) {
      child.kill();
    }
    this.process = null;
    this.lines?.close();
    this.lines = null;
    this.failAll(new Error("Rust Core 已停止"));
    this.status = "stopped";
  }

  /** 发送请求并等待结果。超时或崩溃都会 reject。 */
  request<T>(method: string, params: unknown, timeoutMs = this.requestTimeoutMs): Promise<T> {
    if (!this.process || this.status !== "ready") {
      throw new Error(`Rust Core 未就绪 (status=${this.status})`);
    }
    return this.sendRequest<T>(method, params, timeoutMs);
  }

  /** 内部发送：绕过 `ready` 状态守卫，用于握手等连接阶段。 */
  private sendRequest<T>(method: string, params: unknown, timeoutMs: number): Promise<T> {
    const id = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Rust Core 请求超时: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer, method });

      const payload = `${JSON.stringify({
        protocolVersion: this.protocolVersion,
        id,
        method,
        params: params ?? {},
      })}\n`;
      this.writeWithBackpressure(payload);
    });
  }

  /** 等待握手完成（Sidecar 已响应 system.handshake）。 */
  waitForReady(timeoutMs = 10_000): Promise<void> {
    if (this.status === "ready") {
      return Promise.resolve();
    }
    if (this.status === "exited" || this.status === "stopped") {
      return Promise.reject(new Error(`Rust Core 不可用 (status=${this.status})`));
    }
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeHandshakeListener(listener);
        reject(new Error("等待 Rust Core 握手超时"));
      }, timeoutMs);
      const listener = (error: Error | null) => {
        clearTimeout(timer);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      this.handshakeListeners.push(listener);
    });
  }

  private async spawnProcess(): Promise<void> {
    if (!(await this.executableExists())) {
      this.logger.error("rust-core", "spawn:missing", { path: this.executablePath });
      this.status = "exited";
      throw new Error(`Rust Core 可执行文件不存在: ${this.executablePath}`);
    }

    this.status = "connecting";
    const child = spawn(this.executablePath, ["--stdio"], {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process = child;

    this.lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    this.lines.on("line", (line) => this.handleLine(line));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      this.stderrTail = `${this.stderrTail}${chunk}`.slice(-8192);
      this.logger.debug("rust-core", "stderr", { chunk: chunk.slice(0, 4096) });
    });
    child.once("error", (error) => {
      this.logger.error("rust-core", "spawn:error", { message: error.message });
      this.cleanupAfterExit();
      this.failAll(new Error(`Rust Core 启动失败: ${error.message}`));
    });
    child.once("exit", (code, signal) => {
      this.logger.warn("rust-core", "exit", { code, signal });
      this.cleanupAfterExit();
      this.failAll(new Error(`Rust Core 已退出: code=${code}, signal=${signal}`));
      this.handleCrash();
    });

    // 启动后主动握手，确认版本与实现。
    try {
      const result = await this.sendRequest<{
        status: string;
        protocolVersion: number;
        implementation: string;
        version: string;
      }>("system.handshake", {}, 5000);
      if (result.protocolVersion !== this.protocolVersion) {
        this.logger.error("rust-core", "handshake:version-mismatch", {
          expected: this.protocolVersion,
          actual: result.protocolVersion,
        });
        const error = new Error("Rust Core 协议版本不匹配");
        this.cleanupAfterExit();
        this.failAll(error);
        this.rejectHandshake(error);
        void this.stop();
        throw error;
      }
      this.status = "ready";
      this.logger.info("rust-core", "handshake:ok", {
        implementation: result.implementation,
        version: result.version,
      });
      this.notifyHandshakeDone();
    } catch (error) {
      this.logger.error("rust-core", "handshake:error", { message: String(error) });
      this.cleanupAfterExit();
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.failAll(normalized);
      this.rejectHandshake(normalized);
      throw normalized;
    }
  }

  private handleLine(line: string): void {
    if (Buffer.byteLength(line, "utf8") > this.maxMessageBytes) {
      this.logger.error("rust-core", "message:too-large", { bytes: Buffer.byteLength(line, "utf8") });
      return;
    }
    let message: RustCoreMessage;
    try {
      message = JSON.parse(line) as RustCoreMessage;
    } catch {
      this.logger.warn("rust-core", "message:invalid-json");
      return;
    }
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
      } else {
        pending.resolve(message.result);
      }
    } else if (message.event) {
      // 进度 / 取消等事件由上层注册监听；骨架阶段仅记录。
      this.logger.debug("rust-core", "event", { event: message.event });
      const listeners = [...this.eventListeners];
      for (const listener of listeners) {
        try {
          listener(message.event, message.data);
        } catch (error) {
          this.logger.error("rust-core", "event:listener-error", {
            event: message.event,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  private writeWithBackpressure(payload: string): void {
    const child = this.process;
    if (!child) {
      return;
    }
    const data = Buffer.from(payload, "utf8");
    const ok = child.stdin.write(data);
    if (!ok) {
      child.stdin.once("drain", () => undefined);
    }
  }

  private cleanupAfterExit(): void {
    this.process = null;
    this.lines?.close();
    this.lines = null;
  }

  private handleCrash(): void {
    if (this.explicitStop) {
      return;
    }
    if (this.restartCount >= this.maxRestarts) {
      this.logger.error("rust-core", "crash:max-restarts", { restarts: this.restartCount });
      this.status = "exited";
      return;
    }
    this.restartCount += 1;
    this.logger.warn("rust-core", "crash:restart", { attempt: this.restartCount });
    this.status = "connecting";
    void this.spawnProcess().catch((error) => {
      this.logger.error("rust-core", "restart:failed", { message: String(error) });
      this.status = "exited";
    });
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private notifyHandshakeDone(): void {
    const listeners = this.handshakeListeners;
    this.handshakeListeners = [];
    for (const listener of listeners) {
      listener(null);
    }
  }

  private rejectHandshake(error: Error): void {
    const listeners = this.handshakeListeners;
    this.handshakeListeners = [];
    for (const listener of listeners) {
      listener(error);
    }
  }

  private removeHandshakeListener(listener: (error: Error | null) => void): void {
    this.handshakeListeners = this.handshakeListeners.filter((fn) => fn !== listener);
  }

  private async executableExists(): Promise<boolean> {
    try {
      await fs.access(this.executablePath);
      return true;
    } catch {
      return false;
    }
  }
}

