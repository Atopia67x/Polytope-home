/**
 * 文件: js/math/polytopeGeometry.js
 * 实现 计算 高对称多胞形 (Highly Symmetric Polytope) 的二胞角 (Dihedral Angle)
 * 实现 生成 对称矩阵 (Reflection Matrix)
 */

import * as THREE from 'three';
import { VectorX, isVector } from './vectorX.js';
import { MatrixX, isMatrix } from './matrixX.js';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

// 浮点误差容差
export const EPS = 1e-10;

export const dimensionSymbols = 'vefctpxzy';
export const dimensionElements = {
  'v': 'vertex',
  'e': 'edge',
  'f': 'face',
  'c': 'cell',
  't': 'teron',
  'p': 'peton',
  'x': 'exon',
  'z': 'zetton',
  'y': 'yetton'
};

/**
 * 三角函数值 浮点 (Float) 误差钳制 (Clamp): 仅当 |v| 接近 1 (误差级) 时钳到 ±1, 仅当 |v| 接近 0 (误差级) 时钳到 0,
 * 明显越界 / NaN / Infinity 原样返回
 * @param {number} v
 * @returns {number}
 */
function clampFloat(v) {
  if (!Number.isFinite(v)) return v; // NaN / Infinity 不钳
  if (v > 1 && v - 1 < EPS) return 1; // 1 + ε => 1
  if (v < 1 && 1 - v < EPS) return 1; // 1 - ε => 1
  if (v > 0 && v < EPS) return 0; // 0 + ε => 0
  if (v < 0 && -v < EPS) return 0; // 0 - ε => 0
  if (v > -1 && v - (-1) < EPS) return -1; // -1 + ε => -1
  if (v < -1 && (-1) - v < EPS) return -1; // -1 - ε => -1
  return v; // 正常 / 明显越界 原样
}

/**
 * 浮点误差钳制 (Clamp) 应用于 复合的变量类型
 * @param {any} data 数值 (Number), 列表 (List), 矢量 (Vector), 或 矩阵 (Matrix)
 * @returns {any} 钳制后的结果
 */
export function clamp(data) {
  // 0. 普通数字
  if (typeof data === 'number') {
    return clampFloat(data);
  }

  // 1. 普通数组
  if (Array.isArray(data)) {
    return data.map(item => clamp(item));
  }

  // 2. 防空
  if (data === null || typeof data !== 'object') {
    return data;
  }

  // 3. 矩阵 (通用支持 MatrixX 和 Three.js Matrix3/4)
  if (isMatrix(data) && typeof data.clone === 'function') {
    const res = data.clone();
    
    // 针对我们自定义的 MatrixX (Float64Array 存储)
    if (res.isMatrixX) {
      for (let i = 0; i < res.elements.length; i++) {
        res.elements[i] = clampFloat(res.elements[i]);
      }
      return res;
    }
    
    // 针对 Three.js 的 Matrix3/4
    if (res.isMatrix3 || res.isMatrix4) {
      const elements = [];
      for (const i of res.elements) {
        elements.push(clampFloat(i));
      }
      res.elements = elements;
      return res;
    }
  }

  // 4. 矢量 (通用支持 VectorX 和 Three.js Vector3/4)
  if (isVector(data) && typeof data.clone === 'function') {
    const res = data.clone();
    
    // 针对我们自定义的 VectorX (Float64Array 存储)
    if (res.isVectorX) {
      for (let i = 0; i < res.elements.length; i++) {
        res.elements[i] = clampFloat(res.elements[i]);
      }
      return res;
    }
    
    // 针对 Three.js 的 Vector3/4 (.x, .y, .z, .w 存储)
    if (res.isVector3 || res.isVector4) {
      res.x = clampFloat(res.x);
      res.y = clampFloat(res.y);
      res.z = clampFloat(res.z);
      if (res.isVector4) {
        res.w = clampFloat(res.w);
      }
      return res;
    }
  }

  // 5. 普通对象 {} (深度遍历)
  const result = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      result[key] = clamp(data[key]);
    }
  }
  return result;
}

// 记忆化字典: key = Schläfli 前缀 (e.g. '5', '5,3', '5,3,3'), value = sin(θ/2)
const sinHalfCache = new Map();

