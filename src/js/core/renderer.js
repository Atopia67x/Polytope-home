/**
 * 文件: js/core/renderer.js
 * 核心渲染, 接收 几何数据和变换矩阵, 生成 Three.js 的 Group
 */

import * as THREE from 'three';

import { WHITE, lightenColor } from '../data/constants.js';

import { affined } from '../math/transform.js';

import { VectorX } from '../math/vectorX.js';

import {
  EPS, // 允许误差
  getNDBasicVec,
  dimensionSymbols,
  dimensionElements
} from '../math/polytopeGeometry.js';

import { buildPoset } from '../math/polytopeSymmetry.js';

const DEG = 180 / Math.PI;
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

// 生成顶点 (?)
// target 为 { scene, spawnedGroups } 形式的承载对象
export function showPoints(vertices, vertexColor, target) {
  const { scene, spawnedGroups } = target;

  const sphereGeo = new THREE.SphereGeometry(0.08, 8, 6);
  const sphereMat = new THREE.MeshBasicMaterial({
    color: vertexColor
  });
  const inst = new THREE.InstancedMesh(sphereGeo, sphereMat, vertices.length);

  const matrix = new THREE.Matrix4();
  vertices.forEach((v, i) => {
    matrix.setPosition(...v);
    inst.setMatrixAt(i, matrix);
  });
  scene.add(inst);
}

/**
 * 根据偏序集 (poset) 一体成型渲染 点-棱-面
 * 
 * @param {Object} poset - 包含 vertexList, edgeList, faceList 的数据对象
 * @param {Object} opts - 样式
 * @param {Object} target - { scene, spawnedGroups }
 */
export function make3DShapeFromPoset(poset, opts = {}, target) {
  const { vertexList, edgeList, faceList, cellList = [] } = poset;
  const { scene, spawnedGroups } = target;

  const {
    colormode = 0,
    colours = WHITE,
    showEdges = true,
    showVertices = true,
    name = 'unnamed-poset',
  } = opts;

  let faceColor, edgeColor, vertexColor;
  if (colormode === 0) {
    if (typeof colours === 'number') {
      [faceColor, edgeColor, vertexColor] = [colours, lightenColor(colours, 0.2), colours];
    } else {
      [faceColor, edgeColor, vertexColor] = colours;
    }
  } else if (colormode === 1) {
    faceColor = colours;
  }

  // 1. 坐标提取
  const newVertices = vertexList.map(v => {
    // 兼容传入 VectorX 对象 · Vector3 · 普通数组
    if (v.isVectorX) {
      return v.elements;
    }
    else if (v.isVector3) {
      return [v.x, v.y, v.z];
    }
    else {
      // 普通数组
      return [v[0] || 0, v[1] || 0, v[2] || 0];
    }
  });

  const group = new THREE.Group();
  group.name = name;

  // 2. 渲染顶点
  if (showVertices && newVertices.length > 0) {
    const pg = new THREE.BufferGeometry();
    const arr = new Float32Array(newVertices.length * 3);
    newVertices.forEach((v, i) => {
      arr[i * 3] = v[0]; arr[i * 3 + 1] = v[1]; arr[i * 3 + 2] = v[2];
    });
    pg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    group.add(new THREE.Points(pg, new THREE.PointsMaterial({
      color: vertexColor, size: 6, sizeAttenuation: false,
    })));
  }

  // 3. 渲染棱 (圆柱体)
  if (showEdges && edgeList && edgeList.length > 0) {
    const edgeMat = new THREE.MeshStandardMaterial({
      color: edgeColor, metalness: 0.3, roughness: 0.6,
    });
    const up = new THREE.Vector3(0, 1, 0);
    const R = 0.02;

    for (const edge of edgeList) {
      const [i, j] = edge;
      const a = new THREE.Vector3(...newVertices[i]);
      const b = new THREE.Vector3(...newVertices[j]);
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(R, R, len, 8), edgeMat
      );
      cyl.position.copy(a).addScaledVector(dir, 0.5);
      cyl.quaternion.setFromUnitVectors(up, dir.clone().normalize());
      group.add(cyl);
    }
  }

  // 4. 渲染面 (每个面独立一个 mesh, 颜色来自 faceColor)
  if (faceList && faceList.length > 0) {
    for (let fi = 0; fi < faceList.length; fi++) {
      const f = faceList[fi];
      let color = (colormode === 1) ? faceColor[fi] : faceColor;

      const fpos = [], fnrm = [];
      const p0 = new THREE.Vector3(...newVertices[f[0]]);
      const p1 = new THREE.Vector3(...newVertices[f[1]]);
      const p2 = new THREE.Vector3(...newVertices[f[2]]);
      const n = new THREE.Vector3()
        .subVectors(p1, p0)
        .cross(new THREE.Vector3().subVectors(p2, p0)).normalize();

      const center = new THREE.Vector3(
        f.reduce((s, i) => s + newVertices[i][0], 0) / f.length,
        f.reduce((s, i) => s + newVertices[i][1], 0) / f.length,
        f.reduce((s, i) => s + newVertices[i][2], 0) / f.length,
      );
      if (n.dot(center) < 0) n.negate();

      // 扇形三角剖分
      for (let k = 1; k < f.length - 1; k++) {
        const a = new THREE.Vector3(...newVertices[f[0]]);
        const b = new THREE.Vector3(...newVertices[f[k]]);
        const c = new THREE.Vector3(...newVertices[f[k + 1]]);
        const cross = new THREE.Vector3()
          .subVectors(b, a)
          .cross(new THREE.Vector3().subVectors(c, a));
        if (cross.dot(n) < 0) {
          fpos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
        } else {
          fpos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        }
        fnrm.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
      }

      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
      fg.setAttribute('normal', new THREE.Float32BufferAttribute(fnrm, 3));

      const fm = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.0, roughness: 0.7,
        flatShading: true, side: THREE.DoubleSide,
        transparent: true, opacity: 1 // 加透明度, 方便看内部线框
      });

      group.add(new THREE.Mesh(fg, fm));
    }
  }

  scene.add(group);
  spawnedGroups.push(group);
  return group;
}

