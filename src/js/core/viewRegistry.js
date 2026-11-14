/**
 * 文件: js/core/viewRegistry.js
 * 视图装配: 为每个视图创建 环境 (scene / camera / renderer / labelRenderer) ·
 * 控制器 (controls) · 承载对象 (target) · 中键聚焦 (focus)
 * 仅做装配, 不涉及 DOM 交互 · 状态切换 · 渲染循环
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createViewEnvironment, initFocusControls } from './sceneSetup.js';

// 创建控制器 (绑定该视图自己的 canvas)
function makeControls(camera, domElement) {
  const c = new OrbitControls(camera, domElement);
  c.enableDamping = true;
  c.dampingFactor = 0.1;
  c.target.set(0, 0, 0);
  c.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN,
  };
  return c;
}

/**
 * 构建全部视图
 * @param {number} frustum - 相机视锥体大小
 * @param {number} aspect - 宽高比
 * @param {Function} getIsRotating - 查询是否处于自动旋转状态 (供中键聚焦使用)
 * @returns {Object} viewDefs - key 为视图标识, value 含 scene / camera / label /
 *   renderer / spawnedGroups / controls / target / focus
 */
export function buildViews(frustum, aspect, getIsRotating) {
  // 1. 创建六套环境 (每套独立 scene / camera / renderer / labelRenderer)
  const envC = createViewEnvironment(frustum, aspect);
  const envF = createViewEnvironment(frustum, aspect);
  const envV = createViewEnvironment(frustum, aspect);
  const envCRP33 = createViewEnvironment(frustum, aspect);
  const envCRP43 = createViewEnvironment(frustum, aspect);
  const envCRP53 = createViewEnvironment(frustum, aspect);

  // 2. 视图登记表
  const viewDefs = {
    '120cells/C': { scene: envC.scene, camera: envC.camera, label: envC.labelRenderer, renderer: envC.renderer, spawnedGroups: [] },
    '120cells/F': { scene: envF.scene, camera: envF.camera, label: envF.labelRenderer, renderer: envF.renderer, spawnedGroups: [] },
    '120cells/V': { scene: envV.scene, camera: envV.camera, label: envV.labelRenderer, renderer: envV.renderer, spawnedGroups: [] },
    'CRPs/3,3': { scene: envCRP33.scene, camera: envCRP33.camera, label: envCRP33.labelRenderer, renderer: envCRP33.renderer, spawnedGroups: [] },
    'CRPs/4,3': { scene: envCRP43.scene, camera: envCRP43.camera, label: envCRP43.labelRenderer, renderer: envCRP43.renderer, spawnedGroups: [] },
    'CRPs/5,3': { scene: envCRP53.scene, camera: envCRP53.camera, label: envCRP53.labelRenderer, renderer: envCRP53.renderer, spawnedGroups: [] },
  };

  // 3. 为每个视图派生 controls / target / focus
  for (const v of Object.values(viewDefs)) {
    v.controls = makeControls(v.camera, v.renderer.domElement);
    v.target = { scene: v.scene, spawnedGroups: v.spawnedGroups };
    v.focus = initFocusControls(
      { renderer: v.renderer, camera: v.camera, controls: v.controls },
      getIsRotating
    );
  }

  return viewDefs;
}