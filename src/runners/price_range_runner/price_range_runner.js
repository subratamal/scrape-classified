const lodash = require('lodash')
const commonHelpers = __src('helpers/common')
const CacheManager = __src('managers/cache')
const LogManager = __src('managers/log')
const ProxyManager = __src('managers/proxy')

const GearedPrice = require('./geared_price')

class PriceRangeRunner {

  constructor(options) {
    this._options = options

    this._link = options.link
    this._linkId = commonHelpers.toId(options.link)
    this._price = new GearedPrice(options.price)

    this._cache = CacheManager.for('config')

    this._logger = LogManager.for('site').sub('runner.price_range', {
      link: this._link,
      price: this._price
    })
  }

  async run() {
    try {
      await this._run()
    } catch (error) {
      this._logger.error(error, 'error -> restart')
      await this.run()
    }
  }

  async _run() {
    const cache = this._cache

    const keyPriceOptions = 'price-options:' + this._linkId
    const keyListInfo = 'list-info:' + this._linkId

    // sync last price options
    const lastPriceOptions = await this._cache.get(keyPriceOptions)

    if (lastPriceOptions) {
      this._price.options(lastPriceOptions)
    } else {
      this._price.next()
    }

    let lastListInfo = null
    let listInfo = await cache.get(keyListInfo)

    const debugPriceRanges = +process.env.DEBUG_PRICE_RANGES
    let debugCountPriceRanges = 0

    do {
      this._logger.info('fetching list info')

      if (!listInfo) {
        listInfo = await this._fetchListInfo()

        // save last list info
        await cache.put(keyListInfo, listInfo)
      }

      this._logger.info(listInfo, 'list info')

      const action = await this._listAction(listInfo, lastListInfo)

      if (action === 'gear_up') {
        this._logger.debug('gear up')

        this._price.gearUp()
      } else if (action === 'gear_down') {
        this._logger.debug('gear down')

        this._price.gearDown()
      } else if (lodash.isPlainObject(action) && (action.inc || action.set || action.keep)) {
        this._logger.debug(action, 'update')

        this._price.update(action)
      } else if (action === 'scrape') {
        await this._runList(listInfo)

        debugCountPriceRanges += 1
        if (debugPriceRanges && debugCountPriceRanges >=debugPriceRanges ) break
      }

      this._price.next()

      // delete last list info
      await cache.del(keyListInfo)
      // save last price options
      await cache.put(keyPriceOptions, this._price.options())

      lastListInfo = listInfo
      listInfo = null
    } while (this._price.hasNext())

    // delete price options cache once done
    await cache.del(keyPriceOptions)
  }

  async _listAction(listInfo, lastListInfo) {
    return await this._options.listAction({
      link: this._link,
      price: this._price,
      listInfo,
      lastListInfo,
      logger: this._logger
    })
  }

  _fetchListInfo() {
    return ProxyManager.pool('list').session({
      run: proxy => this._options.fetchListInfo({
        link: this._link,
        price: this._price,
        proxy,
        logger: this._logger
      }),
      onError: (error) => {
        this._logger.error(error, 'fetch list info error -> retry')
      }
    })
  }

  async _runList(listInfo) {
    const runner = await this._options.listRunner({
      link: this._link,
      price: this._price,
      listInfo,
      logger: this._logger
    })

    await runner.run()
  }

}

module.exports = PriceRangeRunner