/**
 * 计算 二胞角半角正弦值
 * (递归计算 Schläfli 符号前 i+1 级的 sin(θ/2) )
 * @param {number[]} schlafli
 * @param {number} i 当前级别索引 (0 起)
 * @returns {number} - sin(θ/2)
 */
function sinHalfAt(schlafli = [], i = 0) {
  const key = schlafli.slice(0, i + 1).join(',');

  // 字典中存在 直接返回
  if (sinHalfCache.has(key)) {
    return sinHalfCache.get(key);
  }

  let sinHalf;
  if (i === -1) {
    sinHalf = 0;
  }
  else if (i === 0) {
    // 初始: sin({m}/2) = cos(pi / m)
    sinHalf = clamp(Math.cos(Math.PI / schlafli[0]));
  }
  else {
    // 递推: sin({...,q,r}/2) = sin({r}/2) / cos({...,q}/2)
    const prev = sinHalfAt(schlafli, i - 1);
    const cosPrevHalf = Math.sqrt(1 - prev * prev);
    sinHalf = clamp(Math.cos(Math.PI / schlafli[i]) / cosPrevHalf);
    // 三角函数值 浮点误差钳制
  }

  sinHalfCache.set(key, sinHalf);
  return sinHalf;
}

/**
 * 链式计算二胞角 (不限于 4 维)
 * @param {number[]} schlafli Schläfli 符号, e.g. [5,3,3]
 * @returns {{ sinHalf: number, angle: number }}
 */
function getDihedralAngle(schlafli = []) {
  const sinHalf = sinHalfAt(schlafli, schlafli.length - 1);
  const angle = 2 * Math.asin(sinHalf);
  return { sinHalf, angle };
}

/**
 * 链式计算 Schläfli 前缀的 cos(θ/2)
 * cos(前缀/2) = sqrt(1 - sin(前缀/2)^2)
 * 空前缀: cos({}/2) = 1
 *
 * @param {number[]} schlafli 施莱夫利符号
 * @param {number} k 取前 k 项作为前缀
 * @returns {number}
 */
function cosHalfPrefix(schlafli, k) {
  if (k <= 0) return 1;
  const prefix = schlafli.slice(0, k);
  const { sinHalf } = getDihedralAngle(prefix);

  const cosHalf = clamp(1 - sinHalf * sinHalf);
  return Math.sqrt(Math.max(0, cosHalf));
}

/**
 * 计算相邻轴余弦 (不限于 4 维)
 * 原理: 分子取前 k 项 sin, 分母取后 len-k 项(逆序) cos
 *   cos θ_VE = sin({m}/2)     / cos({p,n}/2)
 *   cos θ_EF = sin({m,n}/2)   / cos({p}/2)
 *   cos θ_FC = sin({m,n,p}/2) / cos({}/2)   // 分母为空时取 1
 *
 * 4 维 {m,n,p} 时 k=1,2,3 对应 VE, EF, FC;
 *
 * @param {number[]} schlafli Schläfli 符号
 * @returns {number[]} e.g. [ cos θ_VE, cos θ_EF, cos θ_FC ]
 */
function getAdjacentAxisCosines(schlafli) {
  const len = schlafli.length;
  const res = [];

  for (let k = 1; k <= len; k++) {
    // 分子: 前 k 项的 sin(·/2)
    const { sinHalf } = getDihedralAngle(schlafli.slice(0, k));

    // 分母: 后 len-k 项逆序的 cos(·/2)
    const rest = schlafli.slice(k).reverse();
    const cosDenom = rest.length === 0 ? 1 : cosHalfPrefix(rest, rest.length);

    const cosAxes = clamp(sinHalf / cosDenom);
    // 浮点误差钳制

    res.push(cosAxes);
  }

  return res;
}

/**
 * 计算 N 维 仿射 (Affine) 坐标值 (Coordinate Value)
 * 
 * e.g. N = 4: \
 * v() => sin θ_VE / cos θ_CV \
 * e() => sin θ_EF / cos θ_CE \
 * f() => sin θ_FC / cos θ_CF \
 * 返回 { v, e, f }
 * 
 * @param {number[]} schlafli 施莱夫利符号
 * @returns {Object} 以维度符号命名的坐标值对象 { v: ..., e: ..., f: ... }
 */
