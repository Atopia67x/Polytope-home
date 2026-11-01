/**
 * 文件: test/test.mjs
 * 测试 js/core/polytopeGeometry.js
 *      js/core/polytopeSymmetry.js
 * 
 * 运行:
 *   node test/test.mjs
 */

import * as THREE from 'three';

import assert from 'node:assert';
import {
  get3DReflectionMatrices,
  get4DReflectionMatrices,
  generate3DBasicVec,
  generate4DBasicVec
} from '../js/core/polytopeGeometry.js';

import {
  buildPoset,
} from '../js/core/polytopeSymmetry.js';

const DEG = 180 / Math.PI;
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function fmtFixed(value, intWidth, decWidth) {
  if (!Number.isFinite(value)) {
    return 'NaN'.padStart(intWidth + 1 + decWidth);   // 占满整列宽
  }
  const s = value.toFixed(decWidth);
  const [intPart, decPart] = s.split('.');
  return intPart.padStart(intWidth) + '.' + decPart;
}
// ------------------------------------------------------------
// 工具: 打印一行
// ------------------------------------------------------------
function show(schlafli) {
  const r = getDihedralAngle(schlafli);
  const deg = r.angle * DEG;

  // 第一列: 左对齐, 固定 10 宽
  const col1 = `{${schlafli.join(',')}}`.padEnd(14);

  // sinHalf: 整数最多 1 位(0~1), 小数 8 位
  const sinStr = fmtFixed(r.sinHalf, 1, 8);   // 如 "0.80901699"

  // angle: 整数最多 3 位(0~180), 小数 6 位
  const degStr = fmtFixed(deg, 3, 6);         // 如 " 72.000000"

  const rest = `sinHalf = ${sinStr}`.padEnd(26) + `angle = ${degStr}°`;

  const isNaN = Number.isNaN(r.sinHalf) || Number.isNaN(deg);
  const is180 = Math.abs(deg - 180) < 1e-6;

  if (isNaN) {
    console.log(`${RED}${col1}${rest}${RESET}`);
  } else if (is180) {
    console.log(`${GREEN}${col1}${rest}${RESET}`);
  } else {
    console.log(`${BLUE}${col1}${RESET}${rest}`);
  }

  return { sinHalf: r.sinHalf, deg };
}

const polytopeList = [
  [], [3], [4], [5], [6],

  [3, 3], [3, 4], [3, 5], [3, 6],
  [4, 3], [4, 4], [4, 5],
  [5, 3], [5, 4],
  [6, 2], [6, 3],

  [3, 3, 3], [3, 3, 4], [3, 4, 3], [3, 4, 4],
  [4, 3, 3], [4, 4, 2],
  [3, 3, 5], [5, 3, 3], [3, 3, 6],
  [6, 2, 2],

  [3, 3, 3, 3], [3, 3, 3, 4], [3, 3, 4, 3], [3, 4, 3, 3], [4, 3, 3, 3],
  [5, 3, 3, 3],

  [3, 3, 3, 3, 3],
  [3, 3, 3, 3, 3, 3]
];

/**
 * 调试输出: 相邻轴余弦
 * 颜色: 第一列蓝; NaN/越界 整行红; cos≈-1 (θ≈180°) 整行绿
 */
function showAdjacentCosines(schlafli) {
  const r = computeAdjacentAxisCosines(schlafli);
  const entries = Object.entries(r);

  const col1 = `{${schlafli.join(',')}}`.padEnd(12);
  const cells = entries.map(([name, val]) => {
    const deg = fmtFixed(Math.acos(val) * DEG, 2, 6);
    return `${name}=${deg}°`;
  });

  const hasNaN = entries.some(([, v]) => !Number.isFinite(v));
  const hasOutOfRange = entries.some(([, v]) => Number.isFinite(v) && (v < -1 - 1e-6 || v > 1 + 1e-6));
  const all180 = entries.length > 0 && entries.every(([, v]) =>
    Number.isFinite(v) && Math.abs(v - 1) < 1e-6
  );

  const line = `${col1}  ${cells.join('   ')}`;

  if (hasNaN || hasOutOfRange) {
    console.log(`${RED}${line}${RESET}`);       // NaN / 越界 => 红
  } else if (all180) {
    console.log(`${GREEN}${line}${RESET}`);     // 全部 cos=-1 (θ=180°) => 绿
  } else {
    const rest = `  ${cells.join('   ')}`;
    console.log(`${BLUE}${col1}${RESET}${rest}`); // 正常: 第一列蓝
  }

  return r;
}

/**
 * 打印 makeSymmetryGroupList 的返回列表
 */
function showSymmetryGroupList(schlafli, k) {
  const list = makeSymmetryGroupList(schlafli, k);

  const col1 = `{${schlafli.join(',')}}`.padEnd(14);

  // 空列表: 蓝色第一列 + 灰色 "(空)"
  if (!Array.isArray(list) || list.length === 0) {
    console.log(`${BLUE}${col1}${RESET}(空)`);
    return list;
  }

  // 元素转字符串: 字符串直接用; 对象取 name/key/id
  const names = list.map(item => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      return item.name ?? item.key ?? item.id ?? JSON.stringify(item);
    }
    return String(item);
  });

  const body = names.join(', ');
  console.log(`${BLUE}${col1}${RESET}${body}`);
  return list;
}

console.log(buildPoset([4, 3])(generate3DBasicVec([4, 3], ['x', 'x', 'x'])));

console.log('\n全部测试执行完毕. ');