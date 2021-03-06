require('es6-promise').polyfill();
require('isomorphic-fetch');

const autoprefixer = require('gulp-autoprefixer');
const babelify = require('babelify');
const browserify = require('browserify');
const buffer = require('vinyl-buffer');
// const cache = require('gulp-cache');
const connect = require('gulp-connect');
const del = require('del');
const eslint = require('gulp-eslint');
const gulp = require('gulp');
const gulpif = require('gulp-if');
const gutil = require('gulp-util');
// const imagemin = require('gulp-imagemin');
const minifycss = require('gulp-cssnano');
const multiDest = require('gulp-multi-dest');
const normalize = require('node-normalize-scss');
const pathutil = require('path');
const rename = require('gulp-rename');
const runSequence = require('run-sequence');
const sass = require('gulp-sass');
const sassLint = require('gulp-sass-lint');
const source = require('vinyl-source-stream');
const sourcemaps = require('gulp-sourcemaps');
const through = require('through2');
const uglify = require('gulp-uglify');
const tryRequire = require('try-require');
const Remarkable = require('remarkable');
const md = new Remarkable({
  html: true
});
const YAML = require('yamljs');
const fs = require('fs');
const mkdirp = require('mkdirp');

const IS_DEBUG = (process.env.NODE_ENV === 'development');

const BASE_URL = process.env.BASE_URL || 'http://testpilot.dev:8000';

const SRC_PATH = './src/';

const STATIC_PATH = './dist/static/';
const DEST_PATH = pathutil.join(STATIC_PATH, '..');

const CONTENT_SRC_PATH = 'src/';
const PRODUCTION_EXPERIMENTS_URL = 'https://testpilot.firefox.com/api/experiments';
const IMAGE_NEW_BASE_PATH = 'src/images/experiments/';
const IMAGE_NEW_BASE_URL = '/static/images/experiments/';

const config = tryRequire('./debug-config.json') || {
  'sass-lint': true,
  'js-lint': true
};

const excludeVendorModules = [
  'babel-polyfill',
  'l20n'
];
const includeVendorModules = [
  'babel-polyfill/browser',
  'l20n/dist/compat/web/l20n'
];
const packageJSON = require('./package.json');
const vendorModules = Object.keys(packageJSON.dependencies)
  .filter(name => excludeVendorModules.indexOf(name) < 0)
  .concat(includeVendorModules);

function shouldLint(opt, task) {
  return config[opt] ? [task] : [];
}

function lintTask() {
  return gulp.src(['*.js', SRC_PATH + '{app,test}/**/*.js'])
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failOnError());
}

gulp.task('lint', lintTask);

// Lint the gulpfile
gulp.task('selfie', function selfieTask() {
  return gulp.src('gulpfile.js')
    .pipe(lintTask());
});

gulp.task('clean', function cleanTask() {
  return del([
    DEST_PATH
  ]);
});

const legalTemplates = require('./legal-copy/legal-templates');

function convertToLegalPage() {
  return through.obj(function legalConvert(file, encoding, callback) {
    file.contents = new Buffer(`${legalTemplates.templateBegin}
                                ${md.render(file.contents.toString())}
                                ${legalTemplates.templateEnd}`);
    file.path = gutil.replaceExtension(file.path, '.html');
    this.push(file);
    callback();
  });
}

gulp.task('legal', function legalTask() {
  return gulp.src('./legal-copy/*.md')
             .pipe(convertToLegalPage())
             .pipe(gulp.dest('./legal-copy/'));
});

gulp.task('app-main', function appMainTask() {
  return commonBrowserify('app.js', browserify({
    entries: [SRC_PATH + 'app/main.js'],
    debug: IS_DEBUG,
    fullPaths: IS_DEBUG,
    transform: [babelify]
  }).external(vendorModules));
});

gulp.task('app-vendor', function appVendorTask() {
  return commonBrowserify('vendor.js', browserify({
    debug: IS_DEBUG
  }).require(vendorModules));
});

function commonBrowserify(sourceName, b) {
  return b
    .bundle()
    .pipe(source(sourceName))
    .pipe(buffer())
    .pipe(gulpif(IS_DEBUG, sourcemaps.init({loadMaps: true})))
     // don't uglify in development. eases build chain debugging
    .pipe(gulpif(!IS_DEBUG, uglify()))
    .on('error', gutil.log)
    .pipe(gulpif(IS_DEBUG, sourcemaps.write('./')))
    .pipe(gulp.dest(STATIC_PATH + 'app/'));
}

gulp.task('scripts', shouldLint('js-lint', 'lint'), function extraScriptsTask() {
  return gulp.src(SRC_PATH + 'scripts/**/*')
    .pipe(gulpif(IS_DEBUG, sourcemaps.init({loadMaps: true})))
    .pipe(gulpif(!IS_DEBUG, uglify()))
    .pipe(gulpif(IS_DEBUG, sourcemaps.write('./')))
    .pipe(gulp.dest(STATIC_PATH + 'scripts'));
});

