/**
 * Smart Canvas Undo/Redo History Manager
 * Single responsibility: manage history undo/redo stacks.
 */

export class HistoryManager {
    constructor(maxDepth = 50) {
        this.undoStack = [];
        this.redoStack = [];
        this.maxDepth = maxDepth;
    }

    pushUndo(stateSnapshot) {
        if (!stateSnapshot) return;
        this.undoStack.push(JSON.parse(JSON.stringify(stateSnapshot)));
        if (this.undoStack.length > this.maxDepth) {
            this.undoStack.shift();
        }
        this.redoStack = [];
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }

    popUndo(currentStateSnapshot) {
        if (!this.canUndo()) return null;
        if (currentStateSnapshot) {
            this.redoStack.push(JSON.parse(JSON.stringify(currentStateSnapshot)));
        }
        return this.undoStack.pop();
    }

    popRedo(currentStateSnapshot) {
        if (!this.canRedo()) return null;
        if (currentStateSnapshot) {
            this.undoStack.push(JSON.parse(JSON.stringify(currentStateSnapshot)));
        }
        return this.redoStack.pop();
    }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }
}

export const historyManager = new HistoryManager();
