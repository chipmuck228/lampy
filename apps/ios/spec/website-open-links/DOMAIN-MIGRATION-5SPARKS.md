# Public website and support migration

Public website: https://lampy.5sparks.ai
Support, privacy inquiries and appeals: support@5sparks.ai

## Rollout

1. Create and verify the support mailbox before directing users to it.
2. Bind lampy.5sparks.ai to the Lampyweb Production deployment. Set NEXT_PUBLIC_SITE_URL=https://lampy.5sparks.ai and rebuild; an existing Vercel variable overrides the source default.
3. Verify /en, /zh-cn, localized privacy/terms/contact/install pages, mailto links, sitemap.xml and robots.txt.
4. The new host must serve /.well-known/apple-app-site-association directly with HTTP 200 and JSON content type, without a domain redirect. Its existing App ID and narrowly scoped install paths remain unchanged.
5. Build and sign a new native App with the added associated domain. Existing installed builds do not automatically acquire the new domain. Test cold/warm launch and App Lock on a physical device.
6. Retain open.yunpura.com and its AASA/install pages for old builds and shared links. The new App recognizes both origins. Do not redirect the old AASA endpoint.
7. Safari may retain same-site install links in the browser. The install page explains the Home Screen fallback; do not treat this behavior as proof that the App is missing.

Family API and invitations remain at lampy-api.5sparks.ai. No database, Apple client ID, signing team, purchase product or ownership change is included. App Store Connect URLs require separate manual updates; committed metadata changes do not update the store automatically.
