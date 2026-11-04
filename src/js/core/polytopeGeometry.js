/**
 * 文件: js/core/polytopeGeometry.js
 * 实现 计算 高对称多胞形 (Highly Symmetric Polytope) 的二胞角 (Dihedral Angle)
 * 实现 生成 对称矩阵 (Reflection Matrix)
 */

import * as THREE from 'three';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

// 浮点误差容差
export const EPS = 1e-10;

export const dimensionSymbols = 'vefctpxzy';

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

  // 3. Three.js 矩阵
  if (data && (data.isMatrix3 || data.isMatrix4) && typeof data.clone === 'function') {
    const res = data.clone();
    const elements = [];

    for (const i of res.elements) {
      elements.push(clampFloat(i));
    }
    res.elements = elements;

    return res;
  }

  // 4. Three.js 矢量
  if (data && (data.isVector3 || data.isVector4) && typeof data.clone === 'function') {
    const res = data.clone();
    res.x = clampFloat(res.x);
    res.y = clampFloat(res.y);
    res.z = clampFloat(res.z);
    if (res.isVector4) {
      res.w = clampFloat(res.w);
    }

    return res;
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
 * 计算 3 维 仿射 (Affine) 坐标值 (Coordinate Value)
 * 原理:
 * v() => sin θ_VE / cos θ_CV
 * e() => sin θ_EF / cos θ_CE
 * 
 * return: { v, e }
 */
function get3DAffineCoordinateValues(schlafli) {
  if (schlafli.length !== 2) {
    throw new Error(`${RED}schlafli 长度需为 2, 实际 ${schlafli.length}${RESET}`);
  }
  const cosines = getAdjacentAxisCosines(schlafli);
  const [cVE, cEF] = cosines;
  const [sVE, sEF] = [
    Math.sqrt(clamp(1 - cVE * cVE)),
    Math.sqrt(clamp(1 - cEF * cEF)),
  ];

  const v = sVE / (cVE * cEF);
  const e = sEF / cEF;

  return clamp({ v, e });
}

/**
 * 计算 4 维 仿射 (Affine) 坐标值 (Coordinate Value)
 * 原理:
 * v() => sin θ_VE / cos θ_CV
 * e() => sin θ_EF / cos θ_CE
 * f() => sin θ_FC / cos θ_CF
 * 
 * return: { v, e, f }
 */
function get4DAffineCoordinateValues(schlafli) {
  if (schlafli.length !== 3) {
    throw new Error(`${RED}schlafli 长度需为 3, 实际 ${schlafli.length}${RESET}`);
  }
  const cosines = getAdjacentAxisCosines(schlafli);
  const [cVE, cEF, cFC] = cosines;
  const [sVE, sEF, sFC] = [
    Math.sqrt(clamp(1 - cVE * cVE)),
    Math.sqrt(clamp(1 - cEF * cEF)),
    Math.sqrt(clamp(1 - cFC * cFC))
  ];

  const v = sVE / (cVE * cEF * cFC);
  const e = sEF / (cEF * cFC);
  const f = sFC / cFC;

  return clamp({ v, e, f });
}

/**
 * 计算 3 维 仿射坐标 (Affine Axes) 基向量
 * @param {number[]} schlafli 施莱夫利符号
 * @returns {THREE.Vector3[]} - 3 条基向量
 * (生成的矢量组已经归一化)
 */
function get3DAffineAxes(schlafli) {
  if (schlafli.length !== 2) {
    throw new Error(`${RED}schlafli 长度需为 2, 实际 ${schlafli.length}${RESET}`);
  }

  // 获得仿射坐标值
  const affCoordVecs = get3DAffineCoordinateValues(schlafli);
  const { v, e } = affCoordVecs;

  const vV = new THREE.Vector3(1, e, v).normalize();
  const vE = new THREE.Vector3(1, e, 0).normalize();
  const vF = new THREE.Vector3(1, 0, 0).normalize();

  return clamp([vV, vE, vF]);
}

/**
 * 计算 4 维 仿射坐标 (Affine Axes) 基向量
 * @param {number[]} schlafli 施莱夫利符号
 * @returns {THREE.Vector4[]} - 4 条基向量
 * (生成的矢量组已经归一化)
 */
function get4DAffineAxes(schlafli) {
  if (schlafli.length !== 3) {
    throw new Error(`${RED}schlafli 长度需为 3, 实际 ${schlafli.length}${RESET}`);
  }

  // 获得仿射坐标值
  const affCoordVecs = get4DAffineCoordinateValues(schlafli);
  const { v, e, f } = affCoordVecs;

  const vV = new THREE.Vector4(1, f, e, v).normalize();
  const vE = new THREE.Vector4(1, f, e, 0).normalize();
  const vF = new THREE.Vector4(1, f, 0, 0).normalize();
  const vC = new THREE.Vector4(1, 0, 0, 0).normalize();

  return clamp([vV, vE, vF, vC]);
}

/**
 * 生成 3 维 镜面法线矢量组 (Reflection Normal Vectors)
 * (生成的矢量组已经归一化)
 */
export function get3DReflectionNormalVecs(schlafli) {
  if (schlafli.length !== 2) {
    throw new Error(`${RED}schlafli 长度需为 2, 实际 ${schlafli.length}${RESET}`);
  }

  const affCoordVecs = get3DAffineCoordinateValues(schlafli);
  let { v, e } = affCoordVecs;
  
  const isNaN = (!Number.isFinite(v) || !Number.isFinite(e));
  const isZero = (Math.abs(v) === 0 && Math.abs(e) === 0);
  if (isNaN) {
    const emptyVec = new THREE.Vector3(NaN, NaN, NaN);
    return [emptyVec, emptyVec, emptyVec];
  } else if (isZero) {
    v = e = EPS;
  }

  const vV = new THREE.Vector3(0, 0, 1).normalize();
  const vE = new THREE.Vector3(0, v, -e).normalize();
  const vF = new THREE.Vector3(e, -1, 0).normalize();

  return clamp([vV, vE, vF]);
}

/**
 * 生成 4 维 镜面法线矢量组 (Reflection Normal Vectors)
 * (生成的矢量组已经归一化)
 */
export function get4DReflectionNormalVecs(schlafli) {
  if (schlafli.length !== 3) {
    throw new Error(`${RED}schlafli 长度需为 3, 实际 ${schlafli.length}${RESET}`);
  }
  const affCoordVecs = get4DAffineCoordinateValues(schlafli);
  let { v, e, f } = affCoordVecs;
  const isNaN = (!Number.isFinite(v) || !Number.isFinite(e) || !Number.isFinite(f));
  const isZero = (Math.abs(v) === 0 && Math.abs(e) === 0 && Math.abs(f) === 0);
  if (isNaN) {
    const emptyVec = new THREE.Vector4(NaN, NaN, NaN, NaN);
    return [emptyVec, emptyVec, emptyVec, emptyVec];
  } else if (isZero) {
    v = e = f = EPS;
  }

  const vV = new THREE.Vector4(0, 0, 0, 1).normalize();
  const vE = new THREE.Vector4(0, 0, v, -e).normalize();
  const vF = new THREE.Vector4(0, e, -f, 0).normalize();
  const vC = new THREE.Vector4(f, -1, 0, 0).normalize();

  return clamp([vV, vE, vF, vC]);
}

/**
 * 生成 3 维对称群的 对称矩阵 (Reflection Matrix)
 */
export function get3DReflectionMatrices(schlafli) {
  if (schlafli.length !== 2) {
    throw new Error(`${RED}schlafli 长度需为 2, 实际 ${schlafli.length}${RESET}`);
  }

  const schls = [1, 2].map(i => getDihedralAngle(schlafli.slice(0, i)).angle);
  // [ angle({m}), angle({m, n}) ]

  const [cM, sM] = [Math.cos(schls[0]), Math.sin(schls[0])];
  const [cMN, sMN] = [Math.cos(schls[1]), Math.sin(schls[1])];

  const matrixV = new THREE.Matrix3().set(
    1, 0, 0,
    0, 1, 0,
    0, 0, -1
  );
  const matrixE = new THREE.Matrix3().set(
    1, 0, 0,
    0, -cM, sM,
    0, sM, cM
  );
  const matrixF = new THREE.Matrix3().set(
    -cMN, sMN, 0,
    sMN, cMN, 0,
    0, 0, 1
  );
  return clamp([matrixV, matrixE, matrixF]);
}

/**
 * 生成 4 维对称群的 对称矩阵 (Reflection Matrix) 组
 */
export function get4DReflectionMatrices(schlafli) {
  if (schlafli.length !== 3) {
    throw new Error(`${RED}schlafli 长度需为 3, 实际 ${schlafli.length}${RESET}`);
  }
  const schls = [1, 2, 3].map(i => getDihedralAngle(schlafli.slice(0, i)).angle);
  // [ angle({m}), angle({m, n}), angle({m, n, p}) ]

  const [cM, sM] = [Math.cos(schls[0]), Math.sin(schls[0])];
  const [cMN, sMN] = [Math.cos(schls[1]), Math.sin(schls[1])];
  const [cMNP, sMNP] = [Math.cos(schls[2]), Math.sin(schls[2])];
  // 附加 clamp 三角函数值 浮点误差钳制

  const matrixV = new THREE.Matrix4().set(
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, -1
  );
  const matrixE = new THREE.Matrix4().set(
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, -cM, sM,
    0, 0, sM, cM
  );
  const matrixF = new THREE.Matrix4().set(
    1, 0, 0, 0,
    0, -cMN, sMN, 0,
    0, sMN, cMN, 0,
    0, 0, 0, 1
  );
  const matrixC = new THREE.Matrix4().set(
    -cMNP, sMNP, 0, 0,
    sMNP, cMNP, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  );

  return clamp([matrixV, matrixE, matrixF, matrixC]);
}

/**
 * 生成 3 维 基向量 (V)
 * @param {number[]} schlafli 施莱夫利符号 e.g. [4, 3]
 * @param {string[]} rings 环序列 e.g. ['x', 'o', 'o']
 * @returns {THREE.Vector3} 基向量
 */

export function get3DBasicVec(schlafli, rings) {
  if (schlafli.length !== 2) {
    throw new Error(`${RED}schlafli 长度需为 2, 实际 ${schlafli.length}${RESET}`);
  }
  if (rings.length !== 3) {
    throw new Error(`${RED}rings 长度需为 3, 实际 ${rings.length}${RESET}`);
  }
  // 得到 镜面法线矢量组
  const rnv = get3DReflectionNormalVecs(schlafli);
  const [vV, vE, vF] = rnv;
  const isZero = (vV.x === 0 && vE.x === 0 && vF.x === EPS);
  const ringsNum = rings.map(x => {
    if (x === 'o') {
      return 0;
    } else if (x === 'x') {
      return 1;
    } else {
      return Infinity;
    }
  });

  const M = new THREE.Matrix3().set(
    vV.x, vV.y, vV.z,
    vE.x, vE.y, vE.z,
    vF.x, vF.y, vF.z
  );
  const V = new THREE.Vector3(...ringsNum);
  
  const basicVec = V.clone().applyMatrix3(M.clone().invert());
  if (isZero) basicVec.x = 0;
  console.log("basicVec", schlafli, basicVec);
  return clamp(basicVec);
}

/**
 * 生成 4 维 基向量 (V)
 * @param {number[]} schlafli 施莱夫利符号 e.g. [4, 3, 3]
 * @param {string[]} rings 环序列 e.g. ['x', 'o', 'o', 'o']
 * @returns {THREE.Vector4} 基向量
 */
export function get4DBasicVec(schlafli, rings) {
  if (schlafli.length !== 3) {
    throw new Error(`${RED}schlafli 长度需为 3, 实际 ${schlafli.length}${RESET}`);
  }
  if (rings.length !== 4) {
    throw new Error(`${RED}rings 长度需为 4, 实际 ${rings.length}${RESET}`);
  }
  // 得到 镜面法线矢量组
  const rnv = get4DReflectionNormalVecs(schlafli);
  const [vV, vE, vF, vC] = rnv;

  const M = new THREE.Matrix4().set(
    vV.x, vV.y, vV.z, vV.w,
    vE.x, vE.y, vE.z, vE.w,
    vF.x, vF.y, vF.z, vF.w,
    vC.x, vC.y, vC.z, vC.w
  );
  const ringsNum = rings.map(x => {
    if (x === 'o') {
      return 0;
    } else if (x === 'x') {
      return 1;
    } else {
      return Infinity;
    }
  });
  const V = new THREE.Vector4(...ringsNum);

  // 还没法处理 退化情形
  // basicVec = M⁻¹V
  const basicVec = V.clone().applyMatrix4(M.clone().invert());
  return clamp(basicVec);
}


// 记忆化字典
const seqmatrixCache = new Map();

// 用于递归迭代的函数
function generateSeqToMatrix(matrices, schlafli, symmetrySeq) {
  const Matrix = (schlafli.length === 2) ? THREE.Matrix3 : THREE.Matrix4

  const key = `${schlafli.join(',')}_|_${symmetrySeq}` // e.g. '4,3_|_fev'

  // 缓存 存在
  if (seqmatrixCache.has(key)) {
    return seqmatrixCache.get(key);
  }
  if (symmetrySeq.length === 0) {
    const idt = new Matrix(); // 单位矩阵
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
 * @returns {THREE.Matrix3 | THREE.Matrix4} 对称矩阵
 * 
 */
// 用于外部调用的函数
export function generateSymmtrySeqMatrix(schlafli, symmetrySeq) {
  if (schlafli.length !== 2 && schlafli.length !== 3) {
    throw new Error(`${RED}schlafli 长度需为 2 或 3, 实际 ${schlafli.length}${RESET}`);
  }

  // 只需算一次矩阵 (Matrix, pl. Matrices)
  const matrices = (schlafli.length === 2) ? get3DReflectionMatrices(schlafli) : get4DReflectionMatrices(schlafli);

  return generateSeqToMatrix(matrices, schlafli, symmetrySeq);
}
