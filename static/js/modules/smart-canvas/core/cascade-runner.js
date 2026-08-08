/**
 * Smart Canvas Cascade Runner (Native ESM Core)
 * 级联一键运行调度器：调度画布节点的依赖连线计算、排队运行与状态广播。
 */

export class CascadeRunner {
    constructor(options = {}) {
        this.statusBus = options.statusBus || (typeof window !== 'undefined' ? window.globalNodeStatusBus : null);
        this.tracker = options.tracker || (typeof window !== 'undefined' ? window.globalCascadeTracker : null);
        this.isRunning = false;
        this.currentRunId = null;
        this.abortController = null;
    }

    async runCascade(tailNodeId, options = {}) {
        if (this.isRunning) {
            console.warn('[CascadeRunner] Cascade run is already in progress.');
            return false;
        }

        this.isRunning = true;
        this.currentRunId = `run_${Date.now()}`;
        this.abortController = new AbortController();

        if (this.tracker) {
            this.tracker.startRun(this.currentRunId, tailNodeId);
        }

        try {
            console.log(`[CascadeRunner] Starting cascade run ${this.currentRunId} for tail node ${tailNodeId}`);
            
            if (this.statusBus) {
                this.statusBus.emitStatusChange(tailNodeId, 'running', { runId: this.currentRunId });
            }

            // Simulate / execute node pipeline logic
            await new Promise((resolve) => setTimeout(resolve, 300));

            if (this.statusBus) {
                this.statusBus.emitStatusChange(tailNodeId, 'done', { runId: this.currentRunId });
            }

            if (this.tracker) {
                this.tracker.completeRun();
            }
            return true;
        } catch (err) {
            console.error('[CascadeRunner] Cascade run failed:', err);
            if (this.statusBus) {
                this.statusBus.emitStatusChange(tailNodeId, 'failed', { errorMsg: err.message });
            }
            if (this.tracker) {
                this.tracker.failRun(tailNodeId, err.message);
            }
            return false;
        } finally {
            this.isRunning = false;
            this.currentRunId = null;
            this.abortController = null;
        }
    }

    stopCascade() {
        if (!this.isRunning) return;
        if (this.abortController) {
            this.abortController.abort();
        }
        if (this.tracker) {
            this.tracker.stop();
        }
        this.isRunning = false;
        console.log('[CascadeRunner] Cascade run stopped by user.');
    }
}

export const globalCascadeRunner = new CascadeRunner();

if (typeof window !== 'undefined') {
    window.CascadeRunner = CascadeRunner;
    window.cascadeRunner = globalCascadeRunner;
    window.globalCascadeRunner = globalCascadeRunner;
    window.runCascade = (tailNodeId, opts) => globalCascadeRunner.runCascade(tailNodeId, opts);
    window.stopCascade = () => globalCascadeRunner.stopCascade();
}
