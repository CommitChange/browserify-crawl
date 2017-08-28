const exorcist = require('exorcist')
const zlib = require('zlib')
const R = require('ramda')
const fs = require('fs')
const browserify = require('browserify')
const chalk = require('chalk')
const watchify = require('watchify')
const errorify = require('errorify')
const Uglify = require('uglify-js')
const path = require('path')
const mkdirp = require('mkdirp')
const recursive = require('recursive-readdir-synchronous');

var log = R.identity

const init = (opts, browserifyOpts) => {
  opts = R.merge({
    indexName: 'page.js'
  , input: ''
  , output: ''
  , log: true
  , watch: true
  }, opts)
  if(opts.log) log = console.log.bind(console)
  return walkDir(opts, browserifyOpts)
}

// Recursively walk through a directory, finding all index css files or assets
// Uses a stack, not actual recursion
const walkDir = (opts, browserifyOpts) => {
  var result = {indexFiles: [], directories: []}
  // Tree traversal of directory structure using stack recursion

  var full_input_dir = path.resolve(opts.input)
  var full_output_dir = path.resolve(opts.output)
  var files = recursive(full_input_dir)
  //we have files to create
  result.indexFiles = files.filter(function(value) {
    return path.basename(value) === opts.indexName && fs.statSync(value).isFile()
  })

  result.indexFiles.forEach(function(f){
    var relative_from_input = path.relative(full_input_dir, f)
    var full_output_path = path.join(full_output_dir, relative_from_input)
    createDirsForOutputFile(path.dirname(full_output_path))
    compile(f, full_output_path, opts, browserifyOpts)
  })

  if(!result.indexFiles.length) {
    log(chalk.red('!!  no files in', opts.input, 'with main file ', opts.indexName))
  }
  return result
}

const compile = (fullInputPath, fullOutputPath, opts, browserifyOpts) => {
  browserifyOpts.entries = [fullInputPath]
  browserifyOpts = R.merge({
    cache: {}
  , packageCache: {}
  , plugin: []
  , debug: true
  }, browserifyOpts)
  var plugins = [errorify]
  if(opts.watch) plugins.push(watchify)
  browserifyOpts.plugin = browserifyOpts.plugin.concat(plugins)
  const b = browserify(browserifyOpts)
  bundle(fullInputPath, fullOutputPath, opts, b)
  b.on('update', () => bundle(filepath, opts, b))
}

const bundle = (fullInputPath, fullOutputPath, opts, b) => {
  const bundleStream = fs.createWriteStream(fullOutputPath)
  //const sourceMapUrl = path.combine((opts.sourceMapUrl || opts.output), filepath + '.map')
  const filename = path.basename(fullOutputPath)
  const sourceMapUrl = filename + '.map'
  b.bundle()
    .pipe(exorcist(fullOutputPath + '.map'))
    .pipe(bundleStream)
  bundleStream.on('finish', postCompile(fullOutputPath, sourceMapUrl, opts))
}

// Optionally uglify the compiled output, and generate a source map file
const postCompile = (fullOutputPath, sourceMapUrl, opts) => () => {
  
  if(opts.uglify) {
    log(chalk.blue('<>  uglifying ' + fullOutputPath))
    const mapPath = fullOutputPath + '.map'
    fs.renameSync(fullOutputPath, fullOutputPath + '.bundle')
    var result = Uglify.minify(fullOutputPath + '.bundle', {
      inSourceMap: mapPath
    , outSourceMap: mapPath
    , sourceMapUrl: sourceMapUrl
    })
    fs.writeFileSync(fullOutputPath, result.code, R.identity)
    fs.unlinkSync(fullOutputPath + '.bundle', R.identity)
  }
  if(opts.gzip) {
    
    log(chalk.blue('<>  gzipping ' + fullOutputPath + '.gz'))
   
    fs.writeFileSync(fullOutputPath+ '.gz',zlib.gzipSync( fs.readFileSync(fullOutputPath)))
  }
  log(chalk.green.bold('=>  compiled ' + fullOutputPath))
}

// Create the full directory tree for all filePaths
function createDirsForOutputFile(dir_to_create)
{
    if (fs.existsSync(dir_to_create)){
      log(chalk.gray(dir_to_create + " already exists"))
    }
    else  {
      mkdirp.sync(dir_to_create)
      log(chalk.gray(dir_to_create + " created"))
    }
}

module.exports = init
