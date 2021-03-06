const lodash = require('lodash')
const LinksRunner = __src('runners/links_runner')
const commonHelpers = __src('helpers/common')
const createPriceRangeRunner = require('./price_range_runner')
const createListRunner = require('./list_runner')
const createAdRunner = require('./ad_runner')

const LINKS = require('./constants/links')

module.exports = {
  siteRunner: createSiteRunner,
  adRunner: createAdRunner
}

function createSiteRunner() {
  const runner = new LinksRunner({
    links: getLinks(),
    linkRunner: createLinkRunner
  })

  return runner
}

function createLinkRunner({ link }) {
  const runner = link.single
    ? createListRunner({ link })
    : createPriceRangeRunner({ link })

  return runner
}

function getLinks() {
  const links = []

  lodash.forEach(LINKS.price_range, link => {
    links.push({ category: link })
  })

  lodash.forEach(LINKS.single, link => {
    link = commonHelpers.parseLink(link)

    links.push({ category: link.path, params: link.params, single: true })
  })

  return links
}
