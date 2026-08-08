/**
 * SmartCanvas ESM 模块主入口
 */
import { EventBus, globalEventBus } from './core/event-bus.js';
import { CanvasStateStore, canvasStateStore } from './core/canvas-state.js';
import { ViewTransformEngine, viewTransformEngine } from './render/view-transform.js';
import { ConnectionLineRenderer, connectionLineRenderer } from './render/connection-line.js';
import { NodeFactory, nodeFactory } from './nodes/node-factory.js';
import { CanvasAPIService, canvasAPIService } from './api/canvas-api.js';

import { NodeStatusBus, globalNodeStatusBus } from './core/status-bus.js';
import { CascadeTracker, globalCascadeTracker } from './core/cascade-tracker.js';
import * as AgentTaskNodeModule from './nodes/agent-task-node.js';

import { ViewportEngine, viewportEngine } from './core/viewport-engine.js';
import { NodeRendererMain, nodeRendererMain } from './render/node-renderer-main.js';
import { CanvasApp, canvasApp } from './core/canvas-app.js';

import { ComposerPanelController, composerPanelController } from './ui/composer-panel.js';
import { CreateMenuController, createMenuController } from './ui/create-menu.js';
import { ImageEditorController, imageEditorController } from './ui/image-editor.js';
import { CascadeRunner, globalCascadeRunner } from './core/cascade-runner.js';
import { GenerationService, globalGenerationService } from './api/generation-service.js';

// 向全局挂载向下兼容代理
if (typeof window !== 'undefined') {
    window.smartCanvasEventBus = globalEventBus;
    window.canvasStateStore = canvasStateStore;
    window.viewTransformEngine = viewTransformEngine;
    window.connectionLineRenderer = connectionLineRenderer;
    window.nodeFactory = nodeFactory;
    window.canvasAPIService = canvasAPIService;
    window.nodeStatusBus = globalNodeStatusBus;
    window.globalNodeStatusBus = globalNodeStatusBus;
    window.NodeStatusBus = NodeStatusBus;
    window.cascadeTracker = globalCascadeTracker;
    window.globalCascadeTracker = globalCascadeTracker;
    window.CascadeTracker = CascadeTracker;
    window.AgentTaskNodeModule = AgentTaskNodeModule;
    window.composerPanelController = composerPanelController;
    window.createMenuController = createMenuController;
    window.imageEditorController = imageEditorController;
    window.cascadeRunner = globalCascadeRunner;
    window.generationService = globalGenerationService;
    window.viewportEngine = viewportEngine;
    window.nodeRendererMain = nodeRendererMain;
    window.canvasApp = canvasApp;
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
        canvasAPIService,
        NodeStatusBus,
        globalNodeStatusBus,
        CascadeTracker,
        globalCascadeTracker,
        AgentTaskNodeModule,
        ComposerPanelController,
        composerPanelController,
        CreateMenuController,
        createMenuController,
        ImageEditorController,
        imageEditorController,
        CascadeRunner,
        globalCascadeRunner,
        GenerationService,
        globalGenerationService,
        ViewportEngine,
        viewportEngine,
        NodeRendererMain,
        nodeRendererMain,
        CanvasApp,
        canvasApp
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
    canvasAPIService,
    NodeStatusBus,
    globalNodeStatusBus,
    CascadeTracker,
    globalCascadeTracker,
    AgentTaskNodeModule,
    ImageEditorController,
    imageEditorController,
    CascadeRunner,
    globalCascadeRunner,
    GenerationService,
    globalGenerationService
};

