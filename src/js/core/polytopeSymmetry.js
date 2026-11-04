/**
 * 文件: js/core/polytopeSymmetry.js
 * 实现 生成 多胞形 对称群列表 (Symmetry Group List)
 * 实现 生成 多胞形 偏序集 (Poset)
 */
import * as THREE from 'three';

import {
  EPS,
  dimensionSymbols,
  clamp,
  get3DReflectionMatrices,
  get4DReflectionMatrices,
  get3DBasicVec,
  get4DBasicVec,
  generateSymmtrySeqMatrix
} from './polytopeGeometry.js';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

// 施莱夫利列表 相同
function isSchlafliEqual(a, b) {
  const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  return eq(a, b);
}

/**
 * 生成 对称序列群 (Symmetry Sequence, SymmetrySeq) 列表 (仅适用于 n === 3 维)
 * - 基于矩阵运算的轨道枚举 (数值去重硬枚举)
 * - 因 THREE.Vector3 · THREE.Matrix3 的不可拓展和局限性, 其他更低维度暂时手动给出
 * @param {number[]} schlafli 施莱夫利符号
 * @param {number} k 唯一环 所在的维数
 * @returns {string[]} 对称序列群 列表 (e.g. ['', 'e', 've'])
 * e.g. (schlafli=[3, 3, 3], k=1) : o3x3o3o
 *      (schlafli=[4, 3, 3], k=3) : o4o3x3o
 */
export function makeSymmetryGroupList(schlafli, k) {
  // 发生维度
  const n = schlafli.length + 1;
  if (k < 0) {
    throw new Error(`${RED}k 需为非负整数${RESET}`);
  } else if (k >= n) {
    throw new Error(`${RED}k 需不大于 schlafli 的长度, 实际 (schlafli.length=${schlafli.length}, k=${k})${RESET}`);
  }

  // 暂时手动给出部分

  if (isSchlafliEqual(schlafli, [])) {
    return ['', 'v'];
  } else if (isSchlafliEqual(schlafli, [2])) {
    if (k === 0) {
      return ['', 'v'];
    } else if (k === 1) {
      return ['', 'e'];
    }
  } else if (isSchlafliEqual(schlafli, [3])) {
    if (k === 0) {
      return ['', 'v', 'ev'];
    } else if (k === 1) {
      return ['', 'e', 've'];
    }
  } else if (isSchlafliEqual(schlafli, [4])) {
    if (k === 0) {
      return ['', 'v', 'vev', 'ev'];
    } else if (k === 1) {
      return ['', 'e', 'eve', 've'];
    }
  } else if (isSchlafliEqual(schlafli, [5])) {
    if (k === 0) {
      return ['', 'v', 'vev', 'evev', 'ev'];
    } else if (k === 1) {
      return ['', 'e', 'eve', 'veve', 've'];
    }
  } else if (isSchlafliEqual(schlafli, [6])) {
    if (k === 0) {
      return ['', 'v', 'vev', 'vevev', 'evev', 'ev'];
    } else if (k === 1) {
      return ['', 'e', 'eve', 'eveve', 'veve', 've'];
    }
  }

  // 3D 遍历部分
  // 单环
  const rings = new Array(n).fill('o');
  rings[k] = 'x';

  // 基向量
  const basicVec = get3DBasicVec(schlafli, rings);

  const dims = dimensionSymbols.slice(0, n);

  const is3D = basicVec.isVector3, is4D = basicVec.isVector4;
  const res = []; // 去重序列
  const seenCoords = []; // 记录已经存在的坐标
  const queue = ['']; // 从空序列开始

  const EPS_Sq = EPS * EPS;

  // 辅助函数: 直接通过容差距离判等, 包容浮点误差
  const isCoordSeen = (vec) => {
    // {NaN, NaN, NaN} => 判定相等 并忽略
    if (!Number.isFinite(vec.x) || !Number.isFinite(vec.y) || !Number.isFinite(vec.z)) {
      return true;
    }
    for (const v of seenCoords) {
      if (is3D || is4D) {
        if (v.distanceToSquared(vec) < EPS_Sq) return true;
      }
    }
    return false;
  };

  // 初始化环境
  seenCoords.push(basicVec.clone());
  res.push('');

  let cur = 0;
  while (queue.length > 0 && cur <= 1000) {
    const currentSeq = queue.shift();

    // 在当前序列尾部尝试加上所有允许的操作
    for (const char of dims) {
      // 剪枝: 防止连续两个相同的操作 (e.g. 'vv')
      if (currentSeq.startsWith(char)) continue;

      // 合成新序列
      const nextSeq = char + currentSeq;
      const matrix = generateSymmtrySeqMatrix(schlafli, nextSeq);

      // 计算新坐标
      const nextVec = basicVec.clone();
      if (is3D) nextVec.applyMatrix3(matrix);
      else if (is4D) nextVec.applyMatrix4(matrix);

      const seen = isCoordSeen(nextVec);
      console.log(`[尝试] ${nextSeq.padEnd(3)} | 坐标: (${nextVec.x.toFixed(4)}, ${nextVec.y.toFixed(4)}, ${nextVec.z.toFixed(4)}) | 是否重复: ${seen}`);

      // 去重: 距离在容差内, 放弃这个序列
      if (isCoordSeen(nextVec)) {
        continue;
      }

      // 记录新坐标, 保存该序列
      seenCoords.push(nextVec);
      res.push(nextSeq);
      queue.push(nextSeq);
      cur++;
    }
  }

  return res;
}

