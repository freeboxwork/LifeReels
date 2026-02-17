import path from "node:path";
import { Config } from "@remotion/cli/config";

// Only expose the downloaded assets folder as "public dir" to avoid copying the whole repo.
// This makes `staticFile("s_1.png")` / `staticFile("Narr_S_1.mp3")` work.
Config.setPublicDir(path.join(process.cwd(), "..", "SampleResource"));
