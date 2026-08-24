import dialogueData from "./asshole-dialogue.json";

export type VoiceMode = "sarcastic" | "tactical" | "muted";
export type DialogueCategory =
  | "route_start"
  | "speed_warning"
  | "off_route"
  | "fuel_low"
  | "waypoint_arrival"
  | "turn_right"
  | "turn_left"
  | "turn_straight"
  | "turn_uturn"
  | "voice_test";

class AssholeVoiceEngine {
  private mode: VoiceMode = "sarcastic";
  private synth: SpeechSynthesis | null = null;
  private lastSpokenTime: number = 0;
  private cooldownMs: number = 3500;
  private unlocked: boolean = false;
  private voices: SpeechSynthesisVoice[] = [];

  constructor() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      this.synth = window.speechSynthesis;
      this.initVoices();
    }
  }

  private initVoices() {
    if (!this.synth) return;
    const populate = () => {
      this.voices = this.synth?.getVoices() || [];
    };
    populate();
    if (typeof this.synth.onvoiceschanged !== "undefined") {
      this.synth.onvoiceschanged = populate;
    }
  }

  public unlockSpeech() {
    if (!this.synth || this.unlocked) return;
    try {
      this.synth.resume();
      this.unlocked = true;
      console.log("[A.S.S.H.O.L.E. Voice] Speech engine unlocked via user gesture.");
    } catch (e) {
      console.warn("Speech unlock warning:", e);
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
    this.unlockSpeech();
    if (this.mode === "sarcastic") this.mode = "tactical";
    else if (this.mode === "tactical") this.mode = "muted";
    else this.mode = "sarcastic";

    const text = this.mode === "sarcastic"
      ? "A.S.S.H.O.L.E. mode active. Buckle up buttercup."
      : this.mode === "tactical"
      ? "Tactical navigation voice engaged."
      : "Voice audio muted.";

    this.speakRaw(text, true);
    return this.mode;
  }

  public trigger(category: DialogueCategory, customTacticalText?: string, forceImmediate = false) {
    if (this.mode === "muted" || !this.synth) return;

    const now = Date.now();
    if (!forceImmediate && now - this.lastSpokenTime < this.cooldownMs) {
      return;
    }

    let textToSpeak = "";
    if (this.mode === "sarcastic") {
      const lines = (dialogueData as any)[category] || [];
      if (lines.length > 0) {
        const randomIndex = Math.floor(Math.random() * lines.length);
        const sarcasticLine = lines[randomIndex];
        textToSpeak = customTacticalText ? `${customTacticalText} ${sarcasticLine}` : sarcasticLine;
      } else {
        textToSpeak = customTacticalText || "Attention driver.";
      }
    } else {
      textToSpeak = customTacticalText || this.getTacticalFallback(category);
    }

    this.speakRaw(textToSpeak, forceImmediate);
  }

  public speakRaw(text: string, force = false) {
    if (!this.synth || this.mode === "muted") return;

    this.unlockSpeech();

    if (this.synth.paused) {
      this.synth.resume();
    }

    // Chrome fix: cancel previous and schedule speech after short delay
    this.synth.cancel();

    setTimeout(() => {
      if (!this.synth) return;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = this.mode === "sarcastic" ? 0.95 : 1.0;
      utterance.pitch = this.mode === "sarcastic" ? 0.85 : 0.95; // Deeper cynical male tone
      utterance.volume = 1.0;

      // Auto-Detect & Select Male English Voice for A.S.S.H.O.L.E.
      const maleNames = ["male", "david", "daniel", "george", "mark", "guy", "ryan", "james", "aaron", "oliver", "rishi", "alex"];
      const maleVoice = this.voices.find((v) => {
        const name = v.name.toLowerCase();
        return (v.lang.startsWith("en") || v.lang.startsWith("en-US")) && maleNames.some((m) => name.includes(m));
      });

      const selectedVoice = maleVoice || this.voices.find((v) => v.lang.startsWith("en-US") || v.lang.startsWith("en"));
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      utterance.onstart = () => {
        console.log("[A.S.S.H.O.L.E. Voice] Speaking:", text);
      };

      utterance.onerror = (err) => {
        console.error("[A.S.S.H.O.L.E. Voice] Speech error:", err);
      };

      this.lastSpokenTime = Date.now();
      this.synth.speak(utterance);
    }, 60);
  }

  private getTacticalFallback(category: DialogueCategory): string {
    switch (category) {
      case "route_start": return "Expedition route guidance active.";
      case "speed_warning": return "Caution: Speed limit exceeded.";
      case "off_route": return "Off route. Recalculating path.";
      case "fuel_low": return "Fuel low. Refuel stop advised.";
      case "waypoint_arrival": return "Arriving at waypoint checkpoint.";
      case "turn_right": return "In 500 feet, turn right.";
      case "turn_left": return "In 500 feet, turn left.";
      case "turn_straight": return "Continue straight on route.";
      case "turn_uturn": return "Make a U-turn when safe.";
      case "voice_test": return "Tactical navigation speech test complete.";
      default: return "Attention driver.";
    }
  }
}

export const assholeVoice = new AssholeVoiceEngine();
