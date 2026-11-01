import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 单文件结构拆解页面的静态验收脚本。
 *
 * 只读取脚本同目录下的 HTML，提取 <script type="module">，
 * 去掉 import 声明后做语法编译检查；不安装依赖、不写 C 盘临时文件。
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(here, '计算机组成原理-结构拆解可视化.html');

function fail(message) {
  console.error('✗', message);
  process.exitCode = 1;
}

function ok(message) {
  console.log('✓', message);
}

if (!fs.existsSync(htmlPath)) {
  fail(`找不到文件: ${htmlPath}`);
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
console.log(`文件: ${htmlPath}`);
console.log(`大小: ${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB`);

// 1. 必须包含主模块
const moduleMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!moduleMatch) {
  fail('没有找到 <script type="module"> 主模块');
  process.exit(1);
}
const moduleCode = moduleMatch[1];
ok(`找到主模块 (${moduleCode.length} 字符)`);

// 2. 去除 import 后用 Function 编译，验证语法
const withoutImports = moduleCode.replace(
  /^\s*import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,
  '',
);
try {
  // 不执行，只编译
  new Function(withoutImports);
  ok('主模块语法编译通过');
} catch (error) {
  fail(`主模块语法错误: ${error.message}`);
}

// 3. 必须是单文件：除 CDN 脚本和 data: favicon 外，不依赖本地脚本或图片
const localScriptSrc = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
  .map((m) => m[1])
  .filter((src) => !/^https?:\/\//i.test(src));
if (localScriptSrc.length) fail(`存在本地外部脚本: ${localScriptSrc.join(', ')}`);
else ok('没有本地外部脚本');

const localImg = [...html.matchAll(/<(?:img|image)[^>]+src=["']([^"']+)["']/gi)]
  .map((m) => m[1])
  .filter((src) => !/^data:|^https?:\/\//i.test(src));
if (localImg.length) fail(`存在本地图片依赖: ${localImg.join(', ')}`);
else ok('没有本地图片依赖');

// 4. CDN 必须来自 GitHub 仓库（通过 jsDelivr 的 GitHub 文件服务）
const expectedCdn = [
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r187/build/three.module.js',
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r187/examples/jsm/',
  'https://cdn.jsdelivr.net/gh/tweenjs/tween.js@v25.0.0/dist/tween.umd.js',
];
for (const url of expectedCdn) {
  if (html.includes(url)) ok(`CDN 正常: ${url}`);
  else fail(`缺少 GitHub CDN 地址: ${url}`);
}
if (html.includes('cdn.jsdelivr.net/npm/three') || html.includes('cdn.jsdelivr.net/npm/@tweenjs')) {
  fail('仍在使用 npm CDN 路径，应改为 jsDelivr 的 GitHub (/gh/) 路径');
}
if (html.includes('raw.githubusercontent.com')) {
  fail('raw.githubusercontent.com 返回 text/plain，模块脚本会被浏览器 MIME 检查拦截');
}

// 5. 16 个部件
const partsBlock = moduleCode.match(/const PARTS = \[([\s\S]*?)\n\];/);
if (!partsBlock) {
  fail('没有找到 PARTS 数据表');
} else {
  const ids = [...partsBlock[1].matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1]);
  console.log(`部件数: ${ids.length}，${ids.join(', ')}`);
  if (ids.length === 16) ok('16 个部件齐备');
  else fail(`部件数量应为 16，实际 ${ids.length}`);
  for (const required of ['cpu', 'alu', 'cu', 'regfile', 'pc', 'ir', 'mar', 'mdr', 'cache', 'ram', 'rom', 'bus-ctrl', 'bus-addr', 'bus-data', 'io', 'chipset']) {
    if (!ids.includes(required)) fail(`缺少部件: ${required}`);
  }
}

// 6. 关键交互和数据通路
const requiredUi = [
  'partList', 'progNum', 'listDone', 'progBar', 'btn-explode', 'q-explode',
  'q-reset-parts', 'btn-reset', 'btn-rotate', 'btn-flow', 'btn-iso',
  'selCn', 'selDesc', 'fpsVal', 'partLabel', 'boot', 'err',
];
for (const id of requiredUi) {
  if (!html.includes(`id="${id}"`)) fail(`缺少 UI 元素 #${id}`);
}
ok(`关键 UI 元素检查完成 (${requiredUi.length} 个)`);

const flowOrder = moduleCode.match(/const FLOW_PATH = \[([^\]]+)\]/);
if (flowOrder && /'pc'\s*,\s*'mar'\s*,\s*'ram'\s*,\s*'mdr'\s*,\s*'ir'\s*,\s*'cu'\s*,\s*'alu'/.test(flowOrder[1])) {
  ok('数据通路顺序正确: PC → MAR → RAM → MDR → IR → CU → ALU');
} else {
  fail('数据通路顺序不是 PC → MAR → RAM → MDR → IR → CU → ALU');
}

for (const token of ['OrbitControls', 'Raycaster', 'TWEEN', 'TubeGeometry', 'InstancedMesh', 'CanvasTexture']) {
  if (moduleCode.includes(token)) ok(`使用 ${token}`);
  else fail(`缺少关键实现: ${token}`);
}

// 7. 颜色编码
if (moduleCode.includes("makeBus('bus-ctrl'") && moduleCode.includes('0xff5d5d')) ok('控制总线为红色');
else fail('控制总线颜色编码不正确');
if (moduleCode.includes("makeBus('bus-addr'") && moduleCode.includes('0xffc247')) ok('地址总线为黄色');
else fail('地址总线颜色编码不正确');
if (moduleCode.includes("makeBus('bus-data'") && moduleCode.includes('0x4dff8c')) ok('数据总线为绿色');
else fail('数据总线颜色编码不正确');

// 8. 启动兜底
if (html.includes('__BOOT_TIMER__') && html.includes('__APP_READY__')) ok('包含 CDN 加载失败兜底');
else fail('缺少启动失败兜底逻辑');

if (process.exitCode) {
  console.log('\n验收未通过，请修复上面的 ✗ 项。');
} else {
  console.log('\n全部静态验收通过。可直接双击 HTML（需联网加载 GitHub CDN）运行。');
}
