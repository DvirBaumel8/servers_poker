/**
 * worker-pool.ts
 * ==============
 * Fixed-size pool of reusable Worker Threads for tournament simulation.
 * Workers stay alive between tasks; tasks are dispatched via postMessage.
 * No external dependencies.
 */

import { Worker } from "worker_threads";
import {
  SimulationInput,
  SimulationOutput,
  WorkerToPoolMessage,
  PoolToWorkerMessage,
  PoolMetrics,
} from "./simulation.types";

// ─── Internal state ───────────────────────────────────────────────────────────

interface WorkerSlot {
  worker: Worker;
  /** "starting" until the worker sends its first "ready" message. */
  status: "starting" | "idle" | "busy";
  currentTaskId: string | null;
  /** ms timestamp of last received heartbeat or "ready". */
  lastHeartbeat: number;
  startedTaskAt: number | null;
}

interface PoolTask {
  taskId: string;
  input: SimulationInput;
  resolve: (output: SimulationOutput) => void;
  reject: (err: Error) => void;
  enqueuedAt: number;
}

const HEARTBEAT_CHECK_INTERVAL_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 30_000;
const METRICS_WINDOW = 100;

// ─── WorkerPool ───────────────────────────────────────────────────────────────

export class WorkerPool {
  private readonly slots: WorkerSlot[] = [];
  /** Tasks waiting for an idle worker. */
  private readonly queue: PoolTask[] = [];
  /** In-flight tasks keyed by taskId — needed to resolve/reject on result or crash. */
  private readonly inflightTasks = new Map<string, PoolTask>();

  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private isShuttingDown = false;

  // Metrics
  private totalTasksCompleted = 0;
  private totalTasksFailed = 0;
  private readonly recentWaitSamples: number[] = [];
  private readonly recentTaskSamples: number[] = [];

