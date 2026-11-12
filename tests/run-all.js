/* Word Quest · 一键测试运行器
   用法：node tests/run-all.js [unit|e2e|all]   （默认 all）
   行为：先把工作目录切到仓库根（子进程与静态服务器都以仓库根为基准），
   依次运行 unit（node 直跑，秒级）与 e2e（playwright headless，约 5-8 分钟），
   汇总输出「PASS x / FAIL y / SKIP z」；任何 FAIL 或子进程异常退出 → 进程退出码非零。
   e2e 缺 playwright/浏览器时整组 SKIP（退出码不计失败，原因见 tests/README.md）。 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');

/* 先切到仓库根（tests/ 的上一级），后续子进程继承该 cwd */
process.chdir(path.join(__dirname, '..'));

const which = (process.argv[2] || 'all').toLowerCase();
const only = ['unit', 'e2e', 'all'];
if (only.indexOf(which) < 0) {
  console.error('用法: node tests/run-all.js [unit|e2e|all]');
  process.exit(2);
}

const steps = [];
if (which === 'unit' || which === 'all') steps.push({ name: 'unit', cmd: 'node', args: ['tests/unit.test.js'] });
if (which === 'e2e' || which === 'all') steps.push({ name: 'e2e', cmd: 'node', args: ['tests/e2e.test.js'] });

function runStep(step) {
  return new Promise(resolve => {
    console.log('\n>>>>>> 运行 ' + step.name + '（node ' + step.args.join(' ') + '）');
    const t0 = Date.now();
    const child = spawn(step.cmd, step.args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', code => {
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      console.log('<<<<<< ' + step.name + ' 结束（exit=' + code + '，用时 ' + secs + 's）');
      resolve(code === 0);
    });
    child.on('error', err => {
      console.error('<<<<<< ' + step.name + ' 启动失败: ' + err.message);
      resolve(false);
    });
  });
}

(async () => {
  const results = {};
  for (const step of steps) {
    results[step.name] = await runStep(step);
  }
  /* 从各测试文件自己打印的汇总行提取计数（格式见 unit.test.js / e2e.test.js 末尾） */
  console.log('\n==================== 总汇总 ====================');
  let anyFail = false;
  for (const step of steps) {
    const okRun = results[step.name];
    console.log(step.name + ': ' + (okRun ? 'PASS（退出码 0）' : 'FAIL（退出码非 0）'));
    if (!okRun) anyFail = true;
  }
  console.log('总判定: ' + (anyFail ? 'FAIL' : 'PASS') + ' —— PASS x / FAIL y 计数见上方各套件汇总行；任何失败退出码非零');
  process.exitCode = anyFail ? 1 : 0;
})();
