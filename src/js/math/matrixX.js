/**
 * 文件: js/math/matrixX.js
 * N 维方阵类 (2 <= n <= 10)
 * 
 * 内部使用 列优先 (Column-Major) 存储
 */

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

export class MatrixX {
  constructor(n, elements = null) {
    if (n < 1 || n > 10) {
      throw new Error(`${RED}MatrixX 维度限制在 1 ~ 10 之间, 收到 ${n}${RESET}`);
    }
    this.n = n;
    this.isMatrixX = true; // 通用标识
    if (elements) {
      this.elements = new Float64Array(elements);
    } else {
      this.elements = new Float64Array(n * n);
    }
  }

  /**
   * 兼容 set 传入 n*n 个数字, 或者传入 n 个 VectorX (列向量)
   */
  set(...args) {
    if (args.length === this.n * this.n) {
      this.elements = new Float64Array(args);
    } else if (args.length === this.n && args[0].isVectorX) {
      // 传入 n 个 VectorX, 每个代表一列
      let idx = 0;
      for (let col = 0; col < this.n; col++) {
        for (let row = 0; row < this.n; row++) {
          this.elements[idx++] = args[col].elements[row];
        }
      }
    } else {
      throw new Error(`${RED}MatrixX.set: 参数数量或类型错误${RESET}`);
    }
    return this;
  }

  clone() {
    return new MatrixX(this.n, this.elements);
  }

  static identity(n) {
    const m = new MatrixX(n);
    for (let i = 0; i < n; i++) {
      m.elements[i * n + i] = 1;
    }
    return m;
  }

