/**
 * 文件: js/main.js
 * 应用入口: 装配视图, 生成各视图场景, 处理选择切换, 动画循环
 */

import * as THREE from 'three';

// 引入 视图装配
import { buildViews } from './core/viewRegistry.js';

// 引入 窗口自适应
import { initWindowResize } from './core/sceneSetup.js';

// 引入 相机旋转
import {
  // setupRecorder,
  updateRotation,
  getIsRotating,
  updateHint
} from './core/recorder.js';

// 引入 交互按钮
import { setupUI, syncModeButtons } from './ui/controlsUI.js';

// 引入 导航
import { initNav, realignIndicator } from './ui/nav.js';

// 引入 场景
import { renderCIncremental, startAct, stopAct } from './view/sceneC.js';
import { makeVScene } from './view/sceneV.js';
import { makeFScene } from './view/sceneF.js';
import { makeNewScene } from './view/sceneCRPs.js';

// ============================================================
// a.1. 装配视图 (环境 / 控制器 / 承载对象 / 中键聚焦)
// ============================================================
let frustum = 8;
let aspect = window.innerWidth / window.innerHeight;

// 唯一的视图表: key -> { scene, camera, label, renderer, spawnedGroups, controls, target, focus }
const viewMap = buildViews(frustum, aspect, () => getIsRotating());

// 当前视图 key
let currentMode = 'CRPs/3,3';

// 右键菜单禁用
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// ============================================================
// a.2. 窗口自适应
// ============================================================
const allCameras = Object.values(viewMap).map(v => v.camera);
const allRenderers = Object.values(viewMap).map(v => v.renderer);
const allLabels = Object.values(viewMap).map(v => v.label);

initWindowResize(frustum, allCameras, allRenderers, allLabels);

// 窗口尺寸变化时, 重新对齐左侧指示块
window.addEventListener('resize', () => {
  realignIndicator();
});

// ============================================================
// b. 展示几何体对象
// ============================================================

// 暂停 (毫秒)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

makeVScene(viewMap['120cells/V'].target);
makeFScene(viewMap['120cells/F'].target);

makeNewScene([3, 3], ['x', 'o', 'o'], viewMap['CRPs/3,3'].target);
makeNewScene([4, 3], ['x', 'o', 'o'], viewMap['CRPs/4,3'].target);
makeNewScene([5, 3], ['x', 'o', 'o'], viewMap['CRPs/5,3'].target);

// 初始化录制 与 相机自动旋转 (录制只针对 C 视图)
// const C = viewMap['120cells/C'];
// setupRecorder(C.renderer, C.camera, C.controls);

// 更新 下方小字提示
updateHint();

// ============================================================
// c.1. 全局 状态切换
// ============================================================
const sliderC = document.getElementById('sliderC');
//const ui = document.getElementById('ui');
const rangeC = document.getElementById('range-c');
const rangeCVal = document.getElementById('range-c-val');
const canvasWrap = document.getElementById('canvas-wrap');
const placeholder = document.getElementById('placeholder');

let sliderCount = parseInt(rangeC.value, 10);
let sliderActive = false;

function showOnly(viewKey) {
  const cur = viewMap[viewKey];
  for (const r of allRenderers) {
    r.domElement.style.display = (cur && r === cur.renderer) ? '' : 'none';
  }
  for (const l of allLabels) {
    l.domElement.style.display = (cur && l === cur.label) ? '' : 'none';
  }
}

// ---- 状态切换 总部 ----
function setMode(viewKey) {
  // 如果已经在目标视图, 直接返回
  if (viewKey === currentMode) return;

  // 1. 离开当前视图: 停建造循环、禁用当前视图的 controls
  const prev = viewMap[currentMode];
  if (prev) {
    if (currentMode === '120cells/C') {
      stopAct();
    }
    prev.controls.enabled = false;
    prev.controls.update();
  }

  // 2. 进入新视图
  const isOthers = viewKey === 'others/empty';
  if (isOthers) {
    // others: 无画布, 黑色背景 + 中心文字
    canvasWrap.style.display = 'none';
    placeholder.style.display = 'flex';
    for (const r of allRenderers) r.domElement.style.display = 'none';
    for (const l of allLabels) l.domElement.style.display = 'none';
    sliderC.style.display = 'none';
    // ui.style.display = 'none';
    currentMode = viewKey;
    syncModeButtons('');
    return;
  }

  canvasWrap.style.display = '';
  placeholder.style.display = 'none';
  showOnly(viewKey);

  const next = viewMap[viewKey];
  if (next) {
    next.controls.update();
    if (viewKey !== '120cells/C' || !getIsRotating()) {
      next.controls.enabled = true;
    }
  }

  // C 模式专用: 滑块显示与首次构建
  if (viewKey === '120cells/C') {
    sliderC.style.display = '';
    // ui.style.display = '';
    if (viewMap['120cells/C'].spawnedGroups.length === 0) {
      if (sliderActive) {
        renderCIncremental(sliderCount, viewMap['120cells/C'].target);
      } else {
        startAct(sleep, viewMap['120cells/C'].target);
      }
    }
  } else {
    sliderC.style.display = 'none';
    // ui.style.display = 'none';
  }

  currentMode = viewKey;
  syncModeButtons(currentMode === '120cells/C' ? 'C'
    : currentMode === '120cells/F' ? 'F'
      : currentMode === '120cells/V' ? 'V' : '');
}

// 初始化左侧与顶部导航
initNav((viewKey) => {
  setMode(viewKey);
});

const deps = {
  setMode: (mode) => setMode(`120cells/${mode}`),
  stopAct,
  getCurrentMode: () => currentMode === '120cells/C' ? 'C'
    : currentMode === '120cells/F' ? 'F'
      : currentMode === '120cells/V' ? 'V' : '',
  renderCIncremental,
  updateSliderState: (count) => {
    sliderCount = count;
    sliderActive = true;
  }
};

// 增加 对应的跳转按钮与滑块
setupUI('C', deps, viewMap['120cells/C'].target);
setupUI('F', deps, viewMap['120cells/F'].target);
setupUI('V', deps, viewMap['120cells/V'].target);

// 初始状态: CRPs/{3,3}
canvasWrap.style.display = '';
placeholder.style.display = 'none';
sliderC.style.display = 'none';
showOnly('CRPs/3,3');
rangeCVal.textContent = String(sliderCount);
syncModeButtons('');
sliderActive = true;

// 先全部禁用, 再单独启用当前视图
for (const v of Object.values(viewMap)) {
  v.controls.enabled = false;
}
viewMap['CRPs/3,3'].controls.enabled = true;

// ============================================================
// c.2. 动画循环
// ============================================================
function animate() {
  requestAnimationFrame(animate);

  const view = viewMap[currentMode];

  // others: 无画布, 不渲染三维内容
  if (!view) {
    return;
  }

  const { scene, camera, label, controls, renderer, focus } = view;

  if (currentMode === '120cells/C') {
    updateRotation(viewMap['120cells/C'].camera, viewMap['120cells/C'].controls);
    focus();
    if (!getIsRotating() && viewMap['120cells/C'].controls.enabled) {
      viewMap['120cells/C'].controls.update();
    }
  } else {
    focus();
    if (controls.enabled) controls.update();
  }

  updateHint();

  renderer.render(scene, camera);
  label.render(scene, camera);
}
animate();