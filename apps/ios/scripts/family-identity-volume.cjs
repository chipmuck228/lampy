'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PROBE_VERSION = 1;
const MARKER_NAME = '.lampy-accept-volume-marker.json';
const BACKUP_DIR_NAME = '.lampy-accept-volume-backup';
const EPHEMERAL_FS = new Set(['tmpfs', 'overlay', 'overlay2', 'aufs', 'ramfs']);

function verdict(status, detail) {
  return { status, detail };
}

function underVolume(dbReal, volumeReal) {
  const root = volumeReal.endsWith(path.sep) ? volumeReal : `${volumeReal}${path.sep}`;
  return dbReal === volumeReal || dbReal.startsWith(root);
}

function detectFsType(target) {
  const mountinfo = '/proc/self/mountinfo';
  if (fs.existsSync(mountinfo)) {
    const real = fs.realpathSync(target);
    let best = { len: -1, type: 'unknown' };
    for (const line of fs.readFileSync(mountinfo, 'utf8').split('\n')) {
      const split = line.split(' - ');
      if (split.length < 2) continue;
      const mountpoint = split[0].split(' ')[4]?.replace(/\\040/g, ' ');
      const fstype = split[1].split(' ')[0];
      if (!mountpoint || !fstype) continue;
      const prefix = mountpoint === '/' ? '/' : `${mountpoint}/`;
      if ((real === mountpoint || real.startsWith(prefix)) && mountpoint.length >= best.len) {
        best = { len: mountpoint.length, type: fstype };
      }
    }
    return best.type;
  }
  try {
    return execFileSync('stat', ['-f', '%Sd', target], { encoding: 'utf8' }).trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

function sqliteMigrationCount(databasePath) {
  const db = new DatabaseSync(databasePath);
  try {
    const row = db.prepare('SELECT COUNT(*) AS n FROM family_schema_migrations').get();
    return Number(row?.n || 0);
  } finally {
    db.close();
  }
}

function copySqliteFiles(fromPath, toDir) {
  fs.mkdirSync(toDir, { recursive: true });
  const base = path.basename(fromPath);
  for (const suffix of ['', '-wal', '-shm']) {
    const source = `${fromPath}${suffix}`;
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(toDir, `${base}${suffix}`));
  }
}

function inspectHostedVolume(options) {
  const databasePath = path.resolve(options.databasePath);
  const volumeRoot = path.resolve(options.volumeRoot);
  if (!fs.existsSync(databasePath)) {
    return {
      version: PROBE_VERSION,
      generatedAt: new Date().toISOString(),
      afterRestart: Boolean(options.afterRestart),
      path: verdict('FAIL', 'hosted database file is missing'),
      migrations: verdict('FAIL', 'cannot read migrations'),
      backupRestore: verdict('FAIL', 'cannot copy a missing database'),
      restartRead: verdict('NOT VERIFIED', 'database missing'),
    };
  }
  if (!fs.existsSync(volumeRoot)) {
    return {
      version: PROBE_VERSION,
      generatedAt: new Date().toISOString(),
      afterRestart: Boolean(options.afterRestart),
      path: verdict('FAIL', 'hosted volume root is missing'),
      migrations: verdict('NOT VERIFIED', 'volume root missing'),
      backupRestore: verdict('NOT VERIFIED', 'volume root missing'),
      restartRead: verdict('NOT VERIFIED', 'volume root missing'),
    };
  }

  const dbReal = fs.realpathSync(databasePath);
  const volumeReal = fs.realpathSync(volumeRoot);
  const dbStat = fs.statSync(databasePath);
  const volumeStat = fs.statSync(volumeRoot);
  const fsType = detectFsType(volumeRoot);
  const ephemeral = EPHEMERAL_FS.has(fsType);
  const onVolume = underVolume(dbReal, volumeReal) && dbStat.dev === volumeStat.dev;
  const pathCheck = !onVolume
    ? verdict('FAIL', 'database realpath is not on the hosted volume device')
    : ephemeral
      ? verdict('FAIL', `filesystem ${fsType} is not a persistent volume`)
      : verdict('PASS', `under-volume same-device fs=${fsType}`);

  let migrations;
  try {
    const count = sqliteMigrationCount(databasePath);
    migrations = count > 0
      ? verdict('PASS', `migrations=${count}`)
      : verdict('FAIL', 'family_schema_migrations is empty');
    migrations.count = count;
  } catch (error) {
    migrations = verdict('FAIL', error instanceof Error ? error.message : 'sqlite-read-failed');
    migrations.count = 0;
  }

  let backupRestore;
  try {
    const backupDir = path.join(volumeRoot, BACKUP_DIR_NAME);
    copySqliteFiles(databasePath, backupDir);
    const copyPath = path.join(backupDir, path.basename(databasePath));
    const copyCount = sqliteMigrationCount(copyPath);
    backupRestore = copyCount === migrations.count && copyCount > 0
      ? verdict('PASS', 'stopped-copy on the same volume opened with the same migration count')
      : verdict('FAIL', 'backup copy migrations do not match the live file');
    backupRestore.copyMigrationCount = copyCount;
  } catch (error) {
    backupRestore = verdict('FAIL', error instanceof Error ? error.message : 'backup-failed');
  }

  const markerPath = path.join(volumeRoot, MARKER_NAME);
  const marker = {
    version: PROBE_VERSION,
    generatedAt: new Date().toISOString(),
    probeId: `${process.pid}-${Math.random().toString(36).slice(2, 10)}`,
    dbRealpath: dbReal,
    volumeRealpath: volumeReal,
    migrationCount: migrations.count || 0,
    hostname: os.hostname(),
  };

  let restartRead;
  if (options.afterRestart) {
    if (!fs.existsSync(markerPath)) {
      restartRead = verdict('FAIL', 'after-restart probe found no marker from the earlier hosted-volume run');
    } else {
      const previous = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      const same =
        previous.dbRealpath === dbReal &&
        previous.volumeRealpath === volumeReal &&
        previous.migrationCount === migrations.count;
      restartRead = same
        ? verdict('PASS', 'marker and migrations survived a service restart')
        : verdict('FAIL', 'hosted volume marker does not match the live database after restart');
    }
  } else {
    restartRead = verdict(
      'NOT VERIFIED',
      'write this probe, restart the single family-api process, then re-run with LAMPY_FAMILY_ACCEPT_VOLUME_AFTER_RESTART=1',
    );
  }
  fs.writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`);

  return {
    version: PROBE_VERSION,
    generatedAt: marker.generatedAt,
    afterRestart: Boolean(options.afterRestart),
    path: pathCheck,
    migrations,
    backupRestore,
    restartRead,
    location: {
      dbUnderVolume: onVolume,
      fsType,
      ephemeral,
    },
  };
}

function validateHostedVolumeProbe(report) {
  if (report == null) {
    return verdict('NOT VERIFIED', 'no hosted volume probe report');
  }
  if (typeof report !== 'object' || report.version !== PROBE_VERSION) {
    return verdict('FAIL', 'hosted volume probe report is not a v1 probe');
  }
  const required = ['path', 'migrations', 'backupRestore', 'restartRead'];
  for (const key of required) {
    if (!report[key] || typeof report[key].status !== 'string') {
      return verdict('FAIL', `hosted volume probe missing ${key}`);
    }
  }
  if (required.some((key) => report[key].status === 'FAIL')) {
    const failed = required.filter((key) => report[key].status === 'FAIL').join(',');
    return verdict('FAIL', `hosted volume probe failed: ${failed}`);
  }
  if (required.some((key) => report[key].status !== 'PASS')) {
    return verdict(
      'NOT VERIFIED',
      report.restartRead.detail || 'hosted volume probe is incomplete (restart-read not observed)',
    );
  }
  return verdict('PASS', 'hosted volume path, migrations, backup copy, and post-restart read all checked');
}

function loadVolumeProbeFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

module.exports = {
  BACKUP_DIR_NAME,
  MARKER_NAME,
  PROBE_VERSION,
  detectFsType,
  inspectHostedVolume,
  loadVolumeProbeFile,
  underVolume,
  validateHostedVolumeProbe,
};
