#!/usr/bin/env node
// Build the OTA manifest from the exact bytes that GitHub Pages serves.
//
//   node scripts/build-vehicle-manifest.mjs          # validate + write
//   node scripts/build-vehicle-manifest.mjs --check  # CI-safe drift check
//
// `version` and public URLs remain explicit release inputs in the existing
// manifest. Schema, counts, and SHA-256 are derived, so they cannot silently
// drift from the published payload.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'vehicle-manifest.json');
const vehiclePath = path.join(root, 'data/all-vehicles.json');
const SUPPORTED_SCHEMA = 3;
const MAX_PAYLOAD_CHARS = 8 * 1024 * 1024;
const MAX_VEHICLES = 5000;
const MAX_SCHEDULE_ITEMS = 100;
const TASK_ID_RE = /^[a-z][a-z0-9-]*:[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isInterval = (value) => value === null
  || (Number.isFinite(value) && Number.isInteger(value) && value >= 0);

function fail(pathName) {
  throw new Error(`Invalid vehicle payload: ${pathName}`);
}

function validateText(value, pathName, maxLength, { allowEmpty = false } = {}) {
  if (typeof value !== 'string'
    || (!allowEmpty && value.trim().length === 0)
    || value.length > maxLength) fail(pathName);
}

function validateCost(value, pathName) {
  if (!Array.isArray(value) || value.length !== 2
    || value.some((number) => !Number.isFinite(number) || number < 0)
    || value[0] > value[1]) fail(`${pathName}.estimatedCost`);
}

function validateVehiclePayload(data) {
  if (!isObject(data)) fail('root');
  if (data.schema !== SUPPORTED_SCHEMA) fail(`schema (expected ${SUPPORTED_SCHEMA})`);
  if (!Array.isArray(data.vehicles) || data.vehicles.length === 0
    || data.vehicles.length > MAX_VEHICLES) fail('vehicles');

  data.vehicles.forEach((vehicle, vehicleIndex) => {
    const vehiclePathName = `vehicles[${vehicleIndex}]`;
    if (!isObject(vehicle)) fail(vehiclePathName);
    validateText(vehicle.make, `${vehiclePathName}.make`, 120);
    validateText(vehicle.model, `${vehiclePathName}.model`, 120);
    validateText(vehicle.years, `${vehiclePathName}.years`, 40, { allowEmpty: true });
    if (vehicle.generation != null && typeof vehicle.generation !== 'string') {
      fail(`${vehiclePathName}.generation`);
    }
    if (typeof vehicle.generation === 'string' && vehicle.generation.length > 160) {
      fail(`${vehiclePathName}.generation`);
    }
    validateText(vehicle.vehicleType, `${vehiclePathName}.vehicleType`, 40);
    if (!Array.isArray(vehicle.schedule) || vehicle.schedule.length === 0
      || vehicle.schedule.length > MAX_SCHEDULE_ITEMS) {
      fail(`${vehiclePathName}.schedule`);
    }

    const taskIds = new Set();
    vehicle.schedule.forEach((entry, scheduleIndex) => {
      const entryPath = `${vehiclePathName}.schedule[${scheduleIndex}]`;
      if (!isObject(entry)) fail(entryPath);
      validateText(entry.taskId, `${entryPath}.taskId`, 96);
      if (!TASK_ID_RE.test(entry.taskId)) fail(`${entryPath}.taskId`);
      if (taskIds.has(entry.taskId)) fail(`${entryPath}.taskId duplicate`);
      taskIds.add(entry.taskId);
      validateText(entry.service, `${entryPath}.service`, 160);
      validateText(entry.category, `${entryPath}.category`, 80);
      validateText(entry.description, `${entryPath}.description`, 2000);
      validateCost(entry.estimatedCost, entryPath);
      if (!Object.prototype.hasOwnProperty.call(entry, 'mileInterval')
        && !Object.prototype.hasOwnProperty.call(entry, 'monthInterval')) {
        fail(`${entryPath}.interval`);
      }
      for (const field of ['mileInterval', 'monthInterval']) {
        if (Object.prototype.hasOwnProperty.call(entry, field) && !isInterval(entry[field])) {
          fail(`${entryPath}.${field}`);
        }
      }
    });
  });
}

const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const rawVehicles = fs.readFileSync(vehiclePath, 'utf8');
if (rawVehicles.length > MAX_PAYLOAD_CHARS) fail('payload too large');
const vehicles = JSON.parse(rawVehicles);
validateVehiclePayload(vehicles);

if (!Number.isSafeInteger(existing.version) || existing.version < 1) {
  throw new Error('vehicle-manifest.json needs a positive integer version');
}
if (!isText(existing.url) || !/^https:\/\//i.test(existing.url)) {
  throw new Error('vehicle-manifest.json needs an HTTPS url');
}

const manifest = {
  schema: vehicles.schema,
  version: existing.version,
  url: existing.url,
  sha256: createHash('sha256').update(rawVehicles, 'utf8').digest('hex'),
  vehicleCount: vehicles.vehicles.length,
};

const output = `${JSON.stringify(manifest, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const current = fs.readFileSync(manifestPath, 'utf8');
  if (current !== output) {
    console.error('vehicle-manifest.json is stale; run node scripts/build-vehicle-manifest.mjs');
    process.exitCode = 1;
  } else {
    console.log(`vehicle-manifest.json valid (${manifest.vehicleCount} vehicles, ${manifest.sha256})`);
  }
} else {
  fs.writeFileSync(manifestPath, output);
  console.log(`wrote vehicle-manifest.json (${manifest.vehicleCount} vehicles, ${manifest.sha256})`);
}
