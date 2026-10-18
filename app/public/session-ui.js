export function sessionControls({active, connected, playerConnected, pendingJob}) {
  return {
    enableDisabled: !connected || active || playerConnected,
    localDisabled: !connected || !active,
    loadDisabled: !connected || !playerConnected || !!pendingJob,
    releaseHidden: !active,
    enableLabel: active ? 'Audio enabled here' : playerConnected ? 'Audio active elsewhere' : 'Enable audio device',
    hint: !connected
      ? 'Disconnected from the control server. Reconnect before enabling audio.'
      : active
        ? 'This tab is the audio player. Play, Stop, MIDI and Reset mix control this device. Release audio device before switching browsers.'
        : playerConnected
          ? 'Remote control mode: another browser tab owns audio. Song and track edits go to that player. To play here, close that tab or click Release audio device there, then Enable audio device here.'
          : 'No audio player is active. Click Enable audio device in the browser connected to your speakers and MIDI controller, then Play.',
  };
}
