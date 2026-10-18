'use strict';
const WEBSITE_OPEN_DOMAIN='applinks:open.yunpura.com';
function configureWebsiteOpen(config) {
 return {...config,ios:{...config.ios,associatedDomains:[...new Set([...(config.ios?.associatedDomains??[]),WEBSITE_OPEN_DOMAIN])]}};
}
module.exports={configureWebsiteOpen,WEBSITE_OPEN_DOMAIN};
