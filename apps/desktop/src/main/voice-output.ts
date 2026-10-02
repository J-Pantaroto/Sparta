import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { VoiceDescriptor } from "@sparta/core";

export interface VoiceOutput {
  listVoices(): Promise<VoiceDescriptor[]>;
  speak(
    text: string,
    options: { volume: number; rate: number; voiceId: string | null }
  ): Promise<void>;
  cancel(): void;
}

const LIST_SCRIPT = String.raw`
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.GetInstalledVoices() | ForEach-Object {
  [PSCustomObject]@{ id = $_.VoiceInfo.Name; name = $_.VoiceInfo.Name; language = $_.VoiceInfo.Culture.Name }
} | ConvertTo-Json -Compress
`;

const SPEAK_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$inputJson = [Console]::In.ReadToEnd() | ConvertFrom-Json
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($inputJson.voiceId) { $s.SelectVoice([string]$inputJson.voiceId) }
$s.Volume = [Math]::Max(0, [Math]::Min(100, [int]$inputJson.volume))
$s.Rate = [Math]::Max(-10, [Math]::Min(10, [int]$inputJson.rate))
$s.Speak([string]$inputJson.text)
`;

type SpawnVoice = (script: string) => ChildProcessWithoutNullStreams;

function spawnPowerShell(script: string): ChildProcessWithoutNullStreams {
  return spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
}

function complete(child: ChildProcessWithoutNullStreams, input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `VOICE_EXIT_${code}`))
    );
    child.stdin.end(input);
  });
}

/** Voz offline do Windows; texto entra por stdin, nunca por interpolacao de comando. */
export class WindowsSpeechVoiceOutput implements VoiceOutput {
  private active: ChildProcessWithoutNullStreams | null = null;

  constructor(
    private readonly run: SpawnVoice = spawnPowerShell,
    private readonly platform: string = process.platform
  ) {}

  async listVoices(): Promise<VoiceDescriptor[]> {
    if (this.platform !== "win32") return [];
    try {
      const raw = await complete(this.run(LIST_SCRIPT));
      const value = JSON.parse(raw || "[]") as VoiceDescriptor | VoiceDescriptor[];
      const voices = Array.isArray(value) ? value : [value];
      return voices.filter(
        (voice) =>
          typeof voice.id === "string" &&
          typeof voice.name === "string" &&
          typeof voice.language === "string"
      );
    } catch {
      return [];
    }
  }

  async speak(
    text: string,
    options: { volume: number; rate: number; voiceId: string | null }
  ): Promise<void> {
    if (this.platform !== "win32" || !text || text.length > 500)
      throw new Error("VOICE_UNAVAILABLE");
    this.cancel();
    const child = this.run(SPEAK_SCRIPT);
    this.active = child;
    try {
      await complete(child, JSON.stringify({ text, ...options }));
    } finally {
      if (this.active === child) this.active = null;
    }
  }

  cancel(): void {
    this.active?.kill();
    this.active = null;
  }
}