  constructor(
    private readonly size: number,
    private readonly workerPath: string,
    private readonly execArgv: string[],
  ) {
    for (let i = 0; i < size; i++) {
      this.slots.push(this.spawnWorker());
    }
    this.heartbeatTimer = setInterval(
      () => this.checkHeartbeats(),
      HEARTBEAT_CHECK_INTERVAL_MS,
    );
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  dispatch(taskId: string, input: SimulationInput): Promise<SimulationOutput> {
    if (this.isShuttingDown) {
      return Promise.reject(new Error("WorkerPool is shutting down"));
    }
    return new Promise<SimulationOutput>((resolve, reject) => {
      const task: PoolTask = {
        taskId,
        input,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };
      const idleSlot = this.slots.find((s) => s.status === "idle");
      if (idleSlot) {
        this.assignTask(idleSlot, task);
      } else {
        this.queue.push(task);
      }
    });
  }

  getMetrics(): PoolMetrics {
    const activeWorkers = this.slots.filter((s) => s.status === "busy").length;
    const idleWorkers = this.slots.filter((s) => s.status === "idle").length;
    return {
      poolSize: this.size,
      activeWorkers,
      idleWorkers,
      queuedTasks: this.queue.length,
      totalTasksCompleted: this.totalTasksCompleted,
      totalTasksFailed: this.totalTasksFailed,
      recentAvgWaitMs: this.rollingAvg(this.recentWaitSamples),
      recentAvgTaskMs: this.rollingAvg(this.recentTaskSamples),
    };
  }

  shutdown(): void {
    this.isShuttingDown = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    // Reject queued tasks
    while (this.queue.length > 0) {
      this.queue.shift()!.reject(new Error("WorkerPool shut down"));
    }
    // Reject in-flight tasks then terminate workers
    for (const task of this.inflightTasks.values()) {
      task.reject(new Error("WorkerPool shut down"));
    }
    this.inflightTasks.clear();
    for (const slot of this.slots) {
      slot.worker.terminate();
    }
  }

  // ─── Worker lifecycle ────────────────────────────────────────────────────────

  private spawnWorker(): WorkerSlot {
    const worker = new Worker(this.workerPath, { execArgv: this.execArgv });
    const slot: WorkerSlot = {
      worker,
      status: "starting",
      currentTaskId: null,
      lastHeartbeat: Date.now(),
      startedTaskAt: null,
    };

    worker.on("message", (msg: WorkerToPoolMessage) => {
      this.handleWorkerMessage(slot, msg);
    });
    worker.on("error", (err: Error) => {
      this.handleWorkerCrash(slot, err);
    });
    worker.on("exit", (code: number) => {
      if (!this.isShuttingDown && code !== 0) {
        this.handleWorkerCrash(
          slot,
          new Error(`Worker exited unexpectedly with code ${code}`),
        );
      }
    });

    return slot;
  }

  /** Replace the Worker inside an existing slot in-place, keeping the slot object. */
  private replaceWorkerInSlot(slot: WorkerSlot): void {
    const replacement = new Worker(this.workerPath, {
      execArgv: this.execArgv,
    });
    slot.worker = replacement;
    slot.status = "starting";
    slot.currentTaskId = null;
    slot.startedTaskAt = null;
    slot.lastHeartbeat = Date.now();

    replacement.on("message", (msg: WorkerToPoolMessage) => {
      this.handleWorkerMessage(slot, msg);
    });
    replacement.on("error", (err: Error) => {
      this.handleWorkerCrash(slot, err);
    });
    replacement.on("exit", (code: number) => {
      if (!this.isShuttingDown && code !== 0) {
        this.handleWorkerCrash(
          slot,
          new Error(`Replacement worker exited with code ${code}`),
        );
      }
    });
  }

  // ─── Message & event handlers ────────────────────────────────────────────────

  private handleWorkerMessage(
    slot: WorkerSlot,
    msg: WorkerToPoolMessage,
  ): void {
    if (msg.type === "ready") {
      slot.status = "idle";
      slot.lastHeartbeat = Date.now();
      this.tryDispatchFromQueue(slot);
      return;
    }

    if (msg.type === "heartbeat") {
      slot.lastHeartbeat = Date.now();
      return;
    }

    if (msg.type === "result") {
      const task = this.inflightTasks.get(msg.taskId);
      if (task) {
        this.inflightTasks.delete(msg.taskId);
        this.recordMetrics(task, slot);
        this.totalTasksCompleted++;
        task.resolve(msg.output);
      }
      this.freeSlot(slot);
      return;
    }

    if (msg.type === "error") {
      const task = this.inflightTasks.get(msg.taskId);
      if (task) {
        this.inflightTasks.delete(msg.taskId);
        this.totalTasksFailed++;
        task.reject(new Error(msg.error));
      }
      this.freeSlot(slot);
    }
  }

  private handleWorkerCrash(slot: WorkerSlot, err: Error): void {
    if (this.isShuttingDown) return;

    // Reject the in-flight task if any
    const taskId = slot.currentTaskId;
    if (taskId) {
      const task = this.inflightTasks.get(taskId);
      if (task) {
        this.inflightTasks.delete(taskId);
        this.totalTasksFailed++;
        task.reject(new Error(`Worker crashed: ${err.message}`));
      }
    }

    // Replace the dead worker in-place (slot object stays the same reference)
    this.replaceWorkerInSlot(slot);
  }

  private checkHeartbeats(): void {
    const now = Date.now();
    for (const slot of this.slots) {
      if (slot.status !== "busy") continue;
      const silenceMs = now - slot.lastHeartbeat;
      if (silenceMs > HEARTBEAT_TIMEOUT_MS) {
        slot.worker.terminate(); // triggers "exit" event with non-zero code
        this.handleWorkerCrash(
          slot,
          new Error(`Worker heartbeat timeout — silent for ${silenceMs}ms`),
        );
      }
    }
  }

  // ─── Task dispatch helpers ───────────────────────────────────────────────────

  private assignTask(slot: WorkerSlot, task: PoolTask): void {
    const waitMs = Date.now() - task.enqueuedAt;
    this.addSample(this.recentWaitSamples, waitMs);

    slot.status = "busy";
    slot.currentTaskId = task.taskId;
    slot.startedTaskAt = Date.now();
    slot.lastHeartbeat = Date.now();
    this.inflightTasks.set(task.taskId, task);

    const msg: PoolToWorkerMessage = {
      type: "run",
      taskId: task.taskId,
      input: task.input,
    };
    slot.worker.postMessage(msg);
  }

  private freeSlot(slot: WorkerSlot): void {
    slot.status = "idle";
    slot.currentTaskId = null;
    slot.startedTaskAt = null;
    this.tryDispatchFromQueue(slot);
  }

  private tryDispatchFromQueue(slot: WorkerSlot): void {
    if (this.queue.length === 0) return;
    const next = this.queue.shift()!;
    this.assignTask(slot, next);
  }

  // ─── Metrics helpers ─────────────────────────────────────────────────────────

  private recordMetrics(task: PoolTask, slot: WorkerSlot): void {
    const now = Date.now();
    const taskMs = now - (slot.startedTaskAt ?? now);
    this.addSample(this.recentTaskSamples, taskMs);
  }

  private addSample(arr: number[], value: number): void {
    arr.push(value);
    if (arr.length > METRICS_WINDOW) arr.shift();
  }

  private rollingAvg(arr: number[]): number {
    if (arr.length === 0) return 0;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }
}
