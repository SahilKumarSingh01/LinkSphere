export const MsgType = Object.freeze({
  // network flags (can OR with payload type)
  TCP: 0x00,        // MSB 0
  UDP: 0x80,        // MSB 1

  // control / input
  MOUSE_MOVE:   0x10,
  MOUSE_BUTTON: 0x11,
  MOUSE_SCROLL: 0x12,

  KEY_DOWN:     0x20,
  KEY_UP:       0x21,

  // system
  PING:         0x30,
  PONG:         0x31,
  ACK:          0x32,
  ERROR:        0x33,

  // discovery / meta
  DEVICE_HELLO: 0x40,
  DEVICE_INFO:  0x41,
  IP_ASSIGNED:  0x42,
  CAPABILITY:   0x43,

  // data
  TEXT:         0x50,
  JSON:         0x51,
  BINARY:       0x52,

  // audio
  AUDIO_PCM:    0x60,
  AUDIO_ENC:    0x61,

  // video
  VIDEO_FRAME:  0x70,
  VIDEO_ENC:    0x71,
});
