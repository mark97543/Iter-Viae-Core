export interface VoicePromptConfig {
  version: string;
  voice_pack_name: string;
  language: string;
  speech_rate: number;
  pitch: number;
  system_prompts: Record<string, { text: string; audio_file: string | null }>;
  navigation_maneuvers: Record<string, { text: string; audio_file: string | null }>;
  waypoint_prompts: Record<string, { text: string; audio_file: string | null }>;
  tactical_alerts: Record<string, { text: string; audio_file: string | null }>;
}

let activeConfig: VoicePromptConfig | null = null;
let isMuted = false;

export async function loadVoicePack(configUrl = '/voice_prompts.json'): Promise<VoicePromptConfig | null> {
  try {
    const res = await fetch(configUrl);
    if (res.ok) {
      activeConfig = await res.json();
      return activeConfig;
    }
  } catch (err) {
    console.warn("Failed to load voice pack, using default TTS", err);
  }
  return null;
}

export function setVoiceMuted(muted: boolean) {
  isMuted = muted;
  if (muted && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function isVoiceMuted(): boolean {
  return isMuted;
}

export function speakPrompt(
  category: 'system' | 'maneuver' | 'waypoint' | 'alert',
  key: string,
  placeholders: Record<string, string | number> = {}
) {
  if (isMuted) return;
  if (!('speechSynthesis' in window)) return;

  let textTemplate = "";

  if (activeConfig) {
    let group: Record<string, { text: string; audio_file: string | null }> | undefined;
    if (category === 'system') group = activeConfig.system_prompts;
    else if (category === 'maneuver') group = activeConfig.navigation_maneuvers;
    else if (category === 'waypoint') group = activeConfig.waypoint_prompts;
    else if (category === 'alert') group = activeConfig.tactical_alerts;

    if (group && group[key]) {
      textTemplate = group[key].text;
    }
  }

  if (!textTemplate) {
    textTemplate = key.replace(/_/g, ' ');
  }

  // Replace placeholders like {street_name}, {distance}, {waypoint_name}
  let finalSpokenText = textTemplate;
  for (const [k, v] of Object.entries(placeholders)) {
    finalSpokenText = finalSpokenText.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }

  window.speechSynthesis.cancel(); // Stop current speech before new callout
  const utterance = new SpeechSynthesisUtterance(finalSpokenText);
  if (activeConfig) {
    utterance.rate = activeConfig.speech_rate || 1.0;
    utterance.pitch = activeConfig.pitch || 0.95;
    utterance.lang = activeConfig.language || 'en-US';
  }
  window.speechSynthesis.speak(utterance);
}
