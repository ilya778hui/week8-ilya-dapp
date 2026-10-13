// web3.js и spl-token используют Node-овский Buffer — подкладываем его в браузер.
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
