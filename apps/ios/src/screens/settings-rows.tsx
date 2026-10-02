import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { hairline, ink, inkSoft, sage } from './life-page';
import { LifeIcon, type LifeIconName } from './life-icons';
import { Text, type } from './life-text';

const mark = require('../../assets/images/splash-icon.png');

export function SettingsIntro() {
  return (
    <View style={styles.intro} testID="account-settings-intro">
      <Image source={mark} style={styles.introMark} accessible={false} />
      <Text style={styles.introName} accessibilityRole="header">
        Lampy
      </Text>
      <Text style={styles.introLine}>把生活，留给自己。</Text>
    </View>
  );
}

export function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SettingsRowFrame({
  icon,
  title,
  detail,
  detailTestID,
  note,
  noteTestID,
  trailing,
  testID,
}: {
  icon: LifeIconName;
  title: string;
  detail?: string;
  detailTestID?: string;
  note?: string;
  noteTestID?: string;
  trailing: ReactNode;
  testID?: string;
}) {
  return (
    <View testID={testID}>
      <View style={styles.row}>
        <View style={styles.iconBox}>
          <LifeIcon name={icon} size={19} color={sage} decorative />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {detail ? (
            <Text style={styles.detail} testID={detailTestID}>
              {detail}
            </Text>
          ) : null}
        </View>
        {trailing}
      </View>
      {note ? (
        <Text style={styles.note} testID={noteTestID}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

export function SettingsLink({
  icon,
  title,
  detail,
  testID,
  onPress,
}: {
  icon: LifeIconName;
  title: string;
  detail?: string;
  testID: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
      onPress={onPress}
    >
      <SettingsRowFrame
        icon={icon}
        title={title}
        detail={detail}
        trailing={<LifeIcon name="open" size={17} color={inkSoft} decorative />}
      />
    </Pressable>
  );
}

export function SettingsSwitchRow({
  icon,
  title,
  detail,
  note,
  testID,
  detailTestID,
  noteTestID,
  children,
}: {
  icon: LifeIconName;
  title: string;
  detail: string;
  note?: string;
  testID: string;
  detailTestID?: string;
  noteTestID?: string;
  children: ReactNode;
}) {
  return (
    <SettingsRowFrame
      icon={icon}
      title={title}
      detail={detail}
      detailTestID={detailTestID}
      note={note}
      noteTestID={noteTestID}
      trailing={children}
      testID={testID}
    />
  );
}

export function SettingsDetailLead({
  icon,
  title,
  children,
}: {
  icon: LifeIconName;
  title: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.detailBlock}>
      <View style={styles.detailIcon}>
        <LifeIcon name={icon} size={22} color={sage} decorative />
      </View>
      <Text style={styles.detailTitle} accessibilityRole="header">
        {title}
      </Text>
      {children ? <View style={styles.factList}>{children}</View> : null}
    </View>
  );
}

export function SettingsFact({
  children,
  testID,
}: {
  children: ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.fact} testID={testID}>
        {children}
      </Text>
    </View>
  );
}

export function SettingsAboutMark() {
  return (
    <View style={styles.body} testID="account-about-body">
      <Image source={mark} style={styles.bodyMark} accessible={false} />
      <Text style={styles.bodyName} accessibilityRole="header">
        Lampy
      </Text>
      <Text style={styles.bodyLine}>把生活，留给自己。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: {
    alignItems: 'center',
    paddingTop: 43,
    paddingBottom: 39,
  },
  introMark: { width: 28, height: 28 },
  introName: { ...type.title, color: ink, marginTop: 17 },
  introLine: { ...type.meta, color: inkSoft, marginTop: 6, textAlign: 'center' },
  group: { marginBottom: 29 },
  groupTitle: {
    ...type.meta,
    color: inkSoft,
    letterSpacing: 1.6,
    marginBottom: 8,
  },
  row: {
    minHeight: 67,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: hairline,
  },
  iconBox: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0, gap: 5 },
  title: { ...type.action, color: ink },
  detail: { ...type.meta, color: inkSoft },
  note: {
    ...type.meta,
    color: inkSoft,
    marginTop: 8,
    marginBottom: 10,
    marginLeft: 47,
  },
  detailBlock: { paddingTop: 49, paddingBottom: 20 },
  detailIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: hairline,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  detailTitle: { ...type.title, color: ink, marginBottom: 16 },
  factList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: hairline,
  },
  factRow: {
    minHeight: 56,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: hairline,
  },
  fact: { ...type.body, color: inkSoft },
  body: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 5,
  },
  bodyMark: { width: 48, height: 48 },
  bodyName: { ...type.title, color: ink, marginTop: 23 },
  bodyLine: { ...type.body, color: inkSoft, textAlign: 'center', marginTop: 7 },
});
