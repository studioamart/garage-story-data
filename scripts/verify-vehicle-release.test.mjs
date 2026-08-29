import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  loadRepositoryInputs,
  verifyReleaseTransition,
  verifyVehicleRelease,
} from './verify-vehicle-release.mjs';

function fixtures() {
  const inputs = loadRepositoryInputs();
  const releases = inputs.history.releases;
  const previous = JSON.parse(Buffer.from(inputs.files.get(releases[0].contract)).toString('utf8'));
  const current = JSON.parse(Buffer.from(inputs.files.get(releases[1].contract)).toString('utf8'));
  const transition = JSON.parse(
    Buffer.from(inputs.files.get(releases[1].transition)).toString('utf8'),
  );
  return { inputs, previous, current, transition };
}

test('the checked-in release, append-only history, and transition fixtures verify', () => {
  const { inputs } = fixtures();
  assert.deepEqual(verifyVehicleRelease(inputs), {
    schema: 3,
    version: 7,
    vehicles: 1424,
    scheduleRows: 12655,
    sha256: 'f9596f89a68156aa108ba8e8cbae96c551538969985a9d9b9de75c403047db82',
  });
});

test('mutation or removal of a frozen release-history entry fails', () => {
  const { inputs } = fixtures();
  const mutated = structuredClone(inputs.history);
  mutated.releases[0].sha256 = '0'.repeat(64);
  assert.throws(
    () => verifyVehicleRelease({ ...inputs, history: mutated }),
    /release history mutation at index 0/,
  );

  const shortened = structuredClone(inputs.history);
  shortened.releases.shift();
  assert.throws(
    () => verifyVehicleRelease({ ...inputs, history: shortened }),
    /exactly match the frozen append-only list/,
  );
});

test('rewriting an old contract and updating its mutable JSON hash still fails', () => {
  const { inputs } = fixtures();
  const history = structuredClone(inputs.history);
  const contractPath = history.releases[0].contract;
  const files = new Map(inputs.files);
  const rewritten = Buffer.concat([Buffer.from(files.get(contractPath)), Buffer.from(' ')]);
  files.set(contractPath, rewritten);
  history.releases[0].contractSha256 = createHash('sha256').update(rewritten).digest('hex');

  assert.throws(
    () => verifyVehicleRelease({ ...inputs, history, files }),
    /release history mutation at index 0: contractSha256/,
  );
});

test('v6-to-v7 task identity regression fails against the legacy bridge fixture', () => {
  const { previous, current, transition } = fixtures();
  const regressed = structuredClone(current);
  const target = regressed.vehicles.find((vehicle) => vehicle.tasks.length > 0);
  target.tasks.shift();
  regressed.scheduleRowCount -= 1;

  assert.throws(
    () => verifyReleaseTransition(previous, regressed, transition),
    /task ID removal requires reviewed transition metadata/,
  );
});

test('recycling a retained task ID for different service semantics fails', () => {
  const { previous, current, transition } = fixtures();
  const regressed = structuredClone(current);
  const target = regressed.vehicles.find((vehicle) => vehicle.tasks.length > 0);
  target.tasks[0].service = 'Unrelated Replacement Service';

  assert.throws(
    () => verifyReleaseTransition(previous, regressed, transition),
    /task semantic change requires reviewed transition metadata/,
  );
});

test('generic/curated provenance regression fails without reviewed transition metadata', () => {
  const { previous, current, transition } = fixtures();
  const regressed = structuredClone(current);
  const target = regressed.vehicles[0];
  target.provenance = target.provenance === 'generic' ? 'curated' : 'generic';

  assert.throws(
    () => verifyReleaseTransition(previous, regressed, transition),
    /provenance change requires reviewed transition metadata/,
  );
});

test('an explicit reasoned transition exception can authorize a provenance change', () => {
  const { previous, current, transition } = fixtures();
  const reviewed = structuredClone(transition);
  const changed = structuredClone(current);
  const target = changed.vehicles[0];
  const from = target.provenance;
  const to = from === 'generic' ? 'curated' : 'generic';
  target.provenance = to;
  reviewed.exceptions.provenanceChanges.push({
    vehicleKey: target.key,
    from,
    to,
    reason: 'Reviewed provenance correction for verifier regression coverage.',
  });

  assert.doesNotThrow(() => verifyReleaseTransition(previous, changed, reviewed));
});

test('an exact reasoned transition exception can authorize a task semantic correction', () => {
  const { previous, current, transition } = fixtures();
  const reviewed = structuredClone(transition);
  const changed = structuredClone(current);
  const target = changed.vehicles.find((vehicle) => vehicle.tasks.length > 0);
  const task = target.tasks[0];
  const from = { service: task.service, category: task.category };
  const to = { service: 'Reviewed Service Name', category: task.category };
  task.service = to.service;
  reviewed.exceptions.taskSemanticChanges.push({
    vehicleKey: target.key,
    taskId: task.taskId,
    from,
    to,
    reason: 'Reviewed task-name correction for verifier regression coverage.',
  });

  assert.doesNotThrow(() => verifyReleaseTransition(previous, changed, reviewed));
});
