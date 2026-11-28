'use strict';
const WEBSITE_OPEN_DOMAIN='applinks:lampy.5sparks.ai';
const LEGACY_WEBSITE_OPEN_DOMAIN='applinks:open.yunpura.com';
function configureWebsiteOpen(config) {
 return {...config,ios:{...config.ios,associatedDomains:[...new Set([...(config.ios?.associatedDomains??[]),WEBSITE_OPEN_DOMAIN,LEGACY_WEBSITE_OPEN_DOMAIN])]}};
}
module.exports={configureWebsiteOpen,WEBSITE_OPEN_DOMAIN};
