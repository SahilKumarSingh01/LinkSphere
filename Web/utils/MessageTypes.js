export const MsgType = Object.freeze({
  // -------------------
  // Control / Input
  // -------------------
  DISCOVERY : 10,
  MOUSE_MOVE:   0x10,
  MOUSE_BUTTON: 0x11,
  MOUSE_SCROLL: 0x12,

  KEY_DOWN:     0x20,
  KEY_UP:       0x21,

  // -------------------
  // System
  // -------------------
  PING:         0x30,
  PONG:         0x31,
  ACK:          0x32,
  ERROR:        0x33,

  // -------------------
  // Discovery / Meta
  // -------------------
  DEVICE_HELLO: 0x40,
  DEVICE_INFO:  0x41,
  IP_ASSIGNED:  0x42,
  CAPABILITY:   0x43,

  // -------------------
  // Data
  // -------------------
  TEXT:         0x50,
  JSON:         0x51,
  BINARY:       0x52,

  // -------------------
  // Audio
  // -------------------
  AUDIO_PCM:    0x60,
  AUDIO_ENC:    0x61,

  // -------------------
  // Video
  // -------------------
  VIDEO_FRAME:  0x70,
  VIDEO_ENC:    0x71,

  // -------------------
  // TCP / special types
  // -------------------
  // NOTE: Any type value greater than 127 is considered TCP.
  //       When extending MsgType, pick numbers > 127 for TCP messages
  TCP:    0x80,
  TCP_JSON:     0x81,
  TCP_BINARY:   0x82,
  TCP_AUDIO_PCM: 0x90,
  TCP_AUDIO_ENC: 0x91,
  TCP_VIDEO_FRAME: 0xA0,
  TCP_VIDEO_ENC: 0xA1,
  CAST_VOTE: 0xA2,
  CLINET_AUDIO:0xA3,
  AUDIO_MIX:0xA4,
});
