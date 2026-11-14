/**
 * 文件: js/math/vectorX.js
 * N 维向量类 (2 <= n <= 10)
 */

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

export class VectorX {
  constructor(n, elements = null) {
    if (n < 1 || n > 10) {
      throw new Error(`${RED}VectorX 维度限制在 1 ~ 10 之间, 收到 ${n}${RESET}`);
    }
    this.n = n;
    this.isVectorX = true; // 通用标识
    if (elements) {
      this.elements = new Float64Array(elements);
    } else {
      this.elements = new Float64Array(n);
    }
  }

  set(...values) {
    if (values.length !== this.n) {
      throw new Error(`${RED}VectorX.set: 期望 ${this.n} 个参数, 收到 ${values.length} 个${RESET}`);
    }
    this.elements = new Float64Array(values);
    return this;
  }

  clone() {
    return new VectorX(this.n, this.elements);
  }

  length() {
    let sum = 0;
    for (let i = 0; i < this.n; i++) sum += this.elements[i] * this.elements[i];
    return Math.sqrt(sum);
  }

  normalize() {
    const len = this.length();
    const res = this.clone();
    if (len > 1e-12) {
      for (let i = 0; i < this.n; i++) res.elements[i] /= len;
    }
    return res;
  }

  dot(vec) {
    if (!vec.isVectorX || this.n !== vec.n) {
      throw new Error(`${RED}VectorX.dot: 维度不匹配或非 VectorX${RESET}`);
    }
    let sum = 0;
    for (let i = 0; i < this.n; i++) sum += this.elements[i] * vec.elements[i];
    return sum;
  }

  add(vec) {
    if (!vec.isVectorX || this.n !== vec.n) {
      throw new Error(`${RED}VectorX.add: 维度不匹配或非 VectorX${RESET}`);
    }
    const res = new VectorX(this.n);
    for (let i = 0; i < this.n; i++) {
      res.elements[i] = this.elements[i] + vec.elements[i];
    }
    return res;
  }

  sub(vec) {
    if (!vec.isVectorX || this.n !== vec.n) {
      throw new Error(`${RED}VectorX.sub: 维度不匹配或非 VectorX${RESET}`);
    }
    const res = new VectorX(this.n);
    for (let i = 0; i < this.n; i++) {
      res.elements[i] = this.elements[i] - vec.elements[i];
    }
    return res;
  }

  /**
   * 左乘矩阵 (M · V)
   * 矩阵是列优先存储的
   * @param {MatrixX} mat 
   * @returns {VectorX} 新的向量
   */
  applyMatrix(mat) {
    if (!mat.isMatrixX || this.n !== mat.n) {
      throw new Error(`${RED}VectorX.applyMatrix: 维度不匹配或非 MatrixX${RESET}`);
    }
    const res = new VectorX(this.n);
    const n = this.n;
    for (let row = 0; row < n; row++) {
      let sum = 0;
      for (let col = 0; col < n; col++) {
        // elements[列 * n + 行]
        sum += mat.elements[col * n + row] * this.elements[col];
      }
      res.elements[row] = sum;
    }
    return res;
  }

  toArray() {
    return Array.from(this.elements);
  }
}

/**
 * 通用判断：是否是一个向量 (兼容 VectorX 和 Three.js 的 Vector)
 */
export function isVector(data) {
  return data && (data.isVectorX || data.isVector3 || data.isVector4);
}

/**
 * 获取向量的维度 (2~10)
 */
export function getVectorDimension(v) {
  if (v.isVectorX) return v.n;
  if (v.isVector3) return 3;
  if (v.isVector4) return 4;
  return 0;
}