/**
 * 旧制 生成图形渲染 makeShapeTransformed
 * 
 * @param {any[]} source 偏序集 列表
 * @param {THREE.Matrix4} scalar 缩放矩阵
 * @param {THREE.Matrix4} rotator 旋转矩阵
 * @param {THREE.Matrix4} translator 平移矩阵
 * @param {any[]} opts 样式
 * @param {Object} target { scene, spawnedGroups }
 */
export function makeShapeTransformed(source, scalar, rotator, translator, opts = {}, target) {
  const [vertexList, edgeList, faceList] = source;

  const aff = affined(source).clone(); // 坐标系 转换矩阵
  const affinv = aff.clone().invert();

  // A = T R D⁻¹ S D
  const transformer = translator.clone()
    .multiply(rotator)
    .multiply(affinv)
    .multiply(scalar)
    .multiply(aff);

  const newVertices = vertexList.map(v => {
    const p = new THREE.Vector3(v[0], v[1], v[2]);
    p.applyMatrix4(transformer);
    return p;
  });
  const poset = { vertexList: newVertices, edgeList, faceList };
  return make3DShapeFromPoset(poset, opts, target);
}

/**
 * 实践理念: 面向 经典正多胞形 (Classical Regular Polytopes, CRPs) 的 通用化建模方法论 (Methodology)
 * 按 CRPs 方法论 生成图形渲染 (目前仅适用于 n === 3 维)
 */
export function makeShapeInCRPs(schlafli, rings, opts, target) {
  const builder = buildPoset(schlafli)
  const basicVec = getNDBasicVec(schlafli, rings);
  const poset = builder(basicVec);
  return make3DShapeFromPoset(cleanPoset(poset), opts, target);
}

/**
 * 偏序集 (Poset) 的 faceList 顶点下标化 与 去重
 * @param {Object} poset 含顶点具体坐标 的 偏序集 对象
 * @returns {Object} 去重后的 偏序集 对象
 */
