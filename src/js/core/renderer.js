/**
 * 文件: js/core/renderer.js
 * 核心渲染, 接收 几何数据和变换矩阵, 生成 Three.js 的 Group
 */

import * as THREE from 'three';
import { WHITE, lightenColor } from '../data/constants.js';
import { affined } from '../core/transform.js';
import {
  buildPoset
} from './polytopeSymmetry.js';
import {
  EPS, // 允许误差
  get3DBasicVec,
  get4DBasicVec,
  get3DReflectionNormalVecs
} from './polytopeGeometry.js';

// spawnedGroupsC / spawnedGroupsF / spawnedGroupsV 分别记录三套场景中生成的 group
export const spawnedGroupsC = [];
export const spawnedGroupsF = [];
export const spawnedGroupsV = [];

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
export function makeShapeFromPoset(poset, opts = {}, target) {
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
    // 兼容传入 Vector3 对象或 [x,y,z] 数组
    return v.isVector3 ? [v.x, v.y, v.z] : [v[0], v[1], v[2]];
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
  return makeShapeFromPoset(poset, opts, target);
}

/**
 * 实践理念: 面向 经典正多胞形 (Classical Regular Polytopes, CRPs) 的 通用化建模方法论 (Methodology)
 * 按 CRPs 方法论 生成图形渲染 (目前仅适用于 n === 3 维)
 */
export function makeShapeInCRPs(schlafli, rings, opts, target) {
  const builder = buildPoset(schlafli)
  const basicVec = get3DBasicVec(schlafli, rings);
  const poset = builder(basicVec);

  return makeShapeFromPoset(cleanPoset(poset), opts, target);
}

/**
 * 
 * @param {Object} poset 含顶点具体坐标 的 偏序集 对象
 * @returns {Object} 去重后的 偏序集 对象
 */
export function cleanPoset(poset) {
  const { vertexList, edgeList, faceList, cellList = [] } = poset;
  const EPS_SQ = EPS * EPS;

  // ==========================================
  // 第一步: 顶点去重 (vertexList)
  // ==========================================
  const uniqueVertices = [];
  const oldToNewV = new Array(vertexList.length).fill(-1);

  // 辅助获取坐标
  const getVCoord = (v) => v.isVector3 ? v : new THREE.Vector3(v[0], v[1], v[2]);

  for (let i = 0; i < vertexList.length; i++) {
    const p1 = getVCoord(vertexList[i]);
    let foundIdx = -1;

    // 在已有的唯一顶点中寻找是否重合
    for (let j = 0; j < uniqueVertices.length; j++) {
      if (p1.distanceToSquared(uniqueVertices[j]) < EPS_SQ) {
        foundIdx = j;
        break;
      }
    }

    if (foundIdx !== -1) {
      oldToNewV[i] = foundIdx; // 指向已有的旧点
    } else {
      uniqueVertices.push(p1.clone()); // 加入新点集
      oldToNewV[i] = uniqueVertices.length - 1;
    }
  }

  // ==========================================
  // 第二步: 边去重 (edgeList), 并剔除 零长边
  // ==========================================
  const uniqueEdges = [];
  const edgeMap = new Map(); // 记录 "最小点_最大点" 的组合
  const oldToNewE = new Array(edgeList.length).fill(-1);

  for (let i = 0; i < edgeList.length; i++) {
    const [ov1, ov2] = edgeList[i];
    const nv1 = oldToNewV[ov1];
    const nv2 = oldToNewV[ov2];

    if (nv1 === nv2) continue; // 两点重合, 这是一条 零长边, 直接丢弃

    const minV = Math.min(nv1, nv2);
    const maxV = Math.max(nv1, nv2);
    const key = `${minV}_${maxV}`;

    if (edgeMap.has(key)) {
      oldToNewE[i] = edgeMap.get(key); // 映射到已存在的新边
    } else {
      const newIdx = uniqueEdges.length;
      uniqueEdges.push([minV, maxV]); // 存入新边
      edgeMap.set(key, newIdx);
      oldToNewE[i] = newIdx;
    }
  }

  // ==========================================
  // 第三步: 面重组与去重 (faceList)
  // ==========================================
  const uniqueFaces = [];
  const faceMap = new Map(); // 记录规范化后的面字符串
  const oldToNewF = new Array(faceList.length).fill(-1);

  for (let i = 0; i < faceList.length; i++) {
    const oldFaceEdges = faceList[i];
    const newEdgesSet = new Set();

    // 收集该面内所有有效的新边
    for (const oldEIdx of oldFaceEdges) {
      const newEIdx = oldToNewE[oldEIdx];
      if (newEIdx !== -1) {
        newEdgesSet.add(newEIdx);
      }
    }

    if (newEdgesSet.size < 3) continue; // 少于三条真实边，构不成多边形面

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

    // 走迷宫找环
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
      if (curr === startVertex) break; // 回到了起点
      steps++;
    }

    // 如果成功闭环并且长度 >= 3
    if (orderedVerts.length >= 3 && curr === startVertex) {
      // 规范面序列: 旋转到最小索引开头，消除顺逆时针的重复面
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

  // ==========================================
  // 第四步：重建 cellList
  // ==========================================
  const newCellList = [];
  for (const cell of cellList) {
    const newCellFaces = new Set();
    for (const oldFIdx of cell) {
      const newFIdx = oldToNewF[oldFIdx];
      if (newFIdx !== -1) {
        newCellFaces.add(newFIdx);
      }
    }
    if (newCellFaces.size > 0) {
      newCellList.push([...newCellFaces]);
    }
  }

  // 返回干净的新对象
  return {
    vertexList: uniqueVertices,
    edgeList: uniqueEdges,
    faceList: uniqueFaces,
    cellList: newCellList
  };
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