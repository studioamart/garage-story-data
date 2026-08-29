#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedPayloadURL =
  'https://studioamart.github.io/garage-story-data/data/all-vehicles.json';
const taskIDPattern = /^[a-z][a-z0-9-]*:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

// Every published version/digest pair is immutable. Adding a release requires
// appending here and in releases/vehicle-release-history.json in the same
// reviewed change; mutation or removal of an existing pair fails verification.
export const frozenReleaseHistory = Object.freeze([
  Object.freeze({
    version: 6,
    schema: 2,
    vehicleCount: 1424,
    sha256: '084499712f702247ae4dd06ea5237adddeb37dcf4b77b174c238135bc107a700',
    contract: 'releases/contracts/v6.json',
    contractSha256: '9844cbc2c92ac7cdd62c2dad59842a5e9566719f26fff0e8b548ebf35afcfcc6',
  }),
  Object.freeze({
    version: 7,
    schema: 3,
    vehicleCount: 1424,
    sha256: 'f9596f89a68156aa108ba8e8cbae96c551538969985a9d9b9de75c403047db82',
    previousSha256: '084499712f702247ae4dd06ea5237adddeb37dcf4b77b174c238135bc107a700',
    contract: 'releases/contracts/v7.json',
    contractSha256: 'a39a7e2df7865f4218446a6ed6dad3dc5e6f403292432fe645c5710cb2a3e139',
    transition: 'releases/transitions/v6-to-v7.json',
    transitionSha256: '23ab294befdb402859536e59fca2807f8a568ceddd8be518ab3b6e23b13e7276',
  }),
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableTaskIDForLabel(value) {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-') || 'task';
  return `service:${slug}`;
}

function vehicleKey(vehicle) {
  return JSON.stringify([
    vehicle.make,
    vehicle.model,
    vehicle.years,
    vehicle.generation ?? null,
    vehicle.vehicleType,
  ]);
}

function provenanceFor(vehicle, location) {
  if (!Object.prototype.hasOwnProperty.call(vehicle, 'scheduleSource')) return 'curated';
  assert(vehicle.scheduleSource === 'generic', `${location}.scheduleSource must be exact generic`);
  return 'generic';
}

export function buildReleaseContract(payload, {
  releaseVersion,
  legacyGeneratedTaskIDs = false,
} = {}) {
  assert(payload && typeof payload === 'object' && !Array.isArray(payload), 'payload must be an object');
  assert(Number.isSafeInteger(payload.schema) && payload.schema > 0, 'payload schema is invalid');
  assert(Number.isSafeInteger(releaseVersion) && releaseVersion > 0, 'releaseVersion is invalid');
  assert(Array.isArray(payload.vehicles) && payload.vehicles.length > 0,
    'payload vehicles must be a non-empty array');

  let scheduleRowCount = 0;
  const vehicleKeys = new Set();
  const vehicles = payload.vehicles.map((vehicle, vehicleIndex) => {
    const location = `vehicles[${vehicleIndex}]`;
    const key = vehicleKey(vehicle);
    assert(!vehicleKeys.has(key), `${location} duplicates vehicle identity ${key}`);
    vehicleKeys.add(key);
    assert(Array.isArray(vehicle.schedule) && vehicle.schedule.length > 0,
      `${location}.schedule must be a non-empty array`);

    const taskIDs = new Set();
    const tasks = [];
    vehicle.schedule.forEach((task, taskIndex) => {
      const taskLocation = `${location}.schedule[${taskIndex}]`;
      assert(typeof task.service === 'string' && task.service.trim(),
        `${taskLocation}.service is missing`);
      assert(typeof task.category === 'string' && task.category.trim(),
        `${taskLocation}.category is missing`);
      const taskID = legacyGeneratedTaskIDs
        ? stableTaskIDForLabel(task.service)
        : task.taskId;
      assert(typeof taskID === 'string' && taskIDPattern.test(taskID),
        `${taskLocation}.taskId is missing or invalid`);
      assert(!taskIDs.has(taskID), `${taskLocation}.taskId duplicates ${taskID}`);
      taskIDs.add(taskID);
      tasks.push({ taskId: taskID, service: task.service, category: task.category });
      scheduleRowCount += 1;
    });

    return {
      key,
      provenance: provenanceFor(vehicle, location),
      tasks: tasks.sort((a, b) => compareText(a.taskId, b.taskId)),
    };
  }).sort((a, b) => compareText(a.key, b.key));

  return {
    schema: 1,
    releaseVersion,
    taskIdMode: legacyGeneratedTaskIDs ? 'generated-from-service-label' : 'published',
    vehicleCount: vehicles.length,
    scheduleRowCount,
    vehicles,
  };
}

function verifyContract(contract, release) {
  assert(contract?.schema === 1, `release v${release.version} contract schema must be 1`);
  assert(contract.releaseVersion === release.version,
    `release v${release.version} contract version mismatch`);
  assert(contract.vehicleCount === release.vehicleCount,
    `release v${release.version} contract declared vehicle count mismatch`);
  assert(['generated-from-service-label', 'published'].includes(contract.taskIdMode),
    `release v${release.version} contract taskIdMode is invalid`);
  assert(Array.isArray(contract.vehicles) && contract.vehicles.length === release.vehicleCount,
    `release v${release.version} contract vehicle count mismatch`);

  let scheduleRows = 0;
  let priorKey = null;
  const keys = new Set();
  contract.vehicles.forEach((vehicle, vehicleIndex) => {
    const location = `release v${release.version} contract vehicles[${vehicleIndex}]`;
    assert(typeof vehicle.key === 'string' && vehicle.key, `${location}.key is invalid`);
    assert(priorKey == null || compareText(priorKey, vehicle.key) < 0,
      `${location}.key order is not canonical`);
    priorKey = vehicle.key;
    assert(!keys.has(vehicle.key), `${location}.key is duplicated`);
    keys.add(vehicle.key);
    assert(vehicle.provenance === 'generic' || vehicle.provenance === 'curated',
      `${location}.provenance is invalid`);
    assert(Array.isArray(vehicle.tasks) && vehicle.tasks.length > 0,
      `${location}.tasks must be non-empty`);
    let priorTaskID = null;
    const taskIDs = new Set();
    vehicle.tasks.forEach((task, taskIndex) => {
      const taskLocation = `${location}.tasks[${taskIndex}]`;
      assert(taskIDPattern.test(task.taskId || ''), `${taskLocation}.taskId is invalid`);
      assert(priorTaskID == null || compareText(priorTaskID, task.taskId) < 0,
        `${taskLocation}.taskId order is not canonical`);
      priorTaskID = task.taskId;
      assert(!taskIDs.has(task.taskId), `${taskLocation}.taskId is duplicated`);
      taskIDs.add(task.taskId);
      assert(typeof task.service === 'string' && task.service.trim(),
        `${taskLocation}.service is invalid`);
      assert(typeof task.category === 'string' && task.category.trim(),
        `${taskLocation}.category is invalid`);
      if (contract.taskIdMode === 'generated-from-service-label') {
        assert(stableTaskIDForLabel(task.service) === task.taskId,
          `${taskLocation}.taskId is not stable for its legacy service label`);
      }
    });
    scheduleRows += vehicle.tasks.length;
  });
  assert(scheduleRows === contract.scheduleRowCount,
    `release v${release.version} contract schedule row count mismatch`);
}

function reviewedExceptions(metadata) {
  const groups = metadata?.exceptions;
  assert(groups && typeof groups === 'object', 'transition exceptions are missing');
  const removedVehicles = new Map();
  const removedTaskIDs = new Map();
  const provenanceChanges = new Map();
  const taskSemanticChanges = new Map();

  const add = (map, key, value, location) => {
    assert(typeof value?.reason === 'string' && value.reason.trim(), `${location}.reason is required`);
    assert(!map.has(key), `${location} is duplicated`);
    map.set(key, { value, used: false });
  };
  assert(Array.isArray(groups.removedVehicles), 'transition removedVehicles must be an array');
  groups.removedVehicles.forEach((value, index) => {
    assert(typeof value.vehicleKey === 'string' && value.vehicleKey,
      `removedVehicles[${index}].vehicleKey is invalid`);
    add(removedVehicles, value.vehicleKey, value, `removedVehicles[${index}]`);
  });
  assert(Array.isArray(groups.removedTaskIds), 'transition removedTaskIds must be an array');
  groups.removedTaskIds.forEach((value, index) => {
    assert(typeof value.vehicleKey === 'string' && taskIDPattern.test(value.taskId || ''),
      `removedTaskIds[${index}] is invalid`);
    add(removedTaskIDs, `${value.vehicleKey}\u0000${value.taskId}`, value, `removedTaskIds[${index}]`);
  });
  assert(Array.isArray(groups.provenanceChanges), 'transition provenanceChanges must be an array');
  groups.provenanceChanges.forEach((value, index) => {
    assert(typeof value.vehicleKey === 'string'
      && ['generic', 'curated'].includes(value.from)
      && ['generic', 'curated'].includes(value.to)
      && value.from !== value.to,
    `provenanceChanges[${index}] is invalid`);
    add(provenanceChanges, value.vehicleKey, value, `provenanceChanges[${index}]`);
  });
  assert(Array.isArray(groups.taskSemanticChanges),
    'transition taskSemanticChanges must be an array');
  groups.taskSemanticChanges.forEach((value, index) => {
    const validMeaning = (meaning) => meaning
      && typeof meaning.service === 'string' && meaning.service.trim()
      && typeof meaning.category === 'string' && meaning.category.trim();
    assert(typeof value.vehicleKey === 'string' && value.vehicleKey
      && taskIDPattern.test(value.taskId || '')
      && validMeaning(value.from) && validMeaning(value.to)
      && (value.from.service !== value.to.service || value.from.category !== value.to.category),
    `taskSemanticChanges[${index}] is invalid`);
    add(taskSemanticChanges, `${value.vehicleKey}\u0000${value.taskId}`, value,
      `taskSemanticChanges[${index}]`);
  });
  return { removedVehicles, removedTaskIDs, provenanceChanges, taskSemanticChanges };
}

export function verifyReleaseTransition(previous, current, metadata) {
  assert(metadata?.schema === 1, 'transition schema must be 1');
  assert(metadata.fromVersion === previous.releaseVersion
    && metadata.toVersion === current.releaseVersion,
  'transition versions do not match adjacent releases');
  if (metadata.legacyGeneratedTaskIds) {
    assert(previous.taskIdMode === 'generated-from-service-label',
      'legacy bridge must start from generated task IDs');
    assert(current.taskIdMode === 'published',
      'legacy bridge must end with published task IDs');
  }

  const exceptions = reviewedExceptions(metadata);
  const currentByKey = new Map(current.vehicles.map((vehicle) => [vehicle.key, vehicle]));
  for (const oldVehicle of previous.vehicles) {
    const nextVehicle = currentByKey.get(oldVehicle.key);
    if (!nextVehicle) {
      const exception = exceptions.removedVehicles.get(oldVehicle.key);
      assert(exception, `vehicle removal requires reviewed transition metadata: ${oldVehicle.key}`);
      exception.used = true;
      continue;
    }
    if (oldVehicle.provenance !== nextVehicle.provenance) {
      const exception = exceptions.provenanceChanges.get(oldVehicle.key);
      assert(exception
        && exception.value.from === oldVehicle.provenance
        && exception.value.to === nextVehicle.provenance,
      `provenance change requires reviewed transition metadata: ${oldVehicle.key}`);
      exception.used = true;
    }
    const nextTasks = new Map(nextVehicle.tasks.map((task) => [task.taskId, task]));
    for (const oldTask of oldVehicle.tasks) {
      const nextTask = nextTasks.get(oldTask.taskId);
      if (!nextTask) {
        const exception = exceptions.removedTaskIDs.get(
          `${oldVehicle.key}\u0000${oldTask.taskId}`,
        );
        assert(exception,
          `task ID removal requires reviewed transition metadata: ${oldVehicle.key} ${oldTask.taskId}`);
        exception.used = true;
        continue;
      }
      if (oldTask.service !== nextTask.service || oldTask.category !== nextTask.category) {
        const exception = exceptions.taskSemanticChanges.get(
          `${oldVehicle.key}\u0000${oldTask.taskId}`,
        );
        assert(exception
          && exception.value.from.service === oldTask.service
          && exception.value.from.category === oldTask.category
          && exception.value.to.service === nextTask.service
          && exception.value.to.category === nextTask.category,
        `task semantic change requires reviewed transition metadata: ${oldVehicle.key} ${oldTask.taskId}`);
        exception.used = true;
      }
    }
    if (metadata.requireExactTaskSet) {
      assert(oldVehicle.tasks.length === nextVehicle.tasks.length,
        `legacy bridge task set changed: ${oldVehicle.key}`);
    }
  }

  if (metadata.requireExactVehicleSet) {
    assert(previous.vehicles.length === current.vehicles.length,
      'legacy bridge vehicle set changed');
  }
  for (const [groupName, group] of Object.entries(exceptions)) {
    for (const exception of group.values()) {
      assert(exception.used, `unused reviewed transition exception in ${groupName}`);
    }
  }
}

function verifyHistory(history) {
  assert(history?.schema === 1, 'release history schema must be 1');
  assert(Array.isArray(history.releases), 'release history releases must be an array');
  assert(history.releases.length === frozenReleaseHistory.length,
    'release history must exactly match the frozen append-only list');
  history.releases.forEach((release, index) => {
    const frozen = frozenReleaseHistory[index];
    for (const [field, expected] of Object.entries(frozen)) {
      assert(release[field] === expected,
        `release history mutation at index ${index}: ${field}`);
    }
    assert(Number.isSafeInteger(release.schema) && release.schema > 0,
      `release v${release.version} schema is invalid`);
    assert(Number.isSafeInteger(release.vehicleCount) && release.vehicleCount > 0,
      `release v${release.version} vehicleCount is invalid`);
    assert(typeof release.contract === 'string' && sha256Pattern.test(release.contractSha256 || ''),
      `release v${release.version} contract metadata is invalid`);
    if (index > 0) {
      const previous = history.releases[index - 1];
      assert(release.version === previous.version + 1,
        `release versions must be consecutive at v${release.version}`);
      assert(release.previousSha256 === previous.sha256,
        `release v${release.version} previousSha256 is invalid`);
      assert(typeof release.transition === 'string'
        && sha256Pattern.test(release.transitionSha256 || ''),
      `release v${release.version} transition metadata is invalid`);
    }
  });
}

function parseFixture(files, relativePath, expectedDigest, label) {
  const bytes = files.get(relativePath);
  assert(bytes, `${label} fixture is missing: ${relativePath}`);
  const actualDigest = sha256(bytes);
  assert(actualDigest === expectedDigest,
    `${label} fixture digest mismatch: expected=${expectedDigest} actual=${actualDigest}`);
  return JSON.parse(Buffer.from(bytes).toString('utf8'));
}

export function verifyVehicleRelease({ manifest, payloadBytes, history, files }) {
  verifyHistory(history);
  const payloadDigest = sha256(payloadBytes);
  const payload = JSON.parse(Buffer.from(payloadBytes).toString('utf8'));
  const currentRelease = history.releases.at(-1);

  assert(manifest.schema === currentRelease.schema, 'manifest schema does not match release history');
  assert(manifest.version === currentRelease.version, 'manifest version does not match release history');
  assert(manifest.vehicleCount === currentRelease.vehicleCount,
    'manifest vehicleCount does not match release history');
  assert(manifest.sha256 === currentRelease.sha256,
    'manifest sha256 does not match release history');
  assert(manifest.url === expectedPayloadURL, `unexpected payload URL: ${manifest.url}`);
  assert(sha256Pattern.test(manifest.sha256), 'manifest sha256 must be lowercase 64-hex');
  assert(payloadDigest === manifest.sha256,
    `payload sha256 mismatch: manifest=${manifest.sha256} actual=${payloadDigest}`);
  assert(payload.schema === manifest.schema, 'payload schema does not match manifest schema');
  assert(Array.isArray(payload.vehicles) && payload.vehicles.length === manifest.vehicleCount,
    'payload vehicle count does not match manifest');
  assert(typeof manifest.rvTasksUrl === 'string' && manifest.rvTasksUrl.startsWith('https://'),
    'rvTasksUrl must be HTTPS');
  assert(Number.isSafeInteger(manifest.rvTaskCount) && manifest.rvTaskCount > 0,
    'rvTaskCount must be a positive integer');

  const contracts = history.releases.map((release) => {
    const contract = parseFixture(files, release.contract, release.contractSha256,
      `release v${release.version} contract`);
    verifyContract(contract, release);
    return contract;
  });
  const derivedCurrent = buildReleaseContract(payload, {
    releaseVersion: currentRelease.version,
    legacyGeneratedTaskIDs: false,
  });
  assert(JSON.stringify(contracts.at(-1)) === JSON.stringify(derivedCurrent),
    `release v${currentRelease.version} contract does not match payload`);

  for (let index = 1; index < history.releases.length; index += 1) {
    const release = history.releases[index];
    const transition = parseFixture(files, release.transition, release.transitionSha256,
      `release v${release.version} transition`);
    verifyReleaseTransition(contracts[index - 1], contracts[index], transition);
  }

  return {
    schema: manifest.schema,
    version: manifest.version,
    vehicles: payload.vehicles.length,
    scheduleRows: derivedCurrent.scheduleRowCount,
    sha256: payloadDigest,
  };
}

function fixturePath(root, relativePath) {
  assert(typeof relativePath === 'string' && relativePath.startsWith('releases/')
    && !relativePath.split('/').includes('..'),
  `unsafe release fixture path: ${relativePath}`);
  const resolved = path.resolve(root, relativePath);
  assert(resolved.startsWith(`${path.resolve(root)}${path.sep}`),
    `release fixture escapes repository: ${relativePath}`);
  return resolved;
}

export function loadRepositoryInputs(root = defaultRoot) {
  const manifest = JSON.parse(readFileSync(path.join(root, 'vehicle-manifest.json'), 'utf8'));
  const payloadBytes = readFileSync(path.join(root, 'data/all-vehicles.json'));
  const history = JSON.parse(readFileSync(
    path.join(root, 'releases/vehicle-release-history.json'),
    'utf8',
  ));
  const files = new Map();
  history.releases.forEach((release) => {
    for (const relativePath of [release.contract, release.transition].filter(Boolean)) {
      if (!files.has(relativePath)) files.set(relativePath, readFileSync(fixturePath(root, relativePath)));
    }
  });
  return { manifest, payloadBytes, history, files };
}

export function verifyRepository(root = defaultRoot) {
  return verifyVehicleRelease(loadRepositoryInputs(root));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyRepository();
    console.log(
      `vehicle release OK: schema=${result.schema} version=${result.version} `
        + `vehicles=${result.vehicles} scheduleRows=${result.scheduleRows} sha256=${result.sha256}`,
    );
  } catch (error) {
    console.error(`vehicle release INVALID: ${error.message}`);
    process.exitCode = 1;
  }
}
