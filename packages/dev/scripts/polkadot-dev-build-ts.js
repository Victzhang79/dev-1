#!/usr/bin/env node
// Copyright 2017-2020 @polkadot/dev authors & contributors
// This software may be modified and distributed under the terms
// of the Apache-2.0 license. See the LICENSE file for details.

const copySync = require('./copySync');
const execSync = require('./execSync');
const fs = require('fs');
const path = require('path');

const CPX = ['css', 'gif', 'hbs', 'jpg', 'js', 'png', 'svg', 'd.ts', 'json']
  .map((ext) => `src/**/*.${ext}`)
  .concat('package.json');

console.log('$ redspot-dev-build-ts', process.argv.slice(2).join(' '));

function copyFiles (dir) {
  [...CPX]
    .forEach((src) => copySync(src, `../../build/${dir}/src`));
}

function buildOtherfile (dir) {
  if (!fs.existsSync(path.join(process.cwd(), '.skip-build'))) {
    const { name, version } = require(path.join(process.cwd(), './package.json'));

    console.log(`*** ${name} ${version}`);

    copyFiles(dir);

    console.log();
  }
}

async function main () {
  execSync('yarn redspot-dev-clean-build');


  execSync('tsc --outdir ./build --project tsconfig.json');

  process.chdir('packages');

  const dirs = fs
    .readdirSync('.')
    .filter((dir) => fs.statSync(dir).isDirectory() && fs.existsSync(path.join(process.cwd(), dir, 'src')));

  for (const dir of dirs) {
    process.chdir(dir);

    buildOtherfile(dir);

    process.chdir('..');
  }

  process.chdir('..');
}

main().catch((error) => {
  console.error(error);
  process.exit(-1);
});