export function cleanPoset(poset) {
  const dimE = dimensionSymbols.split('').map(e => dimensionElements[e]);
  const EPS_SQ = EPS * EPS;

  // 识别这个偏序集包含哪些维度
  const keys = Object.keys(poset);
  const n = keys.length;
  if (n < 1) return poset;

  const cleanedPoset = {};
  const oldToNewMaps = {};

  // ==========================================
  // 第一步: 顶点去重 (vertexList)
  // ==========================================
  const rawVertices = poset.vertexList || [];
  const uniqueVertices = [];
  const oldToNewV = new Array(rawVertices.length).fill(-1);

  // 辅助获取坐标 (兼容 VectorX 和 普通数组)
  const getVCoord = (v) => v.isVectorX ? v : new VectorX(v.length || 3, v);

  for (let i = 0; i < rawVertices.length; i++) {
    const p1 = getVCoord(rawVertices[i]);
    let foundIdx = -1;

    // 在已有的唯一顶点中寻找是否重合
    for (let j = 0; j < uniqueVertices.length; j++) {
      const distSq = p1.sub(uniqueVertices[j]).length() ** 2;
      if (distSq < EPS_SQ) {
        foundIdx = j;
        break;
      }
    }

    if (foundIdx !== -1) {
      oldToNewV[i] = foundIdx;
    } else {
      uniqueVertices.push(p1.clone());
      oldToNewV[i] = uniqueVertices.length - 1;
    }
  }

  cleanedPoset.vertexList = uniqueVertices;
  oldToNewMaps['vertexList'] = oldToNewV;

  // ==========================================
  // 第二步: 边去重 (edgeList), 剔除零长边
  // ==========================================
  const rawEdges = poset.edgeList || [];
  const uniqueEdges = [];
  const edgeMap = new Map();
  const oldToNewE = new Array(rawEdges.length).fill(-1);

  for (let i = 0; i < rawEdges.length; i++) {
    const [ov1, ov2] = rawEdges[i];
    const nv1 = oldToNewV[ov1];
    const nv2 = oldToNewV[ov2];

    if (nv1 === -1 || nv2 === -1 || nv1 === nv2) continue;

    const minV = Math.min(nv1, nv2);
    const maxV = Math.max(nv1, nv2);
    const key = `${minV}_${maxV}`;

    if (edgeMap.has(key)) {
      oldToNewE[i] = edgeMap.get(key);
    } else {
      const newIdx = uniqueEdges.length;
      uniqueEdges.push([minV, maxV]);
      edgeMap.set(key, newIdx);
      oldToNewE[i] = newIdx;
    }
  }

  cleanedPoset.edgeList = uniqueEdges;
  oldToNewMaps['edgeList'] = oldToNewE;

  // ==========================================
  // 第三步: 面重组与去重 (faceList) - 顶点顺次化
  // ==========================================
  const rawFaces = poset.faceList || [];
  const uniqueFaces = [];
  const faceMap = new Map();
  const oldToNewF = new Array(rawFaces.length).fill(-1);

  for (let i = 0; i < rawFaces.length; i++) {
    const oldFaceEdges = rawFaces[i];
    const newEdgesSet = new Set();

    // 收集该面内所有有效的新边
    for (const oldEIdx of oldFaceEdges) {
      const newEIdx = oldToNewE[oldEIdx];
      if (newEIdx !== -1) {
        newEdgesSet.add(newEIdx);
      }
    }

    if (newEdgesSet.size < 3) continue;

    // 利用邻接表在该面内部寻找闭环
    const adj = new Map();
    for (const eIdx of newEdgesSet) {
      const [v1, v2] = uniqueEdges[eIdx];
      if (!adj.has(v1)) adj.set(v1, []);
      if (!adj.has(v2)) adj.set(v2, []);
      adj.get(v1).push({ next: v2, edge: eIdx });
      adj.get(v2).push({ next: v1, edge: eIdx });
    }

    // 找起点
    let startVertex = -1;
    for (const [v, edges] of adj) {
      if (edges.length > 0) {
        startVertex = v;
        break;
      }
    }
    if (startVertex === -1) continue;

    // 走迷宫找环 (找第一条未用过的边)
    const orderedVerts = [];
    let curr = startVertex;
    const usedEs = new Set();
    let steps = 0;

    while (steps < newEdgesSet.size + 1) {
      orderedVerts.push(curr);
      let found = false;
      for (const { next, edge } of adj.get(curr)) {
        if (!usedEs.has(edge)) {
          usedEs.add(edge);
          curr = next;
          found = true;
          break;
        }
      }
      if (!found) break;
      if (curr === startVertex) break;
      steps++;
    }

    // 成功闭环且长度 >= 3
    if (orderedVerts.length >= 3 && curr === startVertex) {
      // 规范面序列: 旋转到最小索引开头, 消除顺逆时针的重复
      let minIdx = 0;
      for (let k = 1; k < orderedVerts.length; k++) {
        if (orderedVerts[k] < orderedVerts[minIdx]) minIdx = k;
      }
      const normalizedFace = [];
      for (let k = 0; k < orderedVerts.length; k++) {
        normalizedFace.push(orderedVerts[(minIdx + k) % orderedVerts.length]);
      }

      // 比较正反, 保证唯一性
      const revFace = [...normalizedFace].reverse();
      let faceStr = normalizedFace.join(',');
      const revStr = revFace.join(',');
      if (revStr < faceStr) faceStr = revStr;

      if (faceMap.has(faceStr)) {
        oldToNewF[i] = faceMap.get(faceStr);
      } else {
        const newFIdx = uniqueFaces.length;
        uniqueFaces.push(normalizedFace);
        faceMap.set(faceStr, newFIdx);
        oldToNewF[i] = newFIdx;
      }
    }
  }

  cleanedPoset.faceList = uniqueFaces;
  oldToNewMaps['faceList'] = oldToNewF;

  // ==========================================
  // 第四步: 重建 更高维 (cellList, teronList...)
  // ==========================================
  // 遍历所有高于 faceList 的维度 (d >= 3)
  for (let d = 3; d < n; d++) {
    const dimKey = `${dimE[d]}List`;
    const rawList = poset[dimKey] || [];
    if (rawList.length === 0) continue;

    const uniqueList = [];
    const seenSet = new Set();
    const oldToNew = new Array(rawList.length).fill(-1);

    // 低一维的映射表
    const lowerKey = `${dimE[d - 1]}List`;
    const lowerMap = oldToNewMaps[lowerKey];

    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      const mappedElements = new Set();

      for (const lowIdx of item) {
        if (lowerMap && lowerMap[lowIdx] !== undefined) {
          const newIdx = lowerMap[lowIdx];
          if (newIdx !== -1) {
            mappedElements.add(newIdx);
          }
        }
      }

      // 高维单体如果内部元素少于 3 个, 丢弃
      if (mappedElements.size < (d === 3 ? 4 : 3)) continue;

      // 排序拼接作为唯一 Key
      const sortedElements = [...mappedElements].sort((a, b) => a - b);
      const uniqueKey = sortedElements.join(',');

      if (seenSet.has(uniqueKey)) {
        oldToNew[i] = uniqueList.findIndex(u => u.join(',') === uniqueKey);
      } else {
        const newIdx = uniqueList.length;
        uniqueList.push(sortedElements);
        seenSet.add(uniqueKey);
        oldToNew[i] = newIdx;
      }
    }

    cleanedPoset[dimKey] = uniqueList;
    oldToNewMaps[dimKey] = oldToNew;
  }

  return cleanedPoset;
}

// 删除名为 name 的对象
// target 为 { scene, spawnedGroups }
export function deletes(name, target) {
  const { scene, spawnedGroups } = target;
  const targets = scene.children.filter(c => c.name === name);
  for (const g of targets) {
    scene.remove(g);
    // 释放内存
    g.traverse(o => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) {
        if (Array.isArray(o.material))
          o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
    // 从 spawnedGroups 中同步移除
    const idx = spawnedGroups.indexOf(g);
    if (idx !== -1) spawnedGroups.splice(idx, 1);
  }
  return 0;
}

// 清空某套场景中由 makeShapeTransformed 生成的全部 group
// target 为 { scene, spawnedGroups }
export function clearSpawned(target) {
  const { scene, spawnedGroups } = target;
  for (const g of [...spawnedGroups]) {
    scene.remove(g);
    g.traverse(o => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) {
        if (Array.isArray(o.material))
          o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
  }
  spawnedGroups.length = 0;
}