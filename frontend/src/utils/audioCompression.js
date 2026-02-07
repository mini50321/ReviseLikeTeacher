export async function compressAudio(audioBlob, maxSizeMB = 5) {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  
  if (audioBlob.size <= maxSizeBytes) {
    return audioBlob;
  }

  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const sampleRate = Math.min(audioBuffer.sampleRate, 16000);
    const numberOfChannels = 1;
    
    const offlineContext = new OfflineAudioContext(
      numberOfChannels,
      audioBuffer.length,
      sampleRate
    );
    
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    
    if (numberOfChannels !== audioBuffer.numberOfChannels) {
      const merger = offlineContext.createChannelMerger(1);
      source.connect(merger);
      merger.connect(offlineContext.destination);
    } else {
      source.connect(offlineContext.destination);
    }
    
    source.start(0);
    const renderedBuffer = await offlineContext.startRendering();
    
    const wav = audioBufferToWav(renderedBuffer);
    const compressedBlob = new Blob([wav], { type: 'audio/wav' });
    
    if (compressedBlob.size > maxSizeBytes) {
      console.warn('Compressed audio still exceeds max size, using original');
      return audioBlob;
    }
    
    return compressedBlob;
  } catch (error) {
    console.error('Audio compression failed:', error);
    return audioBlob;
  }
}

function audioBufferToWav(buffer) {
  const length = buffer.length;
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
  const view = new DataView(arrayBuffer);
  const samples = new Float32Array(length * numberOfChannels);
  
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      samples[i * numberOfChannels + channel] = channelData[i];
    }
  }
  
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * numberOfChannels * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * numberOfChannels * 2, true);
  
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }
  
  return arrayBuffer;
}