/**
 * shiftSeqDim:
 * m维 对称序列 (Symmetry operation Sequence; Symmetry Seq) (向低维) 偏移k个维度
 * e.g. 'vefcfev'(m=4, k=1) => 'cvefevc'
 *      'vefcfev'(m=4, k=2) => 'fcvevcf'
 *      'vefcfev'(m=5, k=1) => 'tvefevt'
 * @param {number[]} symmetrySeq 对称序列 (e.g. 'vefcfev')
 * @param {number} m 对称来自的维度
 * @param {number} k 向低维 偏移的维度数 (非负整数)
 * @returns {number[]} 偏移后的对称序列 (e.g. 'cfevevc')
 * 
 * Vertex (0)
 * Edge   (1)
 * Face   (2)
 * Cell   (3)
 * Teron  (4)
 * Peton  (5)
 * eXon   (6)
 * Zetton (7)
 * Yotton (8)
 */
function shiftSeqDim(symmetrySeq, m, k) {
  if (k < 0 || k >= m) {
    throw new Error(`${RED}shiftSeqDim: k 需满足 0 <= k < m (m=${m}, k=${k})${RESET}`);
  }

  let res = '';
  for (const ch of symmetrySeq) {
    const dim = dimensionSymbols.indexOf(ch);
    if (dim === -1) {
      throw new Error(`${RED}shiftSeqDim: 未知符号 '${ch}'${RESET}`);
    }
    const newDim = ((dim - k) % m + m) % m;
    res += dimensionSymbols[newDim];
  }
  return res;
}

/** 得到维面 (Facet) 的 施莱夫利符号
 * @param {number[]} schlafli Schläfli 符号
 * @param {number} k 维面所对应的 基向量 (0: v, 1: e, 2: f, 3: c)
 * @returns {number[]} 维面的 Schläfli 符号
 * 
 * e.g. getFacet(schlafli=[3, 3, 5], k=1) => [5, 3]
 *      getFacet(schlafli=[4, 3, 3], k=2) => [4, 3]
 */
function getFacet(schlafli, k) {
  const schl = [...schlafli, 2]; // 补齐 2, e.g. [3, 3, 5] => [3, 3, 5, 2]
  const n = schl.length;

  if (k < 0 || k >= n) {
    throw new Error(`${RED}getFacet: k 需满足 0 <= k <= n (n=${n - 1}, k=${k})${RESET}`);
  }

  const res = [];
  for (let i = 1; i <= n - 2; i++) {
    res.push(schl[(k + i) % n]);
  }
  return res;
}

/**
 * 将 List 中所有下标增加 cur, 并返回新列表的最大下标 + 1 (支持多层列表)
 * @param {any[]} list 下标列表 (如 edgeList)
 * @param {number} cur 增加下标
 * @returns {{ list: number[], cur: number }} 新列表以及 最大下标 + 1
 * 
 * e.g. shiftAndUpdateMax(list=[0, 1], cur=2) => { list=[2, 3], cur=4 }
 * e.g. shiftAndUpdateMax(list=[[0, 1], [2, 3]], cur=2) => { list=[[2, 3], [4, 5]], cur=6 }
 */
const shiftAndUpdateMax = (list, cur) => {
  let maxinum = -Infinity;

  const mapDeep = (v) => {
    if (Array.isArray(v)) {
      return v.map(mapDeep); // 递归处理
    }
    const nv = v + cur;
    if (nv > maxinum) maxinum = nv;

    return nv;
  }

  const newList = list.map(mapDeep);
  if (maxinum === -Infinity) maxinum = cur;

  return { list: newList, cur: maxinum + 1 };
}

// 记忆化字典
const posetListCache = new Map();
/**
 * 生成全环 (全截角 Omnitrunation) 多胞体的偏序集 (Poset) (顶点序列, Vertice List)
 * @param {number[]} schlafli - 施莱夫利符号
 * @returns {any[]} - 偏序集 列表 (顶点序列)
 */