gulp.task('styles', shouldLint('sass-lint', 'sass-lint'), function stylesTask() {
  return gulp.src(SRC_PATH + 'styles/**/*.scss')
    .pipe(sourcemaps.init())
    .pipe(sass({
      includePaths: [
        normalize.includePaths
      ]
    }).on('error', sass.logError))
    .pipe(autoprefixer('last 2 versions'))
      // don't minify in development
      .pipe(gulpif(!IS_DEBUG, minifycss()))
      .pipe(gulpif(IS_DEBUG, sourcemaps.write('.')))
    .pipe(gulp.dest(STATIC_PATH + 'styles'));
});

// the globbing pattern here should be cleaned up
// when node-sass supports inline ignores
// see the note in the _hidpi-mixin for details
gulp.task('sass-lint', function sassLintTask() {
  const files = [
    SRC_PATH + '/styles/**/*.scss',
    '!' + SRC_PATH + '/styles/_hidpi-mixin.scss'
  ];
  return gulp.src(files)
    .pipe(sassLint())
    .pipe(sassLint.format())
    .pipe(sassLint.failOnError());
});

gulp.task('images', function imagesTask() {
  return gulp.src(SRC_PATH + 'images/**/*')
    // imagemin skips files https://github.com/sindresorhus/gulp-imagemin/issues/183
    // files have been optimized and rechecked into the repo
    // .pipe(cache(imagemin({ optimizationLevel: 3, progressive: true, interlaced: true })))
    .pipe(gulp.dest(STATIC_PATH + 'images'));
});

gulp.task('locales', function localesTask() {
  return gulp.src('./locales/**/*')
    .pipe(gulp.dest(STATIC_PATH + 'locales'));
});

gulp.task('addon', function localesTask() {
  return gulp.src(SRC_PATH + 'addon/**/*')
    .pipe(gulp.dest(STATIC_PATH + 'addon'));
});

gulp.task('import-api-content', function importContentTask(done) {
  fetch(PRODUCTION_EXPERIMENTS_URL)
    .then(response => response.json())
    .then(data => Promise.all(data.results.map(processImportedExperiment)))
    .then(() => done())
    .catch(done);
});

function processImportedExperiment(experiment) {
  // Clean up auto-generated and unused model fields.
  const fieldsToDelete = {
    '': ['url', 'html_url', 'installations_url', 'survey_url'],
    details: ['order', 'url', 'experiment_url'],
    tour_steps: ['order', 'experiment_url'],
    contributors: ['username']
  };
  Object.keys(fieldsToDelete).forEach(key => {
    const items = (key === '') ? [experiment] : experiment[key];
    const fields = fieldsToDelete[key];
    items.forEach(item => fields.forEach(field => delete item[field]));
  });

  // Download all the images associated with the experiment.
  const imageFields = {
    '': ['thumbnail'],
    details: ['image'],
    tour_steps: ['image'],
    contributors: ['avatar']
  };
  const toDownload = [];
  Object.keys(imageFields).forEach(key => {
    const items = (key === '') ? [experiment] : experiment[key];
    const fields = imageFields[key];
    items.forEach(item => fields.forEach(field => {
      // Grab the original image URL
      const origURL = item[field];

      // Chop off the protocol & domain, convert gravatar param to .jpg
      const path = origURL.split('/').slice(3).join('/').replace('?s=64', '.jpg');

      // Now build a new file path and URL for the image
      const newPath = `${IMAGE_NEW_BASE_PATH}${experiment.slug}/${path}`;
      const newURL = `${IMAGE_NEW_BASE_URL}${experiment.slug}/${path}`;

      // Replace the old URL with new static URL
      item[field] = newURL;

      // Schedule the old URL for download at the new path.
      toDownload.push({url: origURL, path: newPath});
    }));
  });

  // Download all the images, then write the YAML.
  return Promise.all(toDownload.map(downloadURL))
    .then(() => writeExperimentYAML(experiment));
}

// Write file contents after first ensuring the parent directory exists.
function writeFile(path, content) {
  const parentDir = path.split('/').slice(0, -1).join('/');
  return new Promise((resolve, reject) => {
    mkdirp(parentDir, dirErr => {
      if (dirErr) { return reject(dirErr); }
      fs.writeFile(path, content, err => err ? reject(err) : resolve(path));
    });
  });
}

function downloadURL(item) {
  const {url, path} = item;
  return fetch(url)
    .then(res => res.buffer())
    .then(resBuffer => writeFile(path, resBuffer))
    .then(() => {
      if (IS_DEBUG) { console.log('Downloaded', url, 'to', path); }
    });
}

function writeExperimentYAML(experiment) {
  const out = YAML.stringify(experiment, 4, 2);
  const path = `${CONTENT_SRC_PATH}experiments/${experiment.slug}.yaml`;
  if (IS_DEBUG) { console.log(`Generated ${path}`); }
  return writeFile(path, out);
}

gulp.task('experiments-json', function generateStaticAPITask() {
  return gulp.src(CONTENT_SRC_PATH + 'experiments/*.yaml')
    .pipe(buildExperimentsJSON('experiments'))
    .pipe(gulp.dest(DEST_PATH + '/api'));
});

function buildExperimentsJSON(path) {
  const out = {results: []};

  function collectEntry(file, enc, cb) {
    const yamlData = file.contents.toString();
    const experiment = YAML.parse(yamlData);

    // Auto-generate some derivative API values expected by the frontend.
    Object.assign(experiment, {
      url: `${BASE_URL}/api/experiments/${experiment.id}`,
      html_url: `${BASE_URL}/experiments/${experiment.slug}`,
      installations_url: `${BASE_URL}/api/experiments/${experiment.id}/installations/`,
      survey_url: `https://qsurvey.mozilla.com/s3/${experiment.slug}`,
      thumbnail: `${BASE_URL}${experiment.thumbnail}`
    });

    out.results.push(experiment);
    cb();
  }

  function endStream(cb) {
    const contents =  new Buffer(JSON.stringify(out, null, 2));
    const file = new gutil.File({path, contents});
    this.push(file);
    cb();
  }

  return through.obj(collectEntry, endStream);
}

gulp.task('notifications-json', function() {
  return gulp.src(CONTENT_SRC_PATH + 'notifications/*.yaml')
    .pipe(buildNotificationsJSON('notifications'))
    .pipe(gulp.dest(DEST_PATH + '/api'));
});

function buildNotificationsJSON(path) {
  const out = { results: [] };

  function collectEntry(file, enc, cb) {
    const data = YAML.parse(file.contents.toString());
    out.results.push(data);
    cb();
  }

  function endStream(cb) {
    const contents =  new Buffer(JSON.stringify(out, null, 2));
    this.push(new gutil.File({path, contents}));
    cb();
  }

  return through.obj(collectEntry, endStream);
}

gulp.task('copy-html', function() {
  const paths = fs.readdirSync(CONTENT_SRC_PATH + 'experiments')
    .map(f => `${DEST_PATH}/experiments/${f.replace('.yaml', '')}`)
    .concat([
      DEST_PATH,
      DEST_PATH + '/experiments',
      DEST_PATH + '/onboarding',
      DEST_PATH + '/home',
      DEST_PATH + '/share',
      DEST_PATH + '/legacy',
      DEST_PATH + '/error'
    ]);
  gulp.src(CONTENT_SRC_PATH + 'index.html')
    .pipe(multiDest(paths));
  gulp.src('./legal-copy/privacy-notice.html')
    .pipe(rename('index.html'))
    .pipe(gulp.dest(DEST_PATH + '/privacy'));
  gulp.src('./legal-copy/terms-of-use.html')
    .pipe(rename('index.html'))
    .pipe(gulp.dest(DEST_PATH + '/terms'));
});


gulp.task('build', function buildTask(done) {
  runSequence(
    'clean',
    'scripts',
    'styles',
    'images',
    'locales',
    'addon',
    'legal',
    'experiments-json',
    'notifications-json',
    'copy-html',
    'app-main',
    'app-vendor',
    done
  );
});

gulp.task('watch', ['build'], function watchTask() {
  gulp.watch(SRC_PATH + 'styles/**/*', ['styles']);
  gulp.watch(SRC_PATH + 'images/**/*', ['images']);
  gulp.watch(SRC_PATH + 'app/**/*.js', ['app-main']);
  gulp.watch('./package.json', ['app-vendor']);
  gulp.watch(SRC_PATH + 'scripts/**/*.js', ['scripts']);
  gulp.watch(SRC_PATH + 'addon/**/*', ['addon']);
  gulp.watch(['./legal-copy/*.md', './legal-copy/*.js'], ['legal']);
  gulp.watch('./locales/**/*', ['locales']);
  gulp.watch(CONTENT_SRC_PATH + 'experiments/*.yaml', ['experiments-json']);
  gulp.watch(CONTENT_SRC_PATH + 'notifications/*.yaml', ['notifications-json']);
  gulp.watch('gulpfile.js', () => process.exit());
});

// Set up a webserver for the static assets
gulp.task('connect', function connectTask() {
  connect.server({
    root: DEST_PATH,
    livereload: false,
    port: 8000
  });
});

gulp.task('server', ['build', 'connect', 'watch']);

gulp.task('default', ['build', 'watch']);
