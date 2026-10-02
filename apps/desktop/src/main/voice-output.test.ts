import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { WindowsSpeechVoiceOutput } from "./voice-output";

function childProcess(
  onInput: (
    input: string,
    child: EventEmitter & { stdout: PassThrough; stderr: PassThrough }
  ) => void
) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let input = "";
  child.stdin.setEncoding("utf8").on("data", (chunk) => (input += chunk));
  child.stdin.on("finish", () => onInput(input, child));
  child.kill = vi.fn(() => {
    void Promise.resolve().then(() => child.emit("close", 1));
    return true;
  });
  return child as unknown as ChildProcessWithoutNullStreams;
}

describe("WindowsSpeechVoiceOutput", () => {
  it("lista vozes e envia texto somente por stdin JSON, sem interpolar comando", async () => {
    const scripts: string[] = [];
    const inputs: string[] = [];
    const run = vi.fn((script: string) => {
      scripts.push(script);
      return childProcess((input, child) => {
        inputs.push(input);
        if (script.includes("GetInstalledVoices")) {
          child.stdout.write(JSON.stringify([{ id: "Maria", name: "Maria", language: "pt-BR" }]));
        }
        void Promise.resolve().then(() => child.emit("close", 0));
      });
    });
    const voice = new WindowsSpeechVoiceOutput(run, "win32");
    expect(await voice.listVoices()).toEqual([{ id: "Maria", name: "Maria", language: "pt-BR" }]);
    const text = "Uma opção segura; $(não executar) ' \"";
    await voice.speak(text, { volume: 70, rate: 0, voiceId: "Maria" });
    expect(scripts.every((script) => !script.includes(text))).toBe(true);
    expect(JSON.parse(inputs.at(-1) ?? "{}")).toEqual({
      text,
      volume: 70,
      rate: 0,
      voiceId: "Maria"
    });
  });

  it("cancela a fala ativa", async () => {
    let active: ChildProcessWithoutNullStreams | null = null;
    const voice = new WindowsSpeechVoiceOutput(() => {
      active = childProcess(() => undefined);
      return active;
    }, "win32");
    const speaking = voice.speak("Teste", { volume: 50, rate: 0, voiceId: null });
    voice.cancel();
    await expect(speaking).rejects.toThrow("VOICE_EXIT_1");
    expect(active).not.toBeNull();
    expect(active!.kill).toHaveBeenCalled();
  });
});
