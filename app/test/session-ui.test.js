import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionControls} from '../public/session-ui.js';

test('a second browser explains its remote role and can enable audio after the player releases', () => {
  const remote = sessionControls({active: false, connected: true, playerConnected: true});
  assert.equal(remote.enableDisabled, true);
  assert.equal(remote.localDisabled, true);
  assert.equal(remote.loadDisabled, false);
  assert.match(remote.hint, /another browser tab owns audio/);
  assert.equal(remote.enableLabel, 'Audio active elsewhere');
  const released = sessionControls({active: false, connected: true, playerConnected: false});
  assert.equal(released.enableDisabled, false);
  assert.equal(released.enableLabel, 'Enable audio device');
  const local = sessionControls({active: true, connected: true, playerConnected: true});
  assert.equal(local.localDisabled, false);
  assert.equal(local.releaseHidden, false);
  assert.match(local.hint, /This tab is the audio player/);
  const disconnected = sessionControls({active: false, connected: false, playerConnected: false});
  assert.equal(disconnected.enableDisabled, true);
  assert.equal(disconnected.localDisabled, true);
  assert.equal(disconnected.loadDisabled, true);
  assert.equal(disconnected.releaseHidden, true);
});
