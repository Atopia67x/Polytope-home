/**
 * 文件: js/math/polytopeSymmetry.js
 * 实现 生成 多胞形 对称群列表 (Symmetry Group List)
 * 实现 生成 多胞形 偏序集 (Poset)
 */
import * as THREE from 'three';

import {
  EPS,
  dimensionSymbols,
  dimensionElements,
  clamp,
  getNDReflectionMatrices,
  getNDBasicVec,
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
 * 生成 对称序列群 (Symmetry Sequence, SymmetrySeq) 列表
 * - 基于矩阵运算的轨道枚举 (数值去重硬枚举)
 * 
 * @param {number[]} schlafli 施莱夫利符号
 * @param {number} k 唯一环 所在的维数
 * @returns {string[]} 对称序列群 列表 (e.g. ['', 'e', 've'])
 */
export function makeSymmetryGroupList(schlafli, k) {
  const n = schlafli.length + 1;

  if (k < 0) {
    throw new Error(`${RED}k 需为非负整数${RESET}`);
  } else if (k >= n) {
    throw new Error(`${RED}k 需不大于 schlafli 的长度, 实际 (schlafli.length=${schlafli.length}, k=${k})${RESET}`);
  }

  // 处理 [2] 的特殊降维情况
  if (schlafli.length === 1 && schlafli[0] === 2) {
    if (k === 0) {
      return ['', 'v'];
    } else if (k === 1) {
      return ['', 'e'];
    }
  }

  // 1. 构造 rings 数组 (唯一环)
  const rings = new Array(n).fill('o');
  rings[k] = 'x';

  // 2. 获取 N 维通用基向量
  const basicVec = getNDBasicVec(schlafli, rings);

  const dims = dimensionSymbols.slice(0, n);
  const res = ['']; // 去重序列
  const seenCoords = [basicVec.clone()]; // 记录已经存在的坐标
  const queue = ['']; // 从空序列开始

  const EPS_Sq = EPS * EPS;

  // 辅助函数: 计算两个 N 维向量的距离平方
  const distanceToSquared = (v1, v2) => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const diff = v1.elements[i] - v2.elements[i];
      sum += diff * diff;
    }
    return sum;
  };

  // 辅助函数: 判断是否重复
  const isCoordSeen = (vec) => {
    // 只要有一个维度是 NaN / Infinity, 判定为忽略
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(vec.elements[i])) return true;
    }
    for (const v of seenCoords) {
      if (distanceToSquared(v, vec) < EPS_Sq) return true;
    }
    return false;
  };

  let cur = 0;

  // 注意: 如果是 2D/3D 等低维, cur <= 1000 完全够用. 如果未来 N >= 5,
  // 可能要把 1000 这个上限提高 (比如提高至 5000 或去动态评估).
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
      const nextVec = basicVec.applyMatrix(matrix);

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

/**
 * 辅助函数：深拷贝并偏移数组中的所有数值
 */
function shiftElementIndices(element, offset) {
  if (Array.isArray(element)) {
    return element.map(x => shiftElementIndices(x, offset));
  }
  return element + offset;
}

// 记忆化字典
const posetListCache = new Map();

/**
 * 生成全环 (全截角 Omnitrunation) 多胞体的偏序集 (Poset)
 * @param {number[]} schlafli - 施莱夫利符号
 * @returns {any[]} - 偏序集 列表 (vertexList 存储 序列)
 */
export function buildPosetList(schlafli) {
  const key = schlafli.join(',');
  if (posetListCache.has(key)) return posetListCache.get(key);

  // ['vertex', 'edge', 'face', ...]
  const dimE = dimensionSymbols.split('').map(e => dimensionElements[e]);

  // 维度
  const n = schlafli.length + 1;

  // 偏序集
  let poset = {};

  // 线段
  if (n === 1) {
    poset.vertexList = makeSymmetryGroupList([], 0); // {o, v}
    poset.edgeList = [[0, 1]];
    posetListCache.set(key, poset);
    return poset;
  }

  // 1. 初始化所有列表
  for (let d = 0; d <= n; d++) {
    poset[`${dimE[d]}List`] = [];
  }
  // 获取低维列表的键 (排除最高维)
  const lowerKeys = [];
  for (let d = 0; d < n; d++) {
    lowerKeys.push(`${dimE[d]}List`);
  }
  // 获取最高列表的键
  const topKey = `${dimE[n]}List`
  poset[topKey].push([]);

  // 2. 初始化所有游标
  const curIndices = new Array(n).fill(0);

  // 3. 遍历每个反射面
  for (let i = 0; i < n; i++) {
    const symSeq = makeSymmetryGroupList(schlafli, i);

    // 低一维的 poset
    const unitPoset = buildPosetList(getFacet(schlafli, i));
    
    for (const sq of symSeq) {
      // A. 平移所有的低维列表
      for (let d = 0; d < n; d++) {
        const lowerKey = lowerKeys[d];
        const unitList = unitPoset[lowerKey];
        if (!unitList || unitList.length === 0) continue;
        
        if (lowerKey === 'vertexList') {
          // 顶点需要加上对称序列前缀
          const newVertexs = [];
          for (const v of unitList) {
            const newSeq = shiftSeqDim(v, n, n - 1 - i);
            newVertexs.push(sq + newSeq);
          }
          poset[lowerKey].push(...newVertexs);
        } else {
          let newList;
          
          // 把 unitList 整体平移, 返回新列表和新的游标
          ({ list: newList, cur: curIndices[d - 1] } = shiftAndUpdateMax(unitList, curIndices[d - 1]));
          
          console.log(lowerKey, newList, getFacet(schlafli, i));
          // 边、面等, 直接推入
          poset[lowerKey].push(...newList);
        }
      }
      // B. 最高列表 推入 [v]
      poset[topKey][0].push(curIndices[n - 1]++);
    }
  }

  posetListCache.set(key, poset);
  return poset;
}

const posetCache = new Map();

/**
 * 生成偏序集 (Poset) 方法
 * @param {number[]} schlafli - 施莱夫利符号
 * @returns {function(VectorX): any[]} - 偏序集方法 函数
 */
export function buildPoset(schlafli) {
  const n = schlafli.length + 1;
  
  if (schlafli.length < 2) {
    throw new Error(`${RED}schlafli 长度至少为 2, 实际 ${schlafli.length}${RESET}`);
  }

  const key = schlafli.join(',');
  if (posetCache.has(key)) return posetCache.get(key);

  // 生成偏序集列表
  const poset = buildPosetList(schlafli);

  const posetBuilder = (basicVec) => {
    // 1. 校验传入的向量维度是否匹配
    if (!basicVec.isVectorX || basicVec.n !== n) {
      throw new Error(`${RED}vector 需为 ${n} 维向量 (VectorX)${RESET}`);
    }

    // 2. 矢量乘矩阵
    const applyMatrix = (vec, matrix) => {
      return clamp(vec.applyMatrix(matrix));
    };

    const vertexList = poset.vertexList;
    const newVertexList = [];

    // 3. 将序列变成矩阵并作用在基向量上
    for (const symSeq of vertexList) {
      const m = generateSymmtrySeqMatrix(schlafli, symSeq);
      const newVertex = applyMatrix(basicVec, m);
      newVertexList.push(newVertex);
    }

    return {
      ...poset,
      vertexList: newVertexList
    };
  };

  posetCache.set(key, posetBuilder);
  return posetBuilder;
}