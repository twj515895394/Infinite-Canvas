/**
 * Legacy Canvas ESM Main Entry
 * 传统单节点画布原生 ESM 模块套件主入口
 */
import { CanvasEngine, canvasEngine } from './core/canvas-engine.js';
import { LinksRenderer, linksRenderer } from './core/links-renderer.js';
import { ToolbarController, toolbarController } from './ui/toolbar-controller.js';
import { LightboxController, lightboxController } from './ui/lightbox-controller.js';
import { LegacyNodeFactory, legacyNodeFactory } from './nodes/node-factory.js';

if (typeof window !== 'undefined') {
    window.canvasEngine = canvasEngine;
    window.linksRenderer = linksRenderer;
    window.toolbarController = toolbarController;
    window.lightboxController = lightboxController;
    window.legacyNodeFactory = legacyNodeFactory;

    window.LegacyCanvasModules = {
        CanvasEngine,
        canvasEngine,
        LinksRenderer,
        linksRenderer,
        ToolbarController,
        toolbarController,
        LightboxController,
        lightboxController,
        LegacyNodeFactory,
        legacyNodeFactory
    };

    console.log('[Legacy Canvas ESM] 传统单节点画布 ESM 模块化架构已成功载入！');
}

export {
    CanvasEngine,
    canvasEngine,
    LinksRenderer,
    linksRenderer,
    ToolbarController,
    toolbarController,
    LightboxController,
    lightboxController,
    LegacyNodeFactory,
    legacyNodeFactory
};
