export const BrowserCompatibility = {
  checkMediaRecorder: () => {
    return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported;
  },

  checkGetUserMedia: () => {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  },

  checkAudioContext: () => {
    return !!(window.AudioContext || window.webkitAudioContext);
  },

  getSupportedMimeType: () => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/wav'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'audio/webm';
  },

  checkAllFeatures: () => {
    return {
      mediaRecorder: BrowserCompatibility.checkMediaRecorder(),
      getUserMedia: BrowserCompatibility.checkGetUserMedia(),
      audioContext: BrowserCompatibility.checkAudioContext(),
      supportedMimeType: BrowserCompatibility.getSupportedMimeType(),
      isCompatible: BrowserCompatibility.checkMediaRecorder() && 
                   BrowserCompatibility.checkGetUserMedia()
    };
  },

  getBrowserInfo: () => {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    let version = 'Unknown';

    if (ua.indexOf('Chrome') > -1 && ua.indexOf('Edg') === -1) {
      browser = 'Chrome';
      const match = ua.match(/Chrome\/(\d+)/);
      version = match ? match[1] : 'Unknown';
    } else if (ua.indexOf('Firefox') > -1) {
      browser = 'Firefox';
      const match = ua.match(/Firefox\/(\d+)/);
      version = match ? match[1] : 'Unknown';
    } else if (ua.indexOf('Safari') > -1 && ua.indexOf('Chrome') === -1) {
      browser = 'Safari';
      const match = ua.match(/Version\/(\d+)/);
      version = match ? match[1] : 'Unknown';
    } else if (ua.indexOf('Edg') > -1) {
      browser = 'Edge';
      const match = ua.match(/Edg\/(\d+)/);
      version = match ? match[1] : 'Unknown';
    }

    return { browser, version };
  },

  getCompatibilityMessage: () => {
    const features = BrowserCompatibility.checkAllFeatures();
    const browserInfo = BrowserCompatibility.getBrowserInfo();

    if (!features.isCompatible) {
      return {
        compatible: false,
        message: `Your browser (${browserInfo.browser} ${browserInfo.version}) may not fully support voice recording. Please use Chrome, Firefox, or Edge for the best experience.`,
        canUseText: true
      };
    }

    if (!features.audioContext) {
      return {
        compatible: true,
        message: 'Voice recording is available, but audio visualization may not work in your browser.',
        canUseText: true
      };
    }

    return {
      compatible: true,
      message: 'Your browser fully supports all voice features.',
      canUseText: true
    };
  }
};