export function getNDAffineCoordinateValues(schlafli) {
  const n = schlafli.length + 1;

  const cosines = getAdjacentAxisCosines(schlafli);
  const res = {};

  // 1. 预先计算所有的 sin 值
  const sines = cosines.map(c => Math.sqrt(clamp(1 - c * c)));

  // 2. 计算每个维度的值
  for (let i = 0; i < n - 1; i++) {
    // 分子: 当前的 sin 值
    const numerator = sines[i];
    
    // 分母: 从 i 到结尾的 cos 值连乘
    let denominator = 1;
    for (let j = i; j < n - 1; j++) {
      denominator *= cosines[j];
    }

    // 维度符号从 'v' 开始 (0: v, 1: e, 2: f, 3: c...)
    const symbol = dimensionSymbols[i]; 
    
    // 存入字典并 clamp
    res[symbol] = clamp(numerator / denominator);
  }

  return clamp(res);
}

/**
 * 计算 N 维 仿射坐标 (Affine Axes) 基向量
 * @param {number[]} schlafli 施莱夫利符号
 * @returns {VectorX[]} - N 条基向量 (已经归一化)
 * 
 * e.g. N = 4: \
 * [1, f, e, v] \
 * [1, f, e, 0] \
 * [1, f, 0, 0] \
 * [1, 0, 0, 0] \
 * 其中 f, e, v 来源于 仿射坐标值 { v, e, f }
 */
export function getNDAffineAxes(schlafli) {
  const n = schlafli.length + 1;
  
  if (schlafli.length < 2) {
    throw new Error(`${RED}schlafli 长度至少为 2, 实际 ${schlafli.length}${RESET}`);
  }

  // 1. 获得 N 维仿射坐标值
  const affCoordVecs = getNDAffineCoordinateValues(schlafli);
  
  // 提取出所有的值, 按 v, e, f, c... 的顺序存入数组
  // 例如 4 维得到 [v, e, f]
  const values = [];
  for (let i = 0; i < n - 1; i++) {
    values.push(affCoordVecs[dimensionSymbols[i]]);
  }

  const axes = [];

  // 2. 构造 N 条基向量
  for (let i = 0; i < n; i++) {
    // 初始化一个长度为 N 的 0 向量
    const elements = new Array(n).fill(0);
    
    // 第 0 位永远是 1
    elements[0] = 1;

    // 需要填入的倒序数值的数量
    const numToFill = n - 1 - i;
    
    for (let j = 0; j < numToFill; j++) {
      // 倒序取 values 中的值
      elements[j + 1] = values[n - 2 - j];
    }

    // 3. 生成 VectorX 并归一化
    const vec = new VectorX(n, elements).normalize();
    axes.push(vec);
  }

  // 4. 对所有的向量进行浮点钳制
  return clamp(axes);
}

/**
 * 生成 N 维 镜面法线矢量组 (Reflection Normal Vectors)
 * @param {number[]} schlafli 施莱夫利符号
 * @returns {VectorX[]} - N 条镜面法向量 (已经归一化)
 * 
 * e.g. N = 4:
 * [0, 0, 0, 1] \
 * [0, 0, v, -e] \
 * [0, e, -f, 0] \
 * [f, -1, 0, 0] \
 * 其中 f, e, v 来源于 仿射坐标值 { v, e, f }
 */
export function getNDReflectionNormalVecs(schlafli) {
  const n = schlafli.length + 1;

  // 1. 获得 N 维仿射坐标值 (包含边界钳制)
  const affCoordVecs = getNDAffineCoordinateValues(schlafli);
  
  // 将字典转换为数组, 例如 4 维: values = [v, e, f]
  let values = [];
  for (let i = 0; i < n - 1; i++) {
    values.push(affCoordVecs[dimensionSymbols[i]]);
  }

  // 判定是否是全 NaN (退化情况)
  const isNaN = values.some(v => !Number.isFinite(v));
  // 判断是否全 0 (退化情况)
  const isZero = values.every(v => Math.abs(v) < EPS);

  if (isNaN) {
    // 返回全 NaN 向量
    const emptyVec = new VectorX(n, new Array(n).fill(NaN));
    return new Array(n).fill(emptyVec);
  } else if (isZero) {
    // 如果全 0, 给个极小值防止除零 (暂时)
    values = new Array(n - 1).fill(EPS);
  }

  const res = [];

  // 2. 构造 N 个法向量
  for (let i = 0; i < n; i++) {
    const elements = new Array(n).fill(0);

    if (i === 0) {
      // 倒数第 1 位为 1, 其余 0
      elements[n - 1] = 1;
    } else {
      // 在 'n - 1 - i' 索引处，填入对应维度的坐标值 values[i - 1]
      elements[n - 1 - i] = values[i - 1];
      
      // 在 'n - i' 索引处, 如果是最后一个能取到坐标值的向量, 填入 -1
      // 否则填入下一个维度的负坐标值 -values[i]
      if (i < n - 1) {
        elements[n - i] = -values[i];
      } else {
        elements[n - i] = -1;
      }
    }

    // 3. 归一化
    res.push(new VectorX(n, elements).normalize());
  }

  // 4. 整体浮点钳制
  return clamp(res);
}

/**
 * 生成 N 维对称群的 对称矩阵 (Reflection Matrix) 组
 * @param {number[]} schlafli 施莱夫利符号
 * @returns {MatrixX[]} - N 个 N 维反射矩阵
 * 
 * e.g. N = 4: [Mv, Me, Mf, Mv]:
 * 
 * Mv = [ \
 *  [1, 0, 0, 0] \
 *  [0, 1, 0, 0] \
 *  [0, 0, 1, 0] \
 *  [0, 0, 0,-1] \
 * ]
 * 
 * Me = [ \
 *  [1, 0, 0, 0] \
 *  [0, 1, 0, 0] \
 *  [0, 0,-cM, sM] \
 *  [0, 0, sM, cM] \
 * ]
 * 
 * Mf = [ \
 *  [1, 0, 0, 0] \
 *  [0,-cMN, sMN, 0] \
 *  [0, sMN, cMN, 0] \
 *  [0, 0, 0, 1] \
 * ]
 * 
 * Mc = [ \
 *  [-cMNP, sMNP, 0, 0] \
 *  [ sMNP, cMNP, 0, 0] \
 *  [0, 0, 1, 0] \
 *  [0, 0, 0, 1] \
 * ]
 * 
 * 其中 cM, cMN, cMNP 为 {m}·{m, n}·{m, n, p} 对应的多胞体的 二胞角余弦值, 由 getDihedralAngle 函数给出
 */
export function getNDReflectionMatrices(schlafli) {
  const n = schlafli.length + 1;

  // 1. 计算所有的二胞角，存入数组
  // schls[i] 对应 [ angle({m}), angle({m, n}), ... ]
  const schls = [];
  for (let i = 1; i <= n - 1; i++) {
    schls.push(getDihedralAngle(schlafli.slice(0, i)).angle);
  }

  const res = [];

  // 2. 构造 N 个反射矩阵
  for (let i = 0; i < n; i++) {
    // 初始化 N 维单位矩阵
    const mat = MatrixX.identity(n);
    const E = mat.elements; // 列优先

    if (i === 0) {
      // 第 0 个 (matrixV): 最后一位为 -1
      E[n * n - 1] = -1;
    } else {
      // 第 i 个 (i > 0): 在特定的两个对角线位置填入 2x2 旋转块

      // 行列索引为 r1 = n - i - 1 和 r2 = n - i
      const r1 = n - i - 1;
      const r2 = n - i;

      // 获取对应的二胞角余弦和正弦
      // 注意：schls 的索引对应关系。4D 中 i=1 => M, i=2 => MN, i=3 => MNP
      const angle = schls[i - 1];
      const c = Math.cos(angle);
      const s = Math.sin(angle);

      // 由于内部是列优先存储，矩阵元素 E[row, col] 的索引是 col * n + row
      
      // r1 行 r1 列
      E[r1 * n + r1] = -c;
      // r1 行 r2 列
      E[r2 * n + r1] = s;
      // r2 行 r1 列
      E[r1 * n + r2] = s;
      // r2 行 r2 列
      E[r2 * n + r2] = c;
    }

    res.push(mat);
  }

  // 3. 整体浮点钳制
  return clamp(res);
}

/**
 * 生成 N 维 基向量 (V)
 * @param {number[]} schlafli 施莱夫利符号 e.g. [4, 3] / [4, 3, 3]
 * @param {string[]} rings 环序列 e.g. ['x', 'o', 'o'] / ['x', 'o', 'o', 'o']
 * @returns {VectorX} 基向量
 */
export function getNDBasicVec(schlafli, rings) {
  const n = schlafli.length + 1;
  
  if (rings.length !== n) {
    throw new Error(`${RED}rings 长度需为 (schlafli 长度 + 1), 实际 rings: ${rings.length}, schlafli: ${n - 1}${RESET}`);
  }

  // 1. 得到 N 维镜面法线矢量组
  const rnv = getNDReflectionNormalVecs(schlafli);
  
  // 这里处理特殊退化情况 (旧版 3D 里是判断 x 分量全为 0, 且最后一项为 EPS)
  // 一般这种退化发生在极端 schlafli 参数时
  const isZero = rnv.every(v => Math.abs(v.elements[0]) < EPS) && 
    Math.abs(rnv[n - 1].elements[n - 1] - EPS) < EPS;

  // 2. 将 rings 映射为数值
  const ringsNum = rings.map(x => {
    if (x === 'o') return 0;
    if (x === 'x') return 1;
    return Infinity; // 理论上不应传非 o/x 的字符
  });
  const V = new VectorX(n, ringsNum);

  // 3. 构造法向量矩阵 M
  // 由于 MatrixX 内部是列优先 (elements[col * n + row]), 
  // 而这里的 rnv 是一个包含 n 个向量的数组, 每个向量相当于矩阵的一行
  const M = new MatrixX(n);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      // 第 row 个法向量的第 col 个分量, 对应矩阵的 (row, col)
      M.elements[col * n + row] = rnv[row].elements[col];
    }
  }

  // 4. 求逆并相乘 basicVec = M⁻¹ V
  let basicVec;
  try {
    const Minv = M.invert();
    basicVec = V.applyMatrix(Minv);
  } catch (err) {
    console.warn(`[getNDBasicVec] 矩阵求逆失败 (n=${n}, schlafli=[${schlafli}]):`, err.message);
    
    // 如果矩阵不可逆 (出现 NaN 或全 0 的情况)
    basicVec = new VectorX(n, new Array(n).fill(NaN));
  }

  // 5. 处理退化情形 (旧代码中的 isZero 逻辑)
  if (isZero) {
    basicVec.elements[0] = 0;
  }

  return clamp(basicVec);
}

// 记忆化字典
const seqmatrixCache = new Map();

// 用于递归迭代的函数
function generateSeqToMatrix(matrices, schlafli, symmetrySeq) {
  const n = schlafli.length + 1; // 维度

  const key = `${schlafli.join(',')}_|_${symmetrySeq}`; // e.g. '4,3_|_fev'

  // 缓存 存在
  if (seqmatrixCache.has(key)) {
    return seqmatrixCache.get(key);
  }
  
  // 递归触底, 返回单位矩阵
  if (symmetrySeq.length === 0) {
    const idt = MatrixX.identity(n);
    seqmatrixCache.set(key, idt);
    return idt;
  }

  const dims = dimensionSymbols;
  const [first, rest] = [symmetrySeq.slice(0, 1), symmetrySeq.slice(1)];

  const leftMatrix = matrices[dims.indexOf(first)];
  const rightMatrix = generateSeqToMatrix(matrices, schlafli, rest);

  // 附加了 浮点误差钳制 (Clamp)
  const resMatrix = clamp(leftMatrix.clone().multiply(rightMatrix));
  seqmatrixCache.set(key, resMatrix);

  return resMatrix;
}

/**
 * 由对称序列 (symmetrySeq) 生成 总对称矩阵
 * @param {number[]} schlafli 施莱夫利符号
 * @param {string} symmetrySeq 对称序列
 * @returns {MatrixX} 对称矩阵
 */
// 用于外部调用的函数
export function generateSymmtrySeqMatrix(schlafli, symmetrySeq) {
  // 只需算一次矩阵 (Matrix, pl. Matrices)
  const matrices = getNDReflectionMatrices(schlafli);

  return generateSeqToMatrix(matrices, schlafli, symmetrySeq);
}