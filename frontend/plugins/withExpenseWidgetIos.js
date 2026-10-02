const { withXcodeProject, createRunOncePlugin } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const targetName = 'ExpenseShortcutWidgetExtension';

function withExpenseWidgetIos(config) {
  const bundleId = config.ios?.bundleIdentifier;
  if (!bundleId || !/^[A-Za-z0-9.-]+$/.test(bundleId)) {
    throw new Error('Expense widget requires a valid ios.bundleIdentifier');
  }
  const groupId = `group.${bundleId}`;
  const extensionBundleId = `${bundleId}.${targetName}`;
  const existingEntitlements = config.ios?.entitlements || {};
  config.ios = {
    ...config.ios,
    entitlements: {
      ...existingEntitlements,
      'com.apple.security.application-groups': [...new Set([...(existingEntitlements['com.apple.security.application-groups'] || []), groupId])],
    },
  };

  const eas = config.extra?.eas || {};
  const build = eas.build || {};
  const experimental = build.experimental || {};
  const ios = experimental.ios || {};
  const appExtensions = (ios.appExtensions || []).filter((extension) => extension.targetName !== targetName);
  appExtensions.push({
    targetName,
    bundleIdentifier: extensionBundleId,
    entitlements: {
      'com.apple.security.application-groups': [groupId],
    },
  });
  config.extra = {
    ...config.extra,
    eas: { ...eas, build: { ...build, experimental: { ...experimental, ios: { ...ios, appExtensions } } } },
  };

  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const iosRoot = config.modRequest.platformProjectRoot;
    const extensionDir = path.join(iosRoot, targetName);
    fs.mkdirSync(extensionDir, { recursive: true });
    for (const file of ['ExpenseShortcutWidget.swift', `${targetName}-Info.plist`]) {
      fs.copyFileSync(require.resolve(`./expense-widget-ios/${file}`), path.join(extensionDir, file));
    }
    const entitlements = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>com.apple.security.application-groups</key><array><string>${groupId}</string></array>\n</dict></plist>\n`;
    fs.writeFileSync(path.join(extensionDir, `${targetName}.entitlements`), entitlements);

    if (!project.findTargetKey(targetName)) {
      const target = project.addTarget(targetName, 'app_extension', targetName, extensionBundleId);
      project.addBuildPhase([
        `${targetName}/ExpenseShortcutWidget.swift`,
        '../modules/expense-widget/ios/ExpenseWidgetStore.swift',
      ], 'PBXSourcesBuildPhase', 'Sources', target.uuid);

      const configurationList = project.pbxXCConfigurationList()[target.pbxNativeTarget.buildConfigurationList];
      for (const ref of configurationList.buildConfigurations) {
        const settings = project.pbxXCBuildConfigurationSection()[ref.value].buildSettings;
        settings.APPLICATION_EXTENSION_API_ONLY = 'YES';
        settings.CODE_SIGN_ENTITLEMENTS = `"${targetName}/${targetName}.entitlements"`;
        settings.CURRENT_PROJECT_VERSION = `"${config.ios?.buildNumber || '1'}"`;
        settings.GENERATE_INFOPLIST_FILE = 'NO';
        settings.INFOPLIST_FILE = `"${targetName}/${targetName}-Info.plist"`;
        settings.IPHONEOS_DEPLOYMENT_TARGET = '17.0';
        settings.MARKETING_VERSION = `"${config.version || '1.0.0'}"`;
        settings.PRODUCT_BUNDLE_IDENTIFIER = `"${extensionBundleId}"`;
        settings.SDKROOT = 'iphoneos';
        settings.SWIFT_VERSION = '5.0';
        settings.TARGETED_DEVICE_FAMILY = '"1,2"';
      }
    }
    return config;
  });
}

module.exports = createRunOncePlugin(withExpenseWidgetIos, 'with-expense-widget-ios', '1.0.0');
