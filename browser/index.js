const name = 'Bugsnag JavaScript'
const version = '__VERSION__'
const url = 'https://github.com/bugsnag/bugsnag-js'

const Client = require('../base/client')
const { map, reduce } = require('../base/lib/es-utils')

// extend the base config schema with some browser-specific options
const schema = { ...require('../base/config').schema, ...require('./config') }

const plugins = {
  'window onerror': require('./plugins/window-onerror'),
  'unhandled rejection': require('./plugins/unhandled-rejection'),
  'device': require('./plugins/device'),
  'context': require('./plugins/context'),
  'request': require('./plugins/request'),
  'throttle': require('../base/plugins/throttle'),
  'console breadcrumbs': require('./plugins/console-breadcrumbs'),
  'navigation breadcrumbs': require('./plugins/navigation-breadcrumbs'),
  'interaction breadcrumbs': require('./plugins/interaction-breadcrumbs'),
  'inline script content': require('./plugins/inline-script-content')
}

const transports = {
  'XDomainRequest': require('./transports/x-domain-request'),
  'XMLHttpRequest': require('./transports/xml-http-request')
}

module.exports = (opts, userPlugins = []) => {
  // handle very simple use case where user supplies just the api key as a string
  if (typeof opts === 'string') opts = { apiKey: opts }

  // allow plugins to augment the schema with their own options
  const finalSchema = reduce([].concat(plugins).concat(userPlugins), (accum, plugin) => {
    if (!plugin.configSchema) return accum
    return { ...accum, ...plugin.configSchema }
  }, schema)

  const bugsnag = new Client({ name, version, url }, finalSchema)

  // set transport based on browser capability (IE 8+9 have an XDomainRequest object)
  bugsnag.transport(window.XDomainRequest ? transports.XDomainRequest : transports.XMLHttpRequest)

  // set logger based on browser capability
  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    const logger = getPrefixedConsole()
    bugsnag.logger(logger)
  }

  try {
    // configure with user supplied options
    // errors can be thrown here that prevent the lib from being in a useable state
    bugsnag.configure(opts)
  } catch (e) {
    bugsnag._logger.warn(e)
    if (e.errors) map(e.errors, bugsnag._logger.warn)
    // rethrow. if there was an error with configuration
    // the library is not going to work
    throw e
  }

  // browser-specific plugins
  bugsnag.use(plugins['device'])
  bugsnag.use(plugins['context'])
  bugsnag.use(plugins['request'])

  // optional browser-specific plugins
  if (bugsnag.config.autoNotify !== false) {
    bugsnag.use(plugins['window onerror'])
    bugsnag.use(plugins['unhandled rejection'])
    bugsnag.use(plugins['navigation breadcrumbs'])
    bugsnag.use(plugins['interaction breadcrumbs'])
  }

  // set up auto breadcrumbs if explicitely enabled, otherwise setup unless releaseStage is dev(elopment)
  if (bugsnag.config.autoConsoleBreadcumbsEnabled || !/^dev(elopment)?$/.test(bugsnag.config.releaseStage)) {
    bugsnag.use(plugins['console breadcrumbs'])
  }

  bugsnag.use(plugins['inline script content'])
  bugsnag.use(plugins['throttle'])

  return bugsnag
}

const getPrefixedConsole = () => {
  const logger = {}
  map([ 'debug', 'info', 'warn', 'error' ], (method) => {
    logger[method] = typeof console[method] === 'function'
      ? console[method].bind(console, '[bugsnag]')
      : console.log.bind(console, '[bugsnag]')
  })
  return logger
}

module.exports['default'] = module.exports