import dialogueData from "./asshole-dialogue.json";

export type VoiceMode = "sarcastic" | "tactical" | "muted";

export type DialogueCategory = "route_start" | "speed_warning" | "off_route" | "fuel_low" | "waypoint_arrival" | "voice_test";

class AssholeVoiceEngine {
  private mode: VoiceMode = "sarcastic";
  private synth: SpeechSynthesis | null = null;
  private lastSpokenTime: number = 0;
  private cooldownMs: number = 6000; // Cooldown between automatic callouts

  constructor() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      this.synth = window.speechSynthesis;
    }
  }

  public setMode(mode: VoiceMode) {
    this.mode = mode;
    console.log(`[A.S.S.H.O.L.E. Voice] Mode set to: ${mode}`);
  }

  public getMode(): VoiceMode {
    return this.mode;
  }

  public toggleMode(): VoiceMode {
    if (this.mode === "sarcastic") this.mode = "tactical";
    else if (this.mode === "tactical") this.mode = "muted";
    else this.mode = "sarcastic";

    this.speakRaw(
      this.mode === "sarcastic"
        ? "A.S.S.H.O.L.E. mode active. Buckle up buttercup."
        : this.mode === "tactical"
        ? "Tactical navigation voice engaged."
        : "Voice audio muted."
    );

    return this.mode;
  }

  public trigger(category: DialogueCategory, customTacticalText?: string, forceImmediate = false) {
    if (this.mode === "muted" || !this.synth) return;

    const now = Date.now();
    if (!forceImmediate && now - this.lastSpokenTime < this.cooldownMs) {
      return; // Skip inside cooldown window
    }

    let textToSpeak = "";

    if (this.mode === "sarcastic") {
      const lines = dialogueData[category] || [];
      if (lines.length > 0) {
        const randomIndex = Math.floor(Math.random() * lines.length);
        textToSpeak = lines[randomIndex];
      } else {
        textToSpeak = customTacticalText || "Attention driver.";
      }
    } else {
      // Tactical mode: concise, professional
      textToSpeak = customTacticalText || this.getTacticalFallback(category);
    }

    this.speakRaw(textToSpeak);
  }

  public speakRaw(text: string) {
    if (!this.synth || this.mode === "muted") return;

    // Cancel existing queued speech
    this.synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this.mode === "sarcastic" ? 1.05 : 1.0;
    utterance.pitch = this.mode === "sarcastic" ? 0.9 : 1.0;

    // Find best English voice
    const voices = this.synth.getVoices();
    const engVoice = voices.find((v) => v.lang.startsWith("en"));
    if (engVoice) {
      utterance.voice = engVoice;
    }

    this.lastSpokenTime = Date.now();
    this.synth.speak(utterance);
  }

  private getTacticalFallback(category: DialogueCategory): string {
    switch (category) {
      case "route_start": return "Expedition route guidance active.";
      case "speed_warning": return "Caution: Speed limit exceeded.";
      case "off_route": return "Off route. Recalculating path.";
      case "fuel_low": return "Fuel low. Refuel stop advised.";
      case "waypoint_arrival": return "Arriving at waypoint checkpoint.";
      case "voice_test": return "Tactical navigation speech test complete.";
      default: return "Attention driver.";
    }
  }
}

export const assholeVoice = new AssholeVoiceEngine();
