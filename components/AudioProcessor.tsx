import { useEffect, useRef, useState } from 'react';
import { 
  useCallStateHooks,
  // StreamVideoParticipant,
  // hasAudio,
  // hasVideo,
} from '@stream-io/video-react-sdk';

const AudioProcessor = () => {
  const { useRemoteParticipants, useLocalParticipant } = useCallStateHooks();
  const remoteParticipants = useRemoteParticipants();
  const localParticipant = useLocalParticipant();
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioProcessorsRef = useRef<Map<string, { 
    sourceNode: MediaStreamAudioSourceNode, 
    processorNode: ScriptProcessorNode,
    analyserNode: AnalyserNode 
  }>>(new Map());
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  const addDebugLog = (message: string) => {
    console.log(message);
    setDebugInfo(prev => [...prev.slice(-20), `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  // Setup AudioContext and local audio processing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioContextRef.current = new AudioContext();
      addDebugLog('AudioContext created');

      // Process local participant's audio if available
      if (localParticipant && localParticipant.audioStream) {
        addDebugLog('Local participant audio detected');
        processAudioStream(
          localParticipant.audioStream, 
          localParticipant.sessionId, 
          'Local User',
          true
        );
      }
    }

    return () => {
      audioContextRef.current?.close();
      audioProcessorsRef.current.forEach(({ sourceNode, processorNode }) => {
        sourceNode.disconnect();
        processorNode.disconnect();
      });
      audioProcessorsRef.current.clear();
      addDebugLog('AudioContext cleaned up');
    };
  }, [localParticipant]);

  const processAudioStream = (
    stream: MediaStream,
    sessionId: string,
    participantName: string,
    isLocal: boolean = false
  ) => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    try {
      const sourceNode = audioContext.createMediaStreamSource(stream);
      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 2048;
      const processorNode = audioContext.createScriptProcessor(2048, 1, 1);

      sourceNode.connect(analyserNode);
      analyserNode.connect(processorNode);
      processorNode.connect(audioContext.destination);

      const dataArray = new Float32Array(analyserNode.frequencyBinCount);

      let lastLogTime = 0;
      const LOG_INTERVAL = 500;

      processorNode.onaudioprocess = (e) => {
        analyserNode.getFloatTimeDomainData(dataArray);
        
        const rms = Math.sqrt(
          dataArray.reduce((acc, val) => acc + val * val, 0) / dataArray.length
        );

        const now = Date.now();
        if (rms > 0.01 && now - lastLogTime > LOG_INTERVAL) {
          lastLogTime = now;
          console.log({
            type: isLocal ? 'Local Audio' : 'Remote Audio',
            participant: participantName,
            sessionId: sessionId,
            rmsLevel: rms.toFixed(4),
            timestamp: new Date().toLocaleTimeString(),
          });
        }
      };

      audioProcessorsRef.current.set(sessionId, { 
        sourceNode, 
        processorNode,
        analyserNode 
      });
      
      addDebugLog(`Set up audio processing for ${participantName}`);
    } catch (error) {
      console.error('Error processing audio:', error);
      // addDebugLog(`Error setting up ${participantName}: ${error.message}`);
    }
  };

  // Process remote participants
  useEffect(() => {
    remoteParticipants.forEach((participant) => {
      // First, log the participant's state
      addDebugLog(`Checking participant ${participant.name}:`);
      // addDebugLog(`- Has Audio: ${hasAudio(participant)}`);
      addDebugLog(`- Is Speaking: ${participant.isSpeaking}`);
      addDebugLog(`- Audio Level: ${participant.audioLevel}`);
      addDebugLog(`- Published Tracks: ${participant.publishedTracks.join(', ')}`);

      // Only process if the participant has audio enabled and a stream
      if (participant.audioStream) {
        if (!audioProcessorsRef.current.has(participant.sessionId)) {
          addDebugLog(`Setting up audio processing for ${participant.name}`);
          processAudioStream(
            participant.audioStream,
            participant.sessionId,
            participant.name
          );
        }
      } else {
        addDebugLog(`No audio available for ${participant.name}`);
      }
    });
  }, [remoteParticipants]);

  // Debug UI
  return (
    <div className="fixed bottom-0 right-0 max-h-96 w-96 overflow-y-auto bg-black/50 p-2 text-xs text-white">
      <div className="font-bold">Local Participant:</div>
      {localParticipant && (
        <div className="ml-2">
          <div>Name: {localParticipant.name}</div>
          {/* <div>Has Audio: {hasAudio(localParticipant) ? 'Yes' : 'No'}</div> */}
          <div>Is Speaking: {localParticipant.isSpeaking ? 'Yes' : 'No'}</div>
          <div>Audio Level: {localParticipant.audioLevel}</div>
        </div>
      )}
      
      <div className="mt-2 font-bold">Remote Participants ({remoteParticipants.length}):</div>
      {remoteParticipants.map(participant => (
        <div key={participant.sessionId} className="ml-2 mt-1">
          <div>{participant.name}</div>
          <div className="ml-2 opacity-70">
            {/* <div>Has Audio: {hasAudio(participant) ? 'Yes' : 'No'}</div> */}
            <div>Is Speaking: {participant.isSpeaking ? 'Yes' : 'No'}</div>
            <div>Audio Level: {participant.audioLevel}</div>
            <div>Tracks: {participant.publishedTracks.join(', ')}</div>
          </div>
        </div>
      ))}
      
      <div className="mt-2 font-bold">Debug Logs:</div>
      {debugInfo.map((log, index) => (
        <div key={index} className="opacity-70">{log}</div>
      ))}
    </div>
  );
};

export default AudioProcessor;