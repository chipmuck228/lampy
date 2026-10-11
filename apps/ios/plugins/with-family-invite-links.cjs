const { withEntitlementsPlist } = require("expo/config-plugins");
module.exports = (config) =>
  withEntitlementsPlist(config, (config) => {
    const open = /^(1|true|yes)$/i.test(
      process.env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN || "",
    );
    let domain;
    try {
      const u = new URL(process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL || "");
      if (
        open &&
        u.protocol === "https:" &&
        u.pathname === "/" &&
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash
      )
        domain = `applinks:${u.hostname}`;
    } catch {}
    if (domain)
      config.modResults["com.apple.developer.associated-domains"] = [
        ...new Set([
          ...(config.modResults["com.apple.developer.associated-domains"] ||
            []),
          domain,
        ]),
      ];
    return config;
  });