  transpose() {
    const res = new MatrixX(this.n);
    const n = this.n;
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        res.elements[row * n + col] = this.elements[col * n + row];
      }
    }
    return res;
  }

  multiply(mat) {
    if (!mat.isMatrixX || this.n !== mat.n) {
      throw new Error(`${RED}MatrixX.multiply: 维度不匹配或非 MatrixX${RESET}`);
    }
    const n = this.n;
    const res = new MatrixX(n);
    for (let col = 0; col < n; col++) {
      for (let row = 0; row < n; row++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          // A[row, k] * B[k, col]
          sum += this.elements[k * n + row] * mat.elements[col * n + k];
        }
        res.elements[col * n + row] = sum;
      }
    }
    return res;
  }

  /**
   * 计算行列式
   * 4 维及以下闭式, 4 维以上用递归拉普拉斯展开
   */
  det() {
    const n = this.n;
    const E = this.elements;
    if (n === 1) return E[0];
    if (n === 2) return E[0] * E[3] - E[2] * E[1];
    if (n === 3) {
      return E[0] * (E[4] * E[8] - E[7] * E[5])
        - E[3] * (E[1] * E[8] - E[7] * E[2])
        + E[6] * (E[1] * E[5] - E[4] * E[2]);
    }
    if (n === 4) return this._det4();

    return this._detRecursive(E, n);
  }

  _det4() {
    const E = this.elements;
    const m00 = E[0], m10 = E[1], m20 = E[2], m30 = E[3];
    const m01 = E[4], m11 = E[5], m21 = E[6], m31 = E[7];
    const m02 = E[8], m12 = E[9], m22 = E[10], m32 = E[11];
    const m03 = E[12], m13 = E[13], m23 = E[14], m33 = E[15];

    const s0 = m00 * m11 - m10 * m01;
    const s1 = m00 * m21 - m20 * m01;
    const s2 = m00 * m31 - m30 * m01;
    const s3 = m10 * m21 - m20 * m11;
    const s4 = m10 * m31 - m30 * m11;
    const s5 = m20 * m31 - m30 * m21;

    const c5 = m22 * m33 - m32 * m23;
    const c4 = m12 * m33 - m32 * m13;
    const c3 = m12 * m23 - m22 * m13;
    const c2 = m02 * m33 - m32 * m03;
    const c1 = m02 * m23 - m22 * m03;
    const c0 = m02 * m13 - m12 * m03;

    return s0 * c5 - s1 * c4 + s2 * c3 + s3 * c2 - s4 * c1 + s5 * c0;
  }

  _detRecursive(E, n) {
    if (n === 1) return E[0];
    if (n === 2) return E[0] * E[3] - E[2] * E[1]; // 递归到底层用 2x2 闭式

    let sum = 0;
    for (let col = 0; col < n; col++) {
      const sub = new Float64Array((n - 1) * (n - 1));
      let idx = 0;
      for (let c = 0; c < n; c++) {
        if (c === col) continue;
        for (let r = 1; r < n; r++) {
          sub[idx++] = E[c * n + r];
        }
      }
      const sign = (col % 2 === 0) ? 1 : -1;
      sum += sign * E[col * n + 0] * this._detRecursive(sub, n - 1);
    }
    return sum;
  }

  /**
   * 求逆矩阵 (支持 n=2,3,4 的伴随矩阵法，n>4 暂抛错)
   */
  invert() {
    const n = this.n;
    if (n > 4) throw new Error(`${RED}MatrixX.invert: 暂不支持 > 4 维的求逆${RESET}`);

    const det = this.det();
    if (Math.abs(det) < 1e-12) throw new Error(`${RED}MatrixX.invert: 矩阵不可逆 (Det = 0)${RESET}`);

    const invDet = 1.0 / det;
    const E = this.elements;
    const res = new MatrixX(n);

    if (n === 1) {
      res.elements[0] = invDet;
      return res;
    }

    if (n === 2) {
      res.elements[0] = E[3] * invDet;
      res.elements[1] = -E[1] * invDet;
      res.elements[2] = -E[2] * invDet;
      res.elements[3] = E[0] * invDet;
      return res;
    }

    if (n === 3) {
      res.elements[0] = (E[4] * E[8] - E[7] * E[5]) * invDet;
      res.elements[1] = -(E[1] * E[8] - E[7] * E[2]) * invDet;
      res.elements[2] = (E[1] * E[5] - E[4] * E[2]) * invDet;
      res.elements[3] = -(E[3] * E[8] - E[6] * E[5]) * invDet;
      res.elements[4] = (E[0] * E[8] - E[6] * E[2]) * invDet;
      res.elements[5] = -(E[0] * E[5] - E[3] * E[2]) * invDet;
      res.elements[6] = (E[3] * E[7] - E[6] * E[4]) * invDet;
      res.elements[7] = -(E[0] * E[7] - E[6] * E[1]) * invDet;
      res.elements[8] = (E[0] * E[4] - E[3] * E[1]) * invDet;
      return res;
    }

    if (n === 4) {
      // 列优先存储下:
      // 行索引 r, 列索引 c => E[c * 4 + r]
      // 对应数学矩阵元素 M[r][c]
      const m00 = E[0],  m01 = E[4],  m02 = E[8],  m03 = E[12];
      const m10 = E[1],  m11 = E[5],  m12 = E[9],  m13 = E[13];
      const m20 = E[2],  m21 = E[6],  m22 = E[10], m23 = E[14];
      const m30 = E[3],  m31 = E[7],  m32 = E[11], m33 = E[15];

      // 2x2 子式 (用 |a b; c d| = ad - bc)
      const s0 = m00 * m11 - m10 * m01;
      const s1 = m00 * m12 - m10 * m02;
      const s2 = m00 * m13 - m10 * m03;
      const s3 = m01 * m12 - m11 * m02;
      const s4 = m01 * m13 - m11 * m03;
      const s5 = m02 * m13 - m12 * m03;

      const c5 = m22 * m33 - m32 * m23;
      const c4 = m21 * m33 - m31 * m23;
      const c3 = m21 * m32 - m31 * m22;
      const c2 = m20 * m33 - m30 * m23;
      const c1 = m20 * m32 - m30 * m22;
      const c0 = m20 * m31 - m30 * m21;

      // 计算逆矩阵的每个元素 A⁻¹ = (1/det) * A*
      // 注意列优先: res.elements[col * 4 + row]
      
      // 这里 AI 还是展开了原式
      // 第一行
      res.elements[0] =  (m11*(m22*m33-m32*m23) - m12*(m21*m33-m31*m23) + m13*(m21*m32-m31*m22)) * invDet;
      res.elements[4] = -(m01*(m22*m33-m32*m23) - m02*(m21*m33-m31*m23) + m03*(m21*m32-m31*m22)) * invDet;
      res.elements[8] =  (m01*(m12*m33-m32*m13) - m02*(m11*m33-m31*m13) + m03*(m11*m32-m31*m12)) * invDet;
      res.elements[12]= -(m01*(m12*m23-m22*m13) - m02*(m11*m23-m21*m13) + m03*(m11*m22-m21*m12)) * invDet;

      // 第二行
      res.elements[1] = -(m10*(m22*m33-m32*m23) - m12*(m20*m33-m30*m23) + m13*(m20*m32-m30*m22)) * invDet;
      res.elements[5] =  (m00*(m22*m33-m32*m23) - m02*(m20*m33-m30*m23) + m03*(m20*m32-m30*m22)) * invDet;
      res.elements[9] = -(m00*(m12*m33-m32*m13) - m02*(m10*m33-m30*m13) + m03*(m10*m32-m30*m12)) * invDet;
      res.elements[13]=  (m00*(m12*m23-m22*m13) - m02*(m10*m23-m20*m13) + m03*(m10*m22-m20*m12)) * invDet;

      // 第三行
      res.elements[2] =  (m10*(m21*m33-m31*m23) - m11*(m20*m33-m30*m23) + m13*(m20*m31-m30*m21)) * invDet;
      res.elements[6] = -(m00*(m21*m33-m31*m23) - m01*(m20*m33-m30*m23) + m03*(m20*m31-m30*m21)) * invDet;
      res.elements[10]=  (m00*(m11*m33-m31*m13) - m01*(m10*m33-m30*m13) + m03*(m10*m31-m30*m11)) * invDet;
      res.elements[14]= -(m00*(m11*m23-m21*m13) - m01*(m10*m23-m20*m13) + m03*(m10*m21-m20*m11)) * invDet;

      // 第四行
      res.elements[3] = -(m10*(m21*m32-m31*m22) - m11*(m20*m32-m30*m22) + m12*(m20*m31-m30*m21)) * invDet;
      res.elements[7] =  (m00*(m21*m32-m31*m22) - m01*(m20*m32-m30*m22) + m02*(m20*m31-m30*m21)) * invDet;
      res.elements[11]= -(m00*(m11*m32-m31*m12) - m01*(m10*m32-m30*m12) + m02*(m10*m31-m30*m11)) * invDet;
      res.elements[15]=  (m00*(m11*m22-m21*m12) - m01*(m10*m22-m20*m12) + m02*(m10*m21-m20*m11)) * invDet;

      return res;
    }
  }
}

/**
 * 通用判断：是否是一个矩阵 (兼容 MatrixX 和 Three.js 的 Matrix)
 */
export function isMatrix(data) {
  return data && (data.isMatrixX || data.isMatrix3 || data.isMatrix4);
}

/**
 * 获取矩阵的维度 (2~10)
 */
export function getMatrixDimension(m) {
  if (m.isMatrixX) return m.n;
  if (m.isMatrix3) return 3;
  if (m.isMatrix4) return 4;
  return 0;
}