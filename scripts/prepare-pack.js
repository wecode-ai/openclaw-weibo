import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.dirname(__dirname);
const distDir = path.join(projectRoot, 'dist');

// 读取根目录的 package.json
const rootPackageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
);

// 公共字段（用于最终发布的 package.json）
const commonFields = {
  name: rootPackageJson.name,
  version: rootPackageJson.version,
  type: rootPackageJson.type,
  description: rootPackageJson.description,
  license: rootPackageJson.license,
  files: [
    'src',
    'index.js',
    'index.d.ts',
    'index.js.map',
    'index.d.ts.map',
    'openclaw.plugin.json',
    'skills'
  ],
  dependencies: rootPackageJson.dependencies,
  bundledDependencies: rootPackageJson.bundledDependencies,
  openclaw: rootPackageJson.openclaw
};

// 第一步：生成用于 npm install 的临时 package.json
// 只包含 dependencies，不包含 peerDependencies，避免安装 openclaw 及其所有依赖
const installPackageJson = {
  name: rootPackageJson.name,
  version: rootPackageJson.version,
  type: rootPackageJson.type,
  dependencies: rootPackageJson.dependencies
  // 注意：不包含 peerDependencies，这样 npm install 不会安装 openclaw
};

fs.writeFileSync(
  path.join(distDir, 'package.json'),
  JSON.stringify(installPackageJson, null, 2)
);

// 复制 openclaw.plugin.json 到 dist/
const openclawPluginPath = path.join(projectRoot, 'openclaw.plugin.json');
if (fs.existsSync(openclawPluginPath)) {
  fs.copyFileSync(
    openclawPluginPath,
    path.join(distDir, 'openclaw.plugin.json')
  );
}

// 复制 skills 目录到 dist/
const skillsDir = path.join(projectRoot, 'skills');
const distSkillsDir = path.join(distDir, 'skills');

if (fs.existsSync(skillsDir)) {
  copyDirectory(skillsDir, distSkillsDir);
}

// 复制 README.md 到 dist/
const readmePath = path.join(projectRoot, 'README.md');
if (fs.existsSync(readmePath)) {
  fs.copyFileSync(readmePath, path.join(distDir, 'README.md'));
}

// 在 dist 目录下执行 npm install 以安装 bundledDependencies
console.log('Installing dependencies in dist/ for bundledDependencies...');
execSync('npm install --omit=dev --ignore-scripts', {
  cwd: distDir,
  stdio: 'inherit'
});

// 第二步：npm install 完成后，重写 package.json 移除 dependencies
// 这样用户 npm install 这个包时不会触发额外的依赖下载
// 所有依赖都已经通过 bundledDependencies 打包在 node_modules 中
console.log('Rewriting dist/package.json without dependencies for minimal install...');
const finalPackageJson = { ...commonFields };

fs.writeFileSync(
  path.join(distDir, 'package.json'),
  JSON.stringify(finalPackageJson, null, 2)
);

// 同时删除 dist/package-lock.json，因为不再需要
const distLockPath = path.join(distDir, 'package-lock.json');
if (fs.existsSync(distLockPath)) {
  fs.unlinkSync(distLockPath);
}

console.log('dist/package.json generated successfully (without dependencies)');
console.log('Files copied to dist/: openclaw.plugin.json, skills/, README.md');
console.log('Dependencies bundled in dist/node_modules');
console.log('Users will have zero external dependencies to install!');

function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
