import { createServer } from "node:http";
import { classify } from "./mock-ai.mjs";
import { createHandler } from "./app.mjs";

createServer(createHandler({ classify })).listen(Number(process.env.PORT || 3000), "127.0.0.1");