function buildPosetList(schlafli) {
  const key = schlafli.join(',');
  if (posetListCache.has(key)) return posetListCache.get(key);

  let poset;

  if (schlafli.length === 0) { // schlafli === [], 线段
    poset = {
      vertexList: makeSymmetryGroupList([], 0), // {o, v}
      edgeList: [[0, 1]]
    };
  } else if (schlafli.length === 1) {
    const n = schlafli.length + 1; // 对称发生的维度

    const vertexList = [], edgeList = [], edges = [];
    let curV = 0, curE = 0; // curV: 顶点 (Vertex) 下标, curE: 棱 (Edge) 下标
    for (let i = 0; i < n; i++) {
      const symSeq = makeSymmetryGroupList(schlafli, i);

      // 低一维的 poset { vertexList, edgeList }
      const unitPoset = buildPosetList(getFacet(schlafli, i));
      const { vertexList: unitVertexList, edgeList: unitEdgeList } = unitPoset;

      for (const sq of symSeq) {
        let newList;
        ({ list: newList, cur: curV } = shiftAndUpdateMax(unitEdgeList, curV));
        // 新列表以及新下标

        const newVertexs = [];
        for (const v of unitVertexList) {
          const newSeq = shiftSeqDim(v, n, n - 1 - i); // 偏移的 对称序列 (Symmetry Seq)
          newVertexs.push(sq + newSeq); // 加上 sq 前缀
        }
        vertexList.push(...newVertexs);
        edgeList.push(...newList);
        edges.push(...[curE++]);
      }
    }
    const faceList = [edges];

    poset = {
      vertexList,
      edgeList,
      faceList
    };
  } else if (schlafli.length === 2) {
    const n = schlafli.length + 1; // 对称发生的维度

    const vertexList = [], edgeList = [], faceList = [], faces = [];
    let curV = 0, curE = 0, curF = 0; // cur: 顶点下标, curE: 棱下标, curF: 面 (Face) 下标
    for (let i = 0; i < n; i++) {
      const symSeq = makeSymmetryGroupList(schlafli, i);

      // 低一维的 poset { vertexList, edgeList, faceList }
      const unitPoset = buildPosetList(getFacet(schlafli, i));
      const { vertexList: unitVertexList, edgeList: unitEdgeList, faceList: unitFaceList } = unitPoset;

      for (const sq of symSeq) {
        let newEdgeList;
        ({ list: newEdgeList, cur: curV } = shiftAndUpdateMax(unitEdgeList, curV));
        // 新的棱列表以及新下标

        let newFaceList;
        ({ list: newFaceList, cur: curE } = shiftAndUpdateMax(unitFaceList, curE));
        // 新的面列表以及新下标

        const newVertexs = [];
        for (const v of unitVertexList) {
          const newSeq = shiftSeqDim(v, n, n - 1 - i); // 偏移的 对称序列 (Symmetry Seq)
          newVertexs.push(sq + newSeq); // 加上 sq 前缀
        }
        vertexList.push(...newVertexs);
        edgeList.push(...newEdgeList);
        faceList.push(...newFaceList);
        faces.push(...[curF++]);
      }
    }
    const cellList = [faces];

    poset = {
      vertexList,
      edgeList,
      faceList,
      cellList
    };
  }

  posetListCache.set(key, poset);
  return poset;
}

const posetCache = new Map();
/**
 * 生成偏序集 (Poset) 方法
 * @param {number[]} schlafli - 施莱夫利符号
 * @returns {function(THREE.Vector3 | THREE.Vector4): any[]} - 偏序集方法 函数
 * 
 * (仅适用于 n <= 4 维) 
 */
export function buildPoset(schlafli) {
  if (schlafli.length !== 2 && schlafli.length !== 3) {
    throw new Error(`${RED}schlafli 长度仅支持 2 或 3, 实际 ${schlafli.length}${RESET}`);
  }

  const key = schlafli.join(',');
  if (posetCache.has(key)) return posetCache.get(key);

  const poset = buildPosetList(schlafli);

  const posetBuilder = (basicVec) => {
    if (schlafli.length === 2 && !basicVec.isVector3) {
      throw new Error(`${RED}vector 需为 3 维向量${RESET}`);
    } else if (schlafli.length === 3 && !basicVec.isVector4) {
      throw new Error(`${RED}vector 需为 4 维向量${RESET}`);
    }

    // 矢量 乘 矩阵
    const applyMatrix = (vec, matrix) => {
      if (schlafli.length === 2) {
        return clamp(vec.clone().applyMatrix3(matrix));
      } else if (schlafli.length === 3) {
        return clamp(vec.clone().applyMatrix4(matrix));
      }
      // 附加 浮点误差钳制 (Clamp)
    }

    const vertexList = poset.vertexList;
    const newVertexList = [];

    // 将序列变成矩阵
    for (const symSeq of vertexList) {
      const m = generateSymmtrySeqMatrix(schlafli, symSeq);
      const newVertex = applyMatrix(basicVec, m);
      newVertexList.push(newVertex);
    }
    return {
      ...poset,
      vertexList: newVertexList
    }
  }

  posetCache.set(key, posetBuilder);
  return posetBuilder;
}