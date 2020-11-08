const fs = require("fs");
const path = require("path");
const os = require("os");
const rimraf = require('rimraf');
const argv = require('yargs')
  .options({
    'skip-beta': {
      description: 'Do not increment as beta',
      type: 'boolean'
    }
  })
  .strict()
  .argv;

const repo = `https://${process.env.GH_PAT}@github.com/${process.env.GITHUB_REPOSITORY}.git`;

console.log('$ redspot-ci-publish', process.argv.slice(2).join(' '));

function runClean () {
  execSync('yarn redspot-dev-clean-build');
}

function runCheck () {
  execSync('yarn lint');
}

function runBuild () {
  execSync('yarn build');
}

function npmGetVersion() {
  return JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")
  ).version;
}

function gitSetup () {
  execSync('git config push.default simple');
  execSync('git config merge.ours.driver true');
  execSync('git config user.name "Github Actions"');
  execSync('git config user.email "action@github.com"');
  execSync('git checkout master');
}

function gitBump () {
  const currentVersion = npmGetVersion();
  const [version, tag] = currentVersion.split('-');
  const [,, patch] = version.split('.');

  if (tag) {
    // if we have a beta version, just continue the stream of betas
    execSync('yarn redspot-dev-version --type pre');
  } else if (argv['skip-beta']) {
    // don't allow beta versions
    execSync('yarn redspot-dev-version --type patch');
  } else if (patch === '0') {
    // patch is .0, so publish this as an actual release (surely we did our job on beta)
    execSync('yarn redspot-dev-version --type patch');
  } else if (patch === '1') {
    // continue with first new minor as beta
    execSync('yarn redspot-dev-version --type pre');
  } else {
    // manual setting of version, make some changes so we can commit
    fs.appendFileSync(path.join(process.cwd(), '.123trigger'), currentVersion);
  }

  execSync('git add --all .');
}

function gitPush () {
  const version = npmGetVersion();
  let doGHRelease = false;

  if (process.env.GH_RELEASE_GITHUB_API_TOKEN) {
    const changes = fs.readFileSync('CHANGELOG.md', 'utf8');

    if (changes.includes(`## ${version}`)) {
      doGHRelease = true;
    } else if (version.endsWith('.1')) {
      throw new Error(`Unable to release, no CHANGELOG entry for ${version}`);
    }
  }

  execSync('git add --all .');

  if (fs.existsSync('docs/README.md')) {
    execSync('git add --all -f docs');
  }

  // add the skip checks for GitHub ...
  execSync(`git commit --no-status --quiet -m "[CI Skip] release/${version.includes('-') ? 'beta' : 'stable'} ${version}
skip-checks: true"`);

  execSync(`git push ${repo} HEAD:${process.env.GITHUB_REF}`, true);

  if (doGHRelease) {
    const files = process.env.GH_RELEASE_FILES
      ? `--assets ${process.env.GH_RELEASE_FILES}`
      : '';

    execSync(`yarn redspot-exec-ghrelease --draft ${files} --yes`);
  }
}

function npmSetup() {
  const registry = "registry.npmjs.org";

  fs.writeFileSync(
    path.join(os.homedir(), ".npmrc"),
    `//${registry}/:_authToken=${process.env.NPM_TOKEN}`
  );
}

function npmPublish() {
  if (fs.existsSync(".skip-npm")) {
    return;
  }

  rimraf.sync("build/package.json");
  ["LICENSE", "README.md", "package.json"].forEach((file) =>
    copySync(file, "build")
  );

  process.chdir("build");

  const tag = npmGetVersion().includes("-") ? "--tag beta" : "";
  let count = 1;

  while (true) {
    try {
      execSync(`npm publish --access public ${tag}`);

      break;
    } catch (error) {
      if (count < 5) {
        const end = Date.now() + 15000;

        console.error(`Publish failed on attempt ${count}/5. Retrying in 15s`);
        count++;

        while (Date.now() < end) {
          // just spin our wheels
        }
      }
    }
  }

  process.chdir("..");
}

function loopFunc (fn) {
  if (fs.existsSync('packages')) {
    fs
      .readdirSync('packages')
      .filter((dir) => {
        const pkgDir = path.join(process.cwd(), 'packages', dir);

        return fs.statSync(pkgDir).isDirectory() &&
          fs.existsSync(path.join(pkgDir, 'package.json')) &&
          fs.existsSync(path.join(pkgDir, 'build'));
      })
      .forEach((dir) => {
        process.chdir(path.join('packages', dir));
        fn();
        process.chdir('../..');
      });
  } else {
    fn();
  }
}

gitSetup()
gitBump()
npmSetup()

runClean()
runCheck()
runBuild()

gitPush()
loopFunc(npmPublish);