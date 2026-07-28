import { importOfficialPatchNotes, PatchImportError } from "./patch-import-service.js";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

export async function runPatchCli(persist: boolean): Promise<void> {
  const patch = argument("patch");
  const locale = argument("locale") ?? "pt_BR";
  if (!patch) {
    console.error(JSON.stringify({ status: "FAILED", code: "PATCH_REQUIRED" }));
    process.exitCode = 1;
    return;
  }
  try {
    const report = await importOfficialPatchNotes({ patch, locale, persist });
    console.log(
      JSON.stringify({ command: persist ? "patches:import" : "patches:check", ...report })
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        command: persist ? "patches:import" : "patches:check",
        patch,
        locale,
        status: "FAILED",
        code: error instanceof PatchImportError ? error.code : "PATCH_IMPORT_FAILED"
      })
    );
    process.exitCode = 1;
  }
}
