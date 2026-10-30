/** Muting a track retains the WebRTC connection while preventing microphone audio transmission. */
export function setMicrophoneEnabled(
  stream: Pick<MediaStream, 'getAudioTracks'> | undefined,
  enabled: boolean,
) {
  stream?.getAudioTracks().forEach((track) => {
    track.enabled = enabled;
  });
}
