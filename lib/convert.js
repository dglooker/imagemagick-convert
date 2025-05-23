const { spawn } = require('child_process')
const Fork = require('stream-fork')
const rootCmd = process.platform === 'win32' ? 'magick' : 'convert'

const RESIZE_DEFAULT = 'crop'
const optionsDefaults = {
  path: rootCmd,
  srcData: null,
  srcFormat: null,
  width: null,
  height: null,
  resize: RESIZE_DEFAULT,
  density: 600,
  background: 'none',
  gravity: 'Center',
  format: null,
  quality: 75,
  blur: null,
  rotate: null,
  flip: false,
  alpha: null,
  clip: null,
  alpha2: null,
  strip: true
}
const attributesMap = new Set([
  'density',
  'background',
  'gravity',
  'quality',
  'blur',
  'rotate',
  'flip',
  'alpha',
  'clip',
  'alpha2',
  'strip',
])

class Converter {
  /**
     * Converter instance
     * @param {Object} options
     */
  constructor (options = {}) {
    this.options = new Map(Object.entries({
      ...optionsDefaults,
      ...options
    }))
  }

  /**
     * Proceed converting
     * @returns {Promise<Buffer>}
     */
  proceed () {
    return new Promise((resolve, reject) => {
      const source = this.options.get('srcData')

      if (source && (source instanceof Buffer)) {
        try {
          const origin = this.getHandle(this.options.get('srcFormat'))
          const result = this.getHandle(this.options.get('format'))
          const args = this.getArgs(origin, result)
          const cp = spawn(this.options.get('path'), args)
          const store = []

          cp.on('error', (data) => reject(data.toString()))
          cp.stdout.on('error', (data) => reject(data.toString()))
          cp.stderr.on('error', (data) => reject(data.toString()))

          cp.stdout.on('data', (data) => store.push(Buffer.from(data)))
          cp.stdout.on('end', () => resolve(Buffer.concat(store)))

          cp.stderr.on('data', (data) => reject(data.toString()))
          cp.stdin.end(source)

          process.on('exit', () => cp.kill())
        } catch (e) {
          reject(e)
        }
      } else reject(new Error('imagemagick-convert: the field `srcData` is required and should have `Buffer` type'))
    })
  }

  /**
   * NOT USED - probably a bad idea - ? how does back pressure with multiple readers work
     * @param {WriteStream|WriteStream[]} streams
     */
  async pipe (streams) {
    const streamList = Array.isArray(streams) ? streams : [streams]
    const source = this.options.get('srcData')
    if (!(source && (source instanceof Buffer))) {
      throw new Error('imagemagick-convert: the field `srcData` is required and should have `Buffer` type')
    }

    return new Promise((resolve, reject) => {
      try {
        const origin = this.getHandle(this.options.get('srcFormat'))
        const result = this.getHandle(this.options.get('format'))
        const args = this.getArgs(origin, result)
        const cp = spawn(this.options.get('path'), args)

        cp.on('error', (data) => reject(data.toString()))
        cp.stdout.on('error', (data) => reject(data.toString()))
        cp.stderr.on('error', (data) => reject(data.toString()))

        const fork = new Fork(streamList) // Fork is extension Writeable
        cp.stdout.pipe(fork)

        // cp.stdout.on('data', (data) => store.push(Buffer.from(data)));
        // cp.stdout.on('end', () => resolve(Buffer.concat(store)));

        cp.stderr.on('data', (data) => reject(data.toString()))
        process.on('exit', () => cp.kill())
        fork.on('finish', () => {
          resolve()
        })
        fork.on('error', (error) => {
          reject(error)
        })

        cp.stdin.end(source)
      } catch (e) {
        reject(e)
      }
    })
  }

  /**
     *  getHandle
     * @param {string|null} format
     * @param {string|null} name
     * @returns {string}
     */
  getHandle (format = null, name = null) {
    const occurrence = []

    if (format) occurrence.push(format)
    occurrence.push(name || '-')

    return occurrence.join(':')
  }

  /**
     * Compose command line args
     * @param {string} origin
     * @param {string} result
     * @returns {string[]}
     */
  getArgs (origin, result) {
    const args = []
    const resize = this.resizeFactory()

    args.push(origin)

    // add attributes
    for (const attribute of attributesMap) {
      const value = this.options.get(attribute)

      if (value || value === 0) {
        args.push(`-${attribute.replace(/\d*$/, '')}`)
        if (typeof value !== 'boolean') {
          args.push(`${value}`)
        }
      }
    }

    // add resizing preset
    if (resize) args.push(resize)

    // add in and out
    // cmd.push(origin);
    args.push(result)

    return args
  }

  /**
     * Resize factory
     * @returns {string}
     */
  resizeFactory () {
    const resize = this.options.get('resize')
    const geometry = this.geometryFactory()

    const resizeMap = new Map([
      ['fit', `-resize ${geometry}`],
      ['fill', `-resize ${geometry}!`],
      ['crop', `-resize ${geometry}^ -crop ${geometry}+0+0!`]
    ])

    if (!resize || !geometry) return ''

    return resizeMap.get(resize) || resizeMap.get(RESIZE_DEFAULT)
  }

  /**
     * Geometry factory
     * @returns {string}
     */
  geometryFactory () {
    const size = []
    const w = this.options.get('width')
    const h = this.options.get('height')

    size.push(w || w === 0 ? w : '')
    if (h || h === 0) size.push(h)

    return size.join('x')
  }
}

/**
 * Convert function
 * @param {Object} options
 * @returns {Promise<Buffer>}
 */
const convert = async (options) => {
  const converter = new Converter(options)

  return converter.proceed()
}

module.exports = {
  Converter,
  convert
}
