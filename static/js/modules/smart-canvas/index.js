/**
 * SmartCanvas ESM 模块主入口
 */
import { EventBus, globalEventBus } from './core/event-bus.js';
import { CanvasStateStore, canvasStateStore } from './core/canvas-state.js';
import { ViewTransformEngine, viewTransformEngine } from './render/view-transform.js';
import { ConnectionLineRenderer, connectionLineRenderer } from './render/connection-line.js';
import { NodeFactory, nodeFactory } from './nodes/node-factory.js';
import { CanvasAPIService, canvasAPIService } from './api/canvas-api.js';

// 向全局挂载向下兼容代理
if (typeof window !== 'undefined') {
    window.smartCanvasEventBus = globalEventBus;
    window.canvasStateStore = canvasStateStore;
    window.viewTransformEngine = viewTransformEngine;
    window.connectionLineRenderer = connectionLineRenderer;
    window.nodeFactory = nodeFactory;
    window.canvasAPIService = canvasAPIService;
    window.SmartCanvasModules = {
        EventBus,
        globalEventBus,
        CanvasStateStore,
        canvasStateStore,
        ViewTransformEngine,
        viewTransformEngine,
        ConnectionLineRenderer,
        connectionLineRenderer,
        NodeFactory,
        nodeFactory,
        CanvasAPIService,
        canvasAPIService
    };
    console.log('[SmartCanvas ESM] 智能画布全套原生 ESM 模块套件重构完成，已就绪！');
}

export {
    EventBus,
    globalEventBus,
    CanvasStateStore,
    canvasStateStore,
    ViewTransformEngine,
    viewTransformEngine,
    ConnectionLineRenderer,
    connectionLineRenderer,
    NodeFactory,
    nodeFactory,
    CanvasAPIService,
    canvasAPIService
};
