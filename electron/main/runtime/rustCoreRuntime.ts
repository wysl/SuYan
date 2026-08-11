import { RustCoreClient, type RustCoreStatus } from "./rustCoreClient";
import { logger } from "../appLogger";

/**
 * 全局唯一的 Rust Core Sidecar 生命周期管理器。
 * 骨架阶段只负责：启动、握手、ping、状态查询与退出关闭。
 * 业务方法（扫描/哈希/归档等）在后续阶段接入。
 */
export class RustCoreRuntime {
  private client: RustCoreClient | null = null;
  private eventListeners = new Set<(event: string, data: unknown) => void>();
  private eventBridge: (() => void) | null = null;

  /** 在主进程 app ready 后调用，异步启动 Sidecar。失败不阻塞应用启动。 */
  async start(): Promise<void> {
    if (this.client) {
      return;
    }
    const client = new RustCoreClient({
      logger: {
        debug: (scope, event, details) => logger.debug(scope, event, details),
        info: (scope, event, details) => logger.info(scope, event, details),
        warn: (scope, event, details) => logger.warn(scope, event, details),
        error: (scope, event, details) => logger.error(scope, event, details),
      },
    });
    this.client = client;
    // 把 start() 之前注册的监听器桥接到新 client 上。
    if (this.eventListeners.size > 0) {
      const unsubscribe = client.onEvent((event, data) => {
        const listeners = [...this.eventListeners];
        for (const listener of listeners) {
          try {
            listener(event, data);
          } catch {
            // 单个监听器异常不影响其他监听器。
          }
        }
      });
      this.eventBridge?.();
      this.eventBridge = unsubscribe;
    }
    try {
      await client.start();
      await client.waitForReady(10_000);
    } catch (error) {
      // 骨架阶段允许 Sidecar 不可用；状态记录供上层判断。失败后清空 client，
      // 允许后续 request() 惰性重试重启。
      this.lastError = error instanceof Error ? error.message : String(error);
      this.client = null;
    }
  }

  /** 在 app before-quit 时调用，优雅关闭 Sidecar。 */
  async stop(): Promise<void> {
    this.eventBridge?.();
    this.eventBridge = null;
    if (this.client) {
      await this.client.stop().catch(() => undefined);
      this.client = null;
    }
  }

  /** 供 IPC / 诊断查询当前运行状态。 */
  getStatus(): { status: RustCoreStatus; running: boolean; error?: string } {
    if (!this.client) {
      return { status: "idle", running: false, error: this.lastError };
    }
    return {
      status: this.client.currentStatus,
      running: this.client.isRunning,
      error: this.lastError,
    };
  }

  /** 发送 ping 诊断。失败会抛出。 */
  async ping(): Promise<{ status: string; protocolVersion: number }> {
    return this.request("system.ping", {});
  }

  /** 订阅 Rust Sidecar 事件（如 `video.progress`）。返回取消订阅函数。 */
  onEvent(listener: (event: string, data: unknown) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  /** 通用请求入口：未启动时惰性启动；启动失败抛错。 */
  async request<T>(method: string, params: unknown): Promise<T> {
    if (!this.client) {
      await this.start();
    }
    if (!this.client) {
      throw new Error(this.lastError ?? "Rust Core 尚未启动");
    }
    return this.client.request<T>(method, params);
  }

  private lastError: string | undefined;
}

export const rustCoreRuntime = new RustCoreRuntime